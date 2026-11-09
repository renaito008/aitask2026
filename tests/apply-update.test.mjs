import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, copyFile, readdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
function selectPowerShell() {
  const candidates=['pwsh',join(process.env.SystemRoot??'C:/Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),'powershell.exe'];
  for(const executable of candidates){
    const result=spawnSync(executable,['-NoProfile','-NonInteractive','-Command','exit 0'],{encoding:'utf8',stdio:'pipe'});
    if(!result.error&&result.status===0)return executable;
  }
  throw Error('Windows PowerShell or PowerShell 7 is required for the trusted update-fixture test.');
}
const sha=text=>createHash('sha256').update(text).digest('hex');
test('manual update helper applies only code, backs up, no-ops on rerun and rejects unexpected edits', {skip:process.platform!=='win32'},async t=>{
  const temp=await mkdtemp(join(tmpdir(),'task2026-apply-test-'));t.after(()=>rm(temp,{recursive:true,force:true}));
  const source=join(temp,'package');await mkdir(join(source,'public'),{recursive:true});await copyFile(new URL('../apply-update.ps1',import.meta.url),join(source,'apply-update.ps1'));
  await writeFile(join(source,'app.js'),'version 2');await writeFile(join(source,'README.md'),'same content');await writeFile(join(source,'public','style.css'),'new asset');
  const files=[{path:'app.js',oldHash:sha('version 1'),newHash:sha('version 2')},{path:'README.md',oldHash:sha('same content'),newHash:sha('same content')},{path:'public/style.css',oldHash:null,newHash:sha('new asset')}];
  await writeFile(join(source,'update-manifest.json'),JSON.stringify({format:'task2026-code-update-v1',files}));
  const makeTarget=async name=>{const target=join(temp,name);await mkdir(join(target,'data'),{recursive:true});await writeFile(join(target,'app.js'),'version 1');await writeFile(join(target,'README.md'),'same content');await writeFile(join(target,'data','do-not-touch.sqlite'),'private fixture marker');return target;};
  const shell=selectPowerShell();
  const shellEnv={...process.env};
  // PowerShell 5 can inherit a PowerShell 7-only module path from the caller.
  if(/powershell\.exe$/i.test(shell))shellEnv.PSModulePath=[join(process.env.SystemRoot??'C:/Windows','System32','WindowsPowerShell','v1.0','Modules'),process.env.PSModulePath].filter(Boolean).join(';');
  // Bypass is process-scoped and only runs our generated trusted fixture copy; no machine policy changes.
  const run=target=>execFileSync(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(source,'apply-update.ps1'),'-Target',target],{encoding:'utf8',stdio:'pipe',env:shellEnv});
  const target=await makeTarget('target');run(target);assert.equal(await readFile(join(target,'app.js'),'utf8'),'version 2');assert.equal(await readFile(join(target,'public','style.css'),'utf8'),'new asset');assert.equal(await readFile(join(target,'data','do-not-touch.sqlite'),'utf8'),'private fixture marker');
  const backups=(await readdir(temp)).filter(name=>name.startsWith('target-code-backup-'));assert.equal(backups.length,1);assert.equal(await readFile(join(temp,backups[0],'app.js'),'utf8'),'version 1');run(target);assert.equal((await readdir(temp)).filter(name=>name.startsWith('target-code-backup-')).length,1);
  const changed=await makeTarget('changed');await writeFile(join(changed,'app.js'),'unrelated manual change');assert.throws(()=>run(changed));assert.equal(await readFile(join(changed,'app.js'),'utf8'),'unrelated manual change');assert.equal(await readFile(join(changed,'data','do-not-touch.sqlite'),'utf8'),'private fixture marker');assert.ok(!(await readdir(changed)).includes('public'));assert.ok(!(await readdir(temp)).some(name=>name.startsWith('changed-code-backup-')));
});
