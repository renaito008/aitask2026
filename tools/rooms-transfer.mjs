import {validate} from '../domain.js';

const conflictClause = ' ON CONFLICT(id) DO UPDATE SET state=NULL WHERE rooms.state<>excluded.state OR rooms.edit_hash<>excluded.edit_hash OR rooms.view_hash<>excluded.view_hash';
// Same ID + identical 4 values: WHERE false => no update. Any mismatch: NOT NULL failure.
// A single SQL statement is atomic; never chunk these statements or use REPLACE/IGNORE.
export function validateRows(rows) {
  if (!Array.isArray(rows)) throw Error('roomsの配列が必要です。');
  const ids = new Set(), hashes = new Set();
  for (const row of rows) {
    if (!row || Object.keys(row).sort().join(',') !== 'edit_hash,id,state,view_hash' || typeof row.id !== 'string' || !row.id || row.id.includes('\0') || typeof row.state !== 'string' || !/^[a-f0-9]{64}$/.test(row.edit_hash) || !/^[a-f0-9]{64}$/.test(row.view_hash)) throw Error('roomsの4カラムとハッシュ形式を確認してください。');
    if (ids.has(row.id) || hashes.has(row.edit_hash) || hashes.has(row.view_hash) || row.edit_hash === row.view_hash) throw Error('IDまたはリンクハッシュが重複しています。');
    ids.add(row.id); hashes.add(row.edit_hash); hashes.add(row.view_hash);
    const state = JSON.parse(row.state); validate(state);
    const inspect = value => { if (!value || typeof value !== 'object') return; for (const [key, item] of Object.entries(value)) { if (/token|authorization|secret/i.test(key)) throw Error('stateに秘密情報らしい項目があります。手動確認が必要です。'); inspect(item); } };
    inspect(state);
  }
  return rows;
}
export function importStatement(rows) {
  validateRows(rows);
  if (!rows.length) return {sql:'SELECT 1;', values:[]};
  return {sql:'INSERT INTO rooms(id,state,edit_hash,view_hash) VALUES '+rows.map(()=>'(?,?,?,?)').join(',')+conflictClause, values:rows.flatMap(row=>[row.id,row.state,row.edit_hash,row.view_hash])};
}
export function sqlExport(rows) {
  const {sql, values} = importStatement(rows);
  let index = 0;
  const result = sql.replaceAll('?', () => "'" + values[index++].replaceAll("'", "''") + "'");
  if (new TextEncoder().encode(result).byteLength > 90000) throw Error('安全な単一SQLサイズ上限を超えました。大きなJSONの移行は未対応です。別途設計を確認し、分割実行しないでください。');
  return '-- PRIVATE migration data. Single atomic statement; no BEGIN/COMMIT.\n'+result+';\n';
}
