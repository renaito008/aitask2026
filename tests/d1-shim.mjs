// Test adapter only: Node SQLite is NOT the real Cloudflare D1 runtime.
import {DatabaseSync} from 'node:sqlite';
export class D1Shim {
  constructor() { this.sqlite = new DatabaseSync(':memory:'); this.sqlite.exec('CREATE TABLE rooms(id TEXT PRIMARY KEY,state TEXT NOT NULL,edit_hash TEXT NOT NULL UNIQUE,view_hash TEXT NOT NULL UNIQUE);'); this.failRun=false; this.beforeUpdate=null; }
  prepare(sql) {
    const shim=this;
    function statement(values=[]) { return {
      sql, values,
      bind(...params) { return statement(params); },
      async first() { return shim.sqlite.prepare(sql).get(...values)??null; },
      async run() { if(sql.startsWith('UPDATE rooms')&&shim.beforeUpdate)await shim.beforeUpdate(); if(shim.failRun){shim.failRun=false;throw Error('private SQL failure with sensitive infrastructure details');} const result=shim.sqlite.prepare(sql).run(...values);return {success:true,results:[],meta:{changes:Number(result.changes)}}; }
    }; }
    return statement();
  }
  async batch(statements) { this.sqlite.exec('BEGIN'); try { const result=[];for(const stmt of statements)result.push(await stmt.run());this.sqlite.exec('COMMIT');return result; }catch(error){this.sqlite.exec('ROLLBACK');throw error;} }
  gateUpdates(count=2) { let arrivals=0,release; const gate=new Promise(resolve=>release=resolve);this.beforeUpdate=async()=>{if(++arrivals===count){this.beforeUpdate=null;release();}await gate;}; }
  close(){this.sqlite.close();}
}
