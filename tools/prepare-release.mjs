import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {auditRepository} from './git-audit.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
function run(args){const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});if(result.status!==0)throw Error('ローカル検証が失敗しました。デプロイは実行していません。');}
export async function prepareRelease(){
  run(['tools/check-deployment-config.mjs']);
  run(['tools/build-assets.mjs']);
  const entry=await import('../worker/entry.js');
  if(Object.keys(entry).join(',')!=='default'||typeof entry.default.fetch!=='function')throw Error('Worker entryはdefault handlerだけを公開する必要があります。');
  const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
  const versions=Object.fromEntries(['wrangler','esbuild','workerd'].map(name=>[name,lock.packages?.['node_modules/'+name]?.version]));
  if(!versions.wrangler?.startsWith('4.')||!versions.esbuild||!versions.workerd)throw Error('Wrangler4を固定したpackage-lock.jsonを確認してください。');
  for(const name of ['esbuild','workerd'])if(pkg.allowScripts?.[name+'@'+versions[name]]!==true)throw Error('allowScriptsと固定lockのビルド依存バージョンが一致していません。');
  run(['--test',...fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.mjs')).map(name=>'tests/'+name)]);
  const assets=['index.html','style.css','app.js','shared-app.js','http-repository.js','domain.js','repository.js','landing.html','landing.js'];
  const output=fs.readdirSync(path.join(root,'public')).sort();if(JSON.stringify(output)!==JSON.stringify([...assets].sort()))throw Error('publicの内容がホワイトリストと一致しません。');
  const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  for(const name of assets)if(sha(path.join(root,name))!==sha(path.join(root,'public',name)))throw Error('公開資産が元ファイルと一致しません。');
  const audit=auditRepository(root);if(audit.violations.length){console.error(JSON.stringify(audit.violations));throw Error('Git候補に確認が必要なファイルがあります。値は出力していません。');}
  fs.mkdirSync(path.join(root,'reports'),{recursive:true});fs.writeFileSync(path.join(root,'reports/release-readiness.json'),JSON.stringify({versions,publicAssets:assets,gitAudit:audit,remoteOperations:0},null,2)+'\n');
  console.log('Prepared locally: tests, default-only entry, locked allowScripts, public bytes, and Git candidates verified. No install, push, migration, or deployment performed.');
  return {versions,candidateCount:audit.candidateCount};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))prepareRelease().catch(error=>{console.error(error.message);process.exitCode=1;});
