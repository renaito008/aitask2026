import {clone,validate} from './domain.js';
export const STORAGE_KEY='one-on-one-prototype-v1';
export class LocalRepository {
 constructor(storage){this.storage=storage;}
 load(){const raw=this.storage.getItem(STORAGE_KEY);if(raw===null)return null;try{return clone(validate(JSON.parse(raw)));}catch(e){throw new Error('保存データを読み込めません。上書きせず停止しました。 '+e.message);}}
 save(state,expectedRevision){validate(state);const current=this.load();if((current?.revision??0)!==expectedRevision)throw new Error('別のタブで更新されています。入力を控えてから最新情報を読み込んでください。');const next=clone(state);next.revision=expectedRevision+1;this.storage.setItem(STORAGE_KEY,JSON.stringify(next));return next;}
}
