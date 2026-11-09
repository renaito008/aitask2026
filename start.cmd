@echo off
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel% equ 0 (
  node -e "require('node:sqlite').DatabaseSync" >nul 2>nul
  if not errorlevel 1 (
    node server.mjs
    goto done
  )
)
if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
  "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.mjs
) else (
  echo Node.js with node:sqlite is required. Node.js 24.22.1 was tested.
)
:done
pause
