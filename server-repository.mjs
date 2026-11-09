import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash} from 'node:crypto';
import * as D from './domain.js';
const hash=token=>createHash('sha256').update(token).digest('hex');
const token=()=>randomBytes(32).toString('base64url');
export class ApiError extends Error{constructor(status,message){super(message);this.status=status;}}
const requireThat=(ok,status,message)=>{if(!ok)throw new ApiError(status,message);};
const fields=(obj,allowed)=>{requireThat(obj&&typeof obj==='object'&&!Array.isArray(obj),400,'入力形式が不正です。');requireThat(Object.keys(obj).every(k=>allowed.includes(k)),400,'許可されない項目が含まれています。');};
function cleanProfile(p){fields(p,['memberName','joinedMonth','latestMeetingDate']);return {memberName:p.memberName,joinedMonth:p.joinedMonth,latestMeetingDate:p.latestMeetingDate};}
function applyCommand(s,c){
 fields(c,['type','gid','tid','title','dueDate','priority','completed','id']);
 const goal=()=>{const g=s.goals.find(g=>g.id===c.gid);D.ensure(g,'目標が見つかりません。');return g;};
 const identifier=()=>{D.ensure(typeof c.id==='string'&&/^[a-zA-Z0-9-]{1,64}$/.test(c.id),'IDが不正です。');return c.id;};
 switch(c.type){
  case 'addGoal':D.addGoal(s,c.title,c.dueDate);s.goals.at(-1).id=identifier();break;
  case 'addTask':D.addTask(s,c.gid,c.title,c.dueDate,c.priority);goal().tasks.at(-1).id=identifier();break;
  case 'editTask':{const changes={};for(const k of ['title','dueDate','priority','completed'])if(Object.hasOwn(c,k))changes[k]=c[k];D.editTask(s,c.gid,c.tid,changes);break;}
  case 'deleteTask':D.deleteTask(s,c.gid,c.tid);break;
  case 'editGoal':D.changeGoal(s,c.gid,g=>{D.ensure(g.status==='active','達成済み目標は編集できません。');g.title=c.title;g.dueDate=c.dueDate;});break;
  case 'deleteGoal':{const g=goal();D.ensure(g.status==='active','達成済み目標は振り返り後に削除してください。');D.ensure(!g.tasks.some(t=>t.completed)||g.continuationEditEnabled,'完了タスクを含む目標は削除できません。');s.goals=s.goals.filter(x=>x.id!==g.id);break;}
  case 'achieve':D.achieve(s,c.gid);break;
  case 'continueGoal':D.continueGoal(s,c.gid);break;
  default:throw new ApiError(400,'未対応の操作です。');
 }
}
export class SqliteRepository{
 constructor(filename){this.db=new DatabaseSync(filename);this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, state TEXT NOT NULL, edit_hash TEXT NOT NULL UNIQUE, view_hash TEXT NOT NULL UNIQUE);');}
 close(){this.db.close();}
 create(profile){const s=D.emptyState();s.profile=cleanProfile(profile);D.validate(s);const edit=token(),view=token(),id=D.id();this.db.prepare('INSERT INTO rooms VALUES(?,?,?,?)').run(id,JSON.stringify(s),hash(edit),hash(view));return {state:s,role:'edit',tokens:{edit,view}};}
 access(raw){requireThat(typeof raw==='string'&&/^[A-Za-z0-9_-]{43}$/.test(raw),401,'リンクが無効です。');const h=hash(raw);const row=this.db.prepare('SELECT * FROM rooms WHERE edit_hash=? OR view_hash=?').get(h,h);requireThat(row,401,'リンクが無効または再発行済みです。');return {row,role:row.edit_hash===h?'edit':'view'};}
 read(raw){const {row,role}=this.access(raw);return {state:JSON.parse(row.state),role};}
 update(raw,body,action){const {row,role}=this.access(raw);requireThat(role==='edit',403,'閲覧用リンクでは変更できません。');fields(body,action==='save'?['expectedRevision','profile','commands']:action==='record'?['expectedRevision','overwrite']:action==='remove'?['expectedRevision','gid']:['expectedRevision','kind']);
 this.db.exec('BEGIN IMMEDIATE');try{
 const fresh=this.db.prepare('SELECT * FROM rooms WHERE id=?').get(row.id);requireThat(fresh.edit_hash===hash(raw),401,'リンクが再発行されています。');const s=JSON.parse(fresh.state);requireThat(Number.isInteger(body.expectedRevision)&&s.revision===body.expectedRevision,409,'別の画面で更新されています。入力を控えてから最新情報を読み込んでください。');let tokens;
 if(action==='save'){s.profile=cleanProfile(body.profile);requireThat(Array.isArray(body.commands)&&body.commands.length<=200,400,'操作数が上限を超えています。一度保存してください。');for(const c of body.commands)applyCommand(s,c);}
 else if(action==='record'){requireThat(typeof body.overwrite==='boolean',400,'上書き指定が不正です。');D.recordMeeting(s,body.overwrite);}
 else if(action==='remove')D.removeAchieved(s,body.gid);
 else if(action==='rotate'){requireThat(['edit','view','both'].includes(body.kind),400,'再発行対象が不正です。');tokens={};if(body.kind!=='view')tokens.edit=token();if(body.kind!=='edit')tokens.view=token();this.db.prepare('UPDATE rooms SET edit_hash=?,view_hash=? WHERE id=?').run(tokens.edit?hash(tokens.edit):fresh.edit_hash,tokens.view?hash(tokens.view):fresh.view_hash,row.id);}
 else throw new ApiError(400,'未対応の操作です。');
 s.revision++;D.validate(s);this.db.prepare('UPDATE rooms SET state=? WHERE id=?').run(JSON.stringify(s),row.id);this.db.exec('COMMIT');return {state:s,role,tokens};
 }catch(e){this.db.exec('ROLLBACK');throw e;}}
}
