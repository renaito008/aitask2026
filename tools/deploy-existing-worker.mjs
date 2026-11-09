// Manual helper only. Without --deploy, this performs local checks and NO network operation.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {prepareRelease} from './prepare-release.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
try{
  if(process.argv.slice(2).some(value=>value!=='--deploy'))throw Error('引数は省略または--deployだけです。');
  await prepareRelease();
  if(!process.argv.includes('--deploy'))console.log('準備のみ完了。公開する場合だけ--deployを明示してください。');
  else {
    const config=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));
    const db=config.d1_databases?.find(value=>value.binding==='DB');
    if(config.name!=='task-management-api'||db?.database_name!=='task-management-db'||db?.database_id!=='81918d83-4f0e-4827-baa6-042b890efeeb')throw Error('既存Worker/D1の指定が変わっています。停止しました。');
    const cli=path.join(root,'node_modules/wrangler/bin/wrangler.js');
    if(!fs.existsSync(cli))throw Error('固定lockに従ってnpm ciし、Wrangler認証と実ローカル確認を先に完了してください。');
    const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));
    const installed=JSON.parse(fs.readFileSync(path.join(root,'node_modules/wrangler/package.json'),'utf8'));
    if(installed.version!==lock.packages?.['node_modules/wrangler']?.version)throw Error('インストール済みWranglerと固定lockが一致しません。npm ciを確認してください。');
    // No d1 execute, database create, migration, deletion, Git remote, or GitHub call is made.
    const result=spawnSync(process.execPath,[cli,'deploy','--config','wrangler.jsonc'],{cwd:root,stdio:'inherit',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
    if(result.status!==0)throw Error('Wranglerデプロイが完了しませんでした。認証・権限・接続を確認してください。');
  }
}catch(error){console.error(error.message);process.exitCode=1;}
