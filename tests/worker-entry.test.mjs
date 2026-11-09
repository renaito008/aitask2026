import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as entry from '../worker/entry.js';
import worker from '../worker/index.js';

test('Wrangler entry exposes only the default handler and both configs use it',async()=>{
  assert.deepEqual(Object.keys(entry),['default']);
  assert.equal(entry.default,worker);
  assert.equal(typeof entry.default.fetch,'function');
  for(const name of ['wrangler.jsonc','wrangler.local.jsonc']){
    const config=JSON.parse(await readFile(new URL('../'+name,import.meta.url),'utf8'));
    assert.equal(config.main,'worker/entry.js');
  }
});
