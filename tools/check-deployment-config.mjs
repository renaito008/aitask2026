import {readFile} from 'node:fs/promises';
const text = await readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8');
const settings = JSON.parse(text);
const db = settings.d1_databases?.find(entry=>entry.binding==='DB');
if (!db || /REPLACE|configure-before-deploy/i.test(settings.name??'') || /REPLACE/i.test(db.database_name??'') || !/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(db.database_id??'') || /^0{8}-/.test(db.database_id)) {
  console.error('停止: 既存Worker名・既存D1名・database_idをwrangler.jsoncへ設定してください。デプロイ/リモート操作は実行していません。');
  process.exitCode=1;
} else console.log('Required identifiers configured. This check does not deploy or modify any database; complete real local validation and Cloudflare authentication first.');
