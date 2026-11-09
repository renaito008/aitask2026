param([string]$Target = 'C:\ESD\ai\task2026')
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$targetRoot = [IO.Path]::GetFullPath($Target).TrimEnd([IO.Path]::DirectorySeparatorChar)
if ($sourceRoot -eq $targetRoot) { throw '展開先と適用先を別フォルダにしてください。' }
if (-not (Test-Path -LiteralPath $targetRoot -PathType Container)) { throw '既存プロジェクトのフォルダを指定してください。' }
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'update-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.format -ne 'task2026-code-update-v1') { throw '変更一覧の形式が不正です。' }
function Safe-Path([string]$Base, [string]$Relative) {
    if ([IO.Path]::IsPathRooted($Relative) -or $Relative -match '(^|[\\/])\.\.([\\/]|$)' -or $Relative -match '^(data|private-exports|node_modules|\.git|\.wrangler)([\\/]|$)') { throw '許可されない適用パスです。' }
    $full = [IO.Path]::GetFullPath((Join-Path $Base $Relative))
    if (-not $full.StartsWith($Base + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '適用先が範囲外です。' }
    $current = $full
    while ($current -and $current.Length -ge $Base.Length) {
        if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'シンボリックリンクやジャンクションの下には適用しません。' }
        if ($current -eq $Base) { break }
        $current = Split-Path $current -Parent
    }
    return $full
}
function Hash-File([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
# Complete validation happens before any target write. DB/data are never enumerated or opened.
foreach ($item in $manifest.files) {
    $source = Safe-Path $sourceRoot $item.path
    $destination = Safe-Path $targetRoot $item.path
    if ((Hash-File $source) -ne $item.newHash) { throw ('配布元のハッシュ不一致: ' + $item.path) }
    if (Test-Path -LiteralPath $destination) {
        if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) { throw ('同名ディレクトリがあります: ' + $item.path) }
        $actual = Hash-File $destination
        if ($actual -ne $item.newHash -and $actual -ne $item.oldHash) { throw ('正本に予期しない変更があります。適用を中止: ' + $item.path) }
    } elseif ($null -ne $item.oldHash) { throw ('既存コードが見つかりません。適用を中止: ' + $item.path) }
}
$pending = @($manifest.files | Where-Object {
    $dest = Safe-Path $targetRoot $_.path
    -not (Test-Path -LiteralPath $dest) -or (Hash-File $dest) -ne $_.newHash
})
if ($pending.Count -eq 0) { Write-Host '適用済みです。DBは操作していません。'; exit 0 }
$backupRoot = Join-Path (Split-Path $targetRoot -Parent) ((Split-Path $targetRoot -Leaf) + '-code-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
$backedUp = @()
try {
    New-Item -ItemType Directory -Path $backupRoot | Out-Null
    foreach ($item in $pending) {
        $dest = Safe-Path $targetRoot $item.path
        if (Test-Path -LiteralPath $dest) {
            $backup = Safe-Path $backupRoot $item.path
            New-Item -ItemType Directory -Path (Split-Path $backup -Parent) -Force | Out-Null
            Copy-Item -LiteralPath $dest -Destination $backup
            $backedUp += $item.path
        }
    }
    foreach ($item in $pending) {
        $source = Safe-Path $sourceRoot $item.path
        $dest = Safe-Path $targetRoot $item.path
        New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $source -Destination $dest -Force
        if ((Hash-File $dest) -ne $item.newHash) { throw ('コピー後の確認に失敗: ' + $item.path) }
    }
    Write-Host ('コードを適用しました。バックアップ: ' + $backupRoot)
    Write-Host 'data/DB・デプロイ・リモート操作は一切実行していません。'
} catch {
    foreach ($relative in $backedUp) {
        Copy-Item -LiteralPath (Safe-Path $backupRoot $relative) -Destination (Safe-Path $targetRoot $relative) -Force
    }
    throw ('失敗のため既存コードをバックアップから復元しました。新規追加ファイルが残る場合があります。' + $_.Exception.Message)
}
