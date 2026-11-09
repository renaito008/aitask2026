// Local packaging only. Reads the protected baseline; never writes to it or opens its data directory.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const baseline=path.resolve(process.argv[2]??'C:/ESD/ai/task2026');
const exclude=new Set(['data','node_modules','.git','.wrangler','private-exports','exports','backup','backups','reports','report','screenshots','logs','telemetry','coverage','release-artifacts','.npmrc','worker-update.zip','update-manifest.json','SOURCE-CHANGES.md']);
const files=[];
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  if(exclude.has(entry.name)||/-code-backup-/i.test(entry.name)||/^\.env($|\.)|^\.dev\.vars($|\.)/i.test(entry.name)||/\.rooms-export\.(json|sql)$|\.zip$|\.log$|\.(sqlite3?|db3?)(-wal|-shm)?$|\.(pem|key|p8|p12|pfx|jks)$/i.test(entry.name))continue;
  const full=path.join(folder,entry.name);
  if(entry.isDirectory())walk(full);
  else if(entry.isFile()){
    const relative=path.relative(root,full).split(path.sep).join('/');const old=path.join(baseline,relative);
    const newHash=hash(full),oldHash=fs.existsSync(old)?hash(old):null;
    files.push({path:relative,oldHash,newHash});
  }
}}
walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
fs.writeFileSync(path.join(root,'update-manifest.json'),JSON.stringify({format:'task2026-code-update-v1',baseline,files},null,2)+'\n','utf8');
const changes=files.filter(file=>file.newHash!==file.oldHash);
fs.writeFileSync(path.join(root,'SOURCE-CHANGES.md'),'# 正本へ適用するコード変更一覧\n\n元DB・個人データは含みません。元のdataフォルダには触れません。\n\n展開先は正本とは別のフォルダにし、内容確認後に次を手動実行します。\n\n`powershell -File .\\apply-update.ps1 -Target "C:\\ESD\\ai\\task2026"`\n\n全ファイルの事前ハッシュを確認し、予期しない変更があれば停止します。上書きする既存コードは正本の隣にバックアップし、DB移行やデプロイは実行しません。既存コードのコピー失敗時はバックアップから復元します。新規追加ファイルが残る可能性はあります。\n\n| 区分 | パス |\n|---|---|\n'+changes.map(file=>'| '+(file.oldHash?'変更':'追加')+' | '+file.path+' |').join('\n')+'\n','utf8');
console.log(JSON.stringify({compared:files.length,changed:changes.length,protectedOriginalWritten:false,privateDataIncluded:false}));
