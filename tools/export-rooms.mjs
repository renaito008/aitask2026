import {DatabaseSync} from 'node:sqlite';
import {writeFile, mkdir} from 'node:fs/promises';
import path, {resolve, dirname, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRows, sqlExport} from './rooms-transfer.mjs';

export function isInsideDirectory(base, candidate, paths=path) {
  const rel=paths.relative(paths.resolve(base),paths.resolve(candidate));
  return rel==='' || (!rel.startsWith('..'+paths.sep) && rel!=='..' && !paths.isAbsolute(rel));
}
export function checkOutputPaths(sourcePath, outputPath) {
  const publicPath=fileURLToPath(new URL('../public/',import.meta.url));
  if (isInsideDirectory(publicPath,outputPath) || resolve(sourcePath)===resolve(outputPath) || resolve(sourcePath)===resolve(outputPath.replace(/\.json$/,'.sql'))) throw Error('出力先を元DBやpublic配下にしないでください。');
}

export function readRoomsReadonly(filename) {
  const db = new DatabaseSync(filename, {readOnly:true});
  try {
    const info = db.prepare('PRAGMA table_info(rooms)').all();
    const columns = info.map(row=>row.name).sort().join(',');
    if (columns !== 'edit_hash,id,state,view_hash') throw Error('既存roomsの4カラムを確認してください。DBは変更していません。');
    if (!info.find(row=>row.name==='id'&&row.pk===1) || ['state','edit_hash','view_hash'].some(name=>!info.find(row=>row.name===name&&row.notnull===1))) throw Error('既存roomsのPRIMARY KEY/NOT NULLを確認してください。');
    return validateRows(db.prepare('SELECT id,state,edit_hash,view_hash FROM rooms ORDER BY id').all().map(row=>({...row})));
  } finally { db.close(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [source, output] = process.argv.slice(2);
  if (!source || !output || !output.endsWith('.json')) { console.error('Usage: node tools/export-rooms.mjs READ_ONLY_SOURCE.sqlite PRIVATE_OUTPUT.json'); process.exitCode=1; }
  else {
    try {
      const sourcePath=resolve(source), outputPath=resolve(output);
      checkOutputPaths(sourcePath,outputPath);
      const rows=readRoomsReadonly(sourcePath);
      const json=JSON.stringify({format:'task2026-rooms-v1',columns:['id','state','edit_hash','view_hash'],rows},null,2)+'\n';
      let sql; try { sql=sqlExport(rows); } catch { /* Larger exports stay JSON only; no unsafe partial SQL. */ }
      await mkdir(dirname(outputPath),{recursive:true});
      await writeFile(outputPath,json,{encoding:'utf8',flag:'wx',mode:0o600});
      if(sql) await writeFile(outputPath.replace(/\.json$/,'.sql'),sql,{encoding:'utf8',flag:'wx',mode:0o600});
      console.log('Read-only export completed. Private files contain state data and hashed links only. Remote DB was not accessed.');
      if(!sql) console.log('SQL not created: export exceeds single-statement limit. Large JSON import is not supported. Do not split; design a safe migration separately.');
    } catch { console.error('Export stopped. Confirm source schema, output permissions, and that output files do not already exist. No remote DB was accessed.'); process.exitCode=1; }
  }
}
