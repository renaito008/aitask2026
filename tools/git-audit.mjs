import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export function gitExecutable() {
  const candidates=[process.env.GIT_EXECUTABLE,'git',path.join(process.env.USERPROFILE??'', '.cache','codex-runtimes','codex-primary-runtime','dependencies','native','git','cmd','git.exe')].filter(Boolean);
  for(const executable of candidates){const result=spawnSync(executable,['--version'],{encoding:'utf8',stdio:'pipe'});if(!result.error&&result.status===0)return executable;}
  throw Error('Gitを利用できません。Gitを準備してから候補ファイルを監査してください。');
}
export function git(args,input,folder=root){
  const result=spawnSync(gitExecutable(),['-c','safe.directory='+folder,...args],{cwd:folder,input,encoding:'utf8',stdio:'pipe',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
  if(result.status!==0&&!(args.includes('check-ignore')&&result.status===1))throw Error('ローカルGit検証に失敗しました。リポジトリとファイル権限を確認してください。');
  return result.stdout;
}
export function contentProblems(relative,bytes) {
  const result=[];const name=relative.replaceAll('\\','/');
  const envExample=['.env.example','.dev.vars.example'].includes(name);
  if(!envExample&&/(^|\/)(?:data|exports|private-exports|backups?|node_modules|\.wrangler|reports?|screenshots|telemetry)(\/|$)|(^|\/)\.env(?:\.|$)|(^|\/)\.dev\.vars(?:\.|$)|\.(?:sqlite3?|db3?)(?:-wal|-shm)?$|(?:-wal|-shm|\.wal|\.shm)$|\.(?:pem|key|p8|p12|pfx|jks|log)$|(^|\/)\.npmrc$/i.test(name))result.push('private-or-generated-path');
  const text=bytes.toString('utf8');
  const signatures=[
    ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
    ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{30,})\b/],
    ['credential-assignment',/(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN|GITHUB_TOKEN|GH_TOKEN)\s*[:=]\s*["']?[A-Za-z0-9_=-]{20,}/],
    ['literal-room-link',/\/room#[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/],
    ['sqlite-binary',/^SQLite format 3\u0000/]
  ];
  for(const [kind,pattern] of signatures)if(pattern.test(text))result.push(kind);
  if(/\.(json|sql)$/i.test(name)&&(/"format"\s*:\s*"task2026-rooms-v1"/.test(text)||(/"memberName"\s*:/.test(text)&&/"goals"\s*:/.test(text))))result.push('possible-business-data');
  return result;
}
export function auditRepository(folder=root){
  try{git(['rev-parse','--is-inside-work-tree'],undefined,folder);}catch{throw Error('Gitが未初期化、またはアクセスできません。利用者がプロジェクト内でgit init（ローカル操作のみ）を行ってから再実行してください。');}
  const files=[...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z'],undefined,folder).split('\0').filter(Boolean))].sort();
  const violations=[];
  for(const relative of files){const full=path.join(folder,relative);const stat=fs.lstatSync(full);if(stat.isSymbolicLink()){violations.push({path:relative,kind:'symlink-requires-review'});continue;}if(!stat.isFile())continue;for(const kind of contentProblems(relative,fs.readFileSync(full)))violations.push({path:relative,kind});}
  const fixtures=['.env','.env.production','.dev.vars','.dev.vars.preview','data/private.sqlite','private-exports/rooms.rooms-export.sql','backup/code.js','backups/code.js','task2026-code-backup-example/code.js','sample.db','sample.sqlite3-wal','sample.sqlite-shm','secret.key','secret.pem','task2026-repair.zip','reports/report.json','screenshots/result.png','node_modules/x.js','.wrangler/state/db.sqlite'];
  const ignored=git(['check-ignore','--no-index','--stdin'],fixtures.join('\n')+'\n',folder).trim().split(/\r?\n/).filter(Boolean);
  for(const name of fixtures)if(!ignored.includes(name))violations.push({path:name,kind:'ignore-rule-missing'});
  const safe=['schema.sql','tests/worker.test.mjs','worker/entry.js','package-lock.json','wrangler.jsonc','apply-update.ps1','.env.example','.dev.vars.example'];
  const overIgnored=git(['check-ignore','--no-index','--stdin'],safe.join('\n')+'\n',folder).trim().split(/\r?\n/).filter(Boolean);
  for(const name of overIgnored)violations.push({path:name,kind:'required-source-ignored'});
  return {scope:'local Git candidates; no remote/push',candidateCount:files.length,files,ignoredFixtureCount:ignored.length,violations};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const report=auditRepository();const output=new URL('../reports/',import.meta.url);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(new URL('git-audit.json',output),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({candidateCount:report.candidateCount,ignoredFixtureCount:report.ignoredFixtureCount,violations:report.violations,report:'reports/git-audit.json',remoteOperations:0}));if(report.violations.length)process.exitCode=1;}catch(error){console.error(error.message);process.exitCode=1;}
}
