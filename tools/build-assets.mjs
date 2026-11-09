import {mkdir, copyFile, readdir} from 'node:fs/promises';
const root = new URL('../', import.meta.url), output = new URL('public/', root);
export const assets = ['index.html','style.css','app.js','shared-app.js','http-repository.js','domain.js','repository.js','landing.html','landing.js'];
await mkdir(output, {recursive:true});
// Reject unexpected content instead of accidentally publishing project files or deleting user files.
for (const entry of await readdir(output)) if (!assets.includes(entry)) throw Error('publicに許可されないファイルがあります。確認してから再実行してください。');
for (const file of assets) await copyFile(new URL(file, root), new URL(file, output));
console.log('Built 9 allowlisted static assets. No DB, docs, tests, or server source copied.');
