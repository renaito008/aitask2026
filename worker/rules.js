import * as D from '../domain.js';
import {ApiError,requireThat} from './errors.js';
export const fields=(obj,allowed)=>{requireThat(obj&&typeof obj==='object'&&!Array.isArray(obj),400,'入力形式が不正です。');requireThat(Object.keys(obj).every(k=>allowed.includes(k)),400,'許可されない項目が含まれています。');};
export function cleanProfile(p){fields(p,['memberName','joinedMonth','latestMeetingDate']);return {memberName:p.memberName,joinedMonth:p.joinedMonth,latestMeetingDate:p.latestMeetingDate};}
export function applyCommand(s,c){
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
