import {mkdir, copyFile, readdir, readFile, unlink} from 'node:fs/promises';
const root = new URL('../', import.meta.url), output = new URL('public/', root);
export const assets = ['index.html','style.css','shared-app.js','http-repository.js','domain.js','landing.html','landing.js'];
await mkdir(output, {recursive:true});
// Reject unexpected content instead of accidentally publishing project files or deleting user files.
for (const entry of await readdir(output)) {
  if (assets.includes(entry)) continue;
  if (['app.js','repository.js'].includes(entry) && (await readFile(new URL(entry,output))).equals(await readFile(new URL(entry,root)))) { await unlink(new URL(entry,output)); continue; }
  throw Error('publicに許可されないファイルがあります。確認してから再実行してください。');
}
for (const file of assets) await copyFile(new URL(file, root), new URL(file, output));
console.log('Built 7 allowlisted static assets. No DB, docs, tests, or server source copied.');
