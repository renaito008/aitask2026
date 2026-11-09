import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {win32, posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import worker, {STATIC_FILES} from '../worker/index.js';
import {D1Repository} from '../worker/d1-repository.js';
import {D1Shim} from './d1-shim.mjs';
import {readRoomsReadonly, isInsideDirectory, checkOutputPaths} from '../tools/export-rooms.mjs';
import {sqlExport} from '../tools/rooms-transfer.mjs';
const profile={memberName:'架空メンバー',joinedMonth:'2024-01',latestMeetingDate:'2026-01-01'};
function fixture(t) {
  const db=new D1Shim(); t.after(()=>db.close());
  const assets=[];
  const env={DB:db,ASSETS:{async fetch(request){assets.push(request);const name=new URL(request.url).pathname.slice(1);try{return new Response(await readFile(new URL('../public/'+name,import.meta.url)));}catch{return new Response('missing',{status:404});}}}};
  async function call(path,token,body,method) {
    const response=await worker.fetch(new Request('https://example.test'+path,{method:method??(body?'POST':'GET'),headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json',Origin:'https://example.test'}:{})},body:body?JSON.stringify(body):undefined}),env);
    return {status:response.status,headers:response.headers,data:await response.json()};
  }
  return {db,env,call,assets,repo:new D1Repository(db)};
}
test('Worker API keeps room contract, roles, 256-bit links and secret isolation',async t=>{
  const {call,db}=fixture(t);const room=await call('/api/rooms',null,{profile});assert.equal(room.status,201);const {edit,view}=room.data.tokens;
  assert.match(edit,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(edit,view);const read=await call('/api/state',view);assert.equal(read.data.role,'view');assert.ok(!JSON.stringify(read.data).includes(edit));assert.ok(!JSON.stringify(read.data).includes('hash'));
  for(const path of ['/api/save','/api/record','/api/remove','/api/links'])assert.equal((await call(path,view,{})).status,403);
  assert.equal((await call('/api/state')).status,401);assert.equal((await call('/api/state','a'.repeat(43))).status,401);
  const row=db.sqlite.prepare('SELECT * FROM rooms').get();assert.match(row.edit_hash,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(row).includes(edit));assert.deepEqual(Object.keys(row),['id','state','edit_hash','view_hash']);
});
test('Worker allows HTTPS same origin, rejects foreign origin/invalid media/oversize and UTF-8',async t=>{
  const {env}=fixture(t);
  const send=(body,headers={})=>worker.fetch(new Request('https://example.test/api/rooms',{method:'POST',headers:{'Content-Type':'application/json',...headers},body}),env);
  assert.equal((await send(JSON.stringify({profile}),{Origin:'https://example.test'})).status,201);
  assert.equal((await send('{}',{Origin:'http://example.test'})).status,403);
  assert.equal((await send('{}',{Origin:'https://evil.test'})).status,403);
  assert.equal((await send('{}',{'Sec-Fetch-Site':'cross-site'})).status,403);
  assert.equal((await send('{}',{'Content-Type':'text/plain'})).status,415);
  assert.equal((await send('invalid')).status,400);assert.equal((await send('x'.repeat(262145))).status,413);
  const bytes=new TextEncoder().encode(JSON.stringify({profile}));const split=bytes.indexOf(0xe6)+1;let step=0;
  const stream=new ReadableStream({pull(controller){if(step===0)controller.enqueue(bytes.slice(0,split));else if(step===1)controller.enqueue(bytes.slice(split));else controller.close();step++;}});
  const response=await worker.fetch(new Request('https://example.test/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:stream,duplex:'half'}),env);
  assert.equal(response.status,201);assert.equal((await response.json()).state.profile.memberName,profile.memberName);
  assert.equal((await send(new Uint8Array([0xff]))).status,400);
});
test('Worker serves only public assets, preserves room controls and demo, and removes forwarding secrets',async t=>{
  const {env,assets}=fixture(t);
  for(const path of ['/data/app.sqlite','/docs/SPEC.md','/tests/server.test.mjs','/worker/index.js','/package.json','/schema.sql','/wrangler.jsonc','/public/style.css'])assert.equal((await worker.fetch(new Request('https://example.test'+path),env)).status,404);
  for(const path of ['/','/room','/demo','/style.css']){
    const response=await worker.fetch(new Request('https://example.test'+path+'?token=do-not-forward',{headers:{Authorization:'Bearer do-not-forward',Cookie:'secret=1'}}),env);
    assert.equal(response.status,200);assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.headers.get('cache-control'),'no-store');assert.match(response.headers.get('content-security-policy'),/frame-ancestors 'none'/);
    const text=await response.text();if(path==='/room'){assert.match(text,/id="sharePanel"/);assert.match(text,/shared-app.js/);}if(path==='/demo'){assert.match(text,/src="app.js"/);assert.match(text,/ブラウザ内/);}
  }
  for(const request of assets){assert.equal(request.headers.get('authorization'),null);assert.equal(request.headers.get('cookie'),null);assert.equal(new URL(request.url).search,'');}
  const shared=await worker.fetch(new Request('https://example.test/shared-app.js'),env);assert.match(await shared.text(),/D1対応版/);
  const head=await worker.fetch(new Request('https://example.test/room',{method:'HEAD'}),env);assert.equal(await head.text(),'');
  assert.equal(STATIC_FILES.size,9);
});
test('D1 enforces commands and rolls back invalid state without writing',async t=>{
  const {repo}=fixture(t),room=await repo.create(profile),token=room.tokens.edit;
  await repo.update(token,{expectedRevision:0,profile,commands:[{type:'addGoal',id:'g',title:'目標',dueDate:'2026-12-01'},{type:'addTask',gid:'g',id:'t',title:'作業',dueDate:'2026-12-01',priority:'medium'},{type:'editTask',gid:'g',tid:'t',completed:true}]},'save');
  await assert.rejects(repo.update(token,{expectedRevision:1,profile,commands:[{type:'editTask',gid:'g',tid:'t',title:'違反'}]},'save'),error=>error.status===422);
  await assert.rejects(repo.update(token,{expectedRevision:1,profile,commands:[{type:'deleteGoal',gid:'g'}]},'save'));
  await repo.update(token,{expectedRevision:1,profile,commands:[{type:'continueGoal',gid:'g'},{type:'editTask',gid:'g',tid:'t',completed:false}]},'save');
  await assert.rejects(repo.update(token,{expectedRevision:2,profile,commands:[],snapshots:[]},'save'),error=>error.status===400);
  assert.equal((await repo.read(token)).state.revision,2);
});
test('D1 CAS simultaneous saves have one winner and no lost update',async t=>{
  const {repo,db}=fixture(t),room=await repo.create(profile);db.gateUpdates();
  const results=await Promise.allSettled(['A','B'].map(name=>repo.update(room.tokens.edit,{expectedRevision:0,profile:{...profile,memberName:name},commands:[]},'save')));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.status,409);assert.equal((await repo.read(room.tokens.view)).state.revision,1);
});
test('D1 CAS edit-token rotation racing a save never resurrects old links',async t=>{
  const {repo,db}=fixture(t),room=await repo.create(profile);db.gateUpdates();
  const results=await Promise.allSettled([repo.update(room.tokens.edit,{expectedRevision:0,kind:'both'},'rotate'),repo.update(room.tokens.edit,{expectedRevision:0,profile,commands:[]},'save')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const rotated=results[0].status==='fulfilled';
  if(rotated){await assert.rejects(repo.read(room.tokens.edit),e=>e.status===401);await assert.rejects(repo.read(room.tokens.view),e=>e.status===401);assert.equal((await repo.read(results[0].value.tokens.view)).state.revision,1);assert.equal(results[1].reason.status,401);}
  else {assert.equal(results[0].reason.status,409);assert.equal((await repo.read(room.tokens.edit)).state.revision,1);}
});
test('D1 CAS record racing save keeps a consistent snapshot or rejects record',async t=>{
  const {repo,db}=fixture(t),room=await repo.create(profile);db.gateUpdates();
  const results=await Promise.allSettled([repo.update(room.tokens.edit,{expectedRevision:0,overwrite:false},'record'),repo.update(room.tokens.edit,{expectedRevision:0,profile:{...profile,memberName:'更新後'},commands:[]},'save')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);const state=(await repo.read(room.tokens.view)).state;assert.equal(state.revision,1);if(state.snapshots.length)assert.equal(state.snapshots[0].profile.memberName,state.profile.memberName);assert.equal(results.find(x=>x.status==='rejected').reason.status,409);
});
test('D1 preserves three snapshots, overwrite confirmation, old links invalid, and failed writes',async t=>{
  const {repo,db}=fixture(t),room=await repo.create(profile),token=room.tokens.edit;let rev=0;
  for(const date of ['2026-01-01','2026-02-01','2026-03-01','2026-04-01']){await repo.update(token,{expectedRevision:rev++,profile:{...profile,latestMeetingDate:date},commands:[]},'save');await repo.update(token,{expectedRevision:rev++,overwrite:false},'record');}
  assert.deepEqual((await repo.read(token)).state.snapshots.map(s=>s.meetingDate),['2026-04-01','2026-03-01','2026-02-01']);
  await assert.rejects(repo.update(token,{expectedRevision:rev,overwrite:false},'record'));await repo.update(token,{expectedRevision:rev++,overwrite:true},'record');
  const prior=await repo.read(token);db.failRun=true;await assert.rejects(repo.update(token,{expectedRevision:rev,kind:'both'},'rotate'));assert.deepEqual(await repo.read(token),prior);
  const rotated=await repo.update(token,{expectedRevision:rev,kind:'both'},'rotate');await assert.rejects(repo.read(token),e=>e.status===401);await assert.rejects(repo.read(room.tokens.view),e=>e.status===401);assert.equal((await repo.read(rotated.tokens.view)).role,'view');
});
test('Worker hides infrastructure errors while preserving old state',async t=>{
  const {call,db}=fixture(t);const room=(await call('/api/rooms',null,{profile})).data;db.failRun=true;const result=await call('/api/save',room.tokens.edit,{expectedRevision:0,profile,commands:[]});assert.equal(result.status,503);assert.ok(!JSON.stringify(result.data).includes('private SQL'));assert.equal((await call('/api/state',room.tokens.view)).data.state.revision,0);
});
test('read-only export preserves source bytes; exact reimport no-ops and conflicts roll back all rows',async t=>{
  const {repo,db}=fixture(t);await repo.create(profile);const rows=db.sqlite.prepare('SELECT * FROM rooms').all().map(r=>({...r}));
  const folder=await mkdtemp(join(tmpdir(),'rooms-export-test-'));t.after(()=>rm(folder,{recursive:true,force:true}));const file=join(folder,'source.sqlite');const source=new DatabaseSync(file);source.exec('CREATE TABLE rooms(id TEXT PRIMARY KEY,state TEXT NOT NULL,edit_hash TEXT NOT NULL UNIQUE,view_hash TEXT NOT NULL UNIQUE);');for(const row of rows)source.prepare('INSERT INTO rooms VALUES(?,?,?,?)').run(row.id,row.state,row.edit_hash,row.view_hash);source.close();
  const before=createHash('sha256').update(await readFile(file)).digest('hex');const exported=readRoomsReadonly(file);assert.deepEqual(exported,rows);assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),before);
  const target=new D1Shim();t.after(()=>target.close());target.sqlite.exec(sqlExport(exported));assert.deepEqual(target.sqlite.prepare('SELECT * FROM rooms').all().map(r=>({...r})),rows);const firstChanges=target.sqlite.prepare('SELECT total_changes() AS n').get().n;target.sqlite.exec(sqlExport(exported));assert.equal(target.sqlite.prepare('SELECT total_changes() AS n').get().n,firstChanges);
  const newRow={...rows[0],id:'new-id',edit_hash:'c'.repeat(64),view_hash:'d'.repeat(64)};const conflict={...rows[0],state:rows[0].state+' '};
  assert.throws(()=>target.sqlite.exec(sqlExport([newRow,conflict])));assert.equal(target.sqlite.prepare('SELECT count(*) AS n FROM rooms').get().n,1);
});
test('migration public path guard handles Windows and POSIX boundaries independently of cwd',()=>{
  assert.equal(isInsideDirectory('C:\\repo\\public','C:\\repo\\public\\nested\\export.json',win32),true);
  assert.equal(isInsideDirectory('C:\\repo\\public','C:\\repo\\public-backup\\export.json',win32),false);
  assert.equal(isInsideDirectory('C:\\repo\\public','D:\\other\\export.json',win32),false);
  assert.equal(isInsideDirectory('/repo/public','/repo/public/nested/export.json',posix),true);
  assert.equal(isInsideDirectory('/repo/public','/repo/public-backup/export.json',posix),false);
  assert.throws(()=>checkOutputPaths('source.sqlite',fileURLToPath(new URL('../public/export.json',import.meta.url))));
});
