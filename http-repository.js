import {clone} from './domain.js';
export class HttpRepository{
 constructor(token){this.token=token;this.commands=[];}
 async request(path,body){const response=await fetch(path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',referrerPolicy:'no-referrer'});let payload;try{payload=await response.json();}catch{throw new Error('サーバーの応答を読み取れませんでした。入力は保持しています。');}if(!response.ok)throw new Error(payload.error??'保存に失敗しました。');return payload;}
 async load(){const result=await this.request('/api/state');this.role=result.role;this.commands=[];return clone(result.state);}
 async save(state,expectedRevision){const result=await this.request('/api/save',{expectedRevision,profile:state.profile,commands:this.commands});this.commands=[];return result.state;}
 async record(expectedRevision,overwrite){return (await this.request('/api/record',{expectedRevision,overwrite})).state;}
 async remove(expectedRevision,gid){return (await this.request('/api/remove',{expectedRevision,gid})).state;}
 async rotate(expectedRevision,kind){return this.request('/api/links',{expectedRevision,kind});}
}
