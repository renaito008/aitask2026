export const clone=value=>structuredClone(value);
export const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
export const monthAt=date=>date.slice(0,7);
export const id=()=>globalThis.crypto.randomUUID();
export const progress=g=>g.tasks.length?Math.round(g.tasks.filter(t=>t.completed).length/g.tasks.length*100):0;
export const allDone=g=>g.tasks.length>0&&g.tasks.every(t=>t.completed);
export function experience(joined,date=today()){const [y,m]=joined.split('-').map(Number);const [ty,tm]=date.split('-').map(Number);const n=Math.max(0,(ty-y)*12+tm-m);return {years:Math.floor(n/12),months:n%12};}
export function ensure(ok,message){if(!ok)throw new Error(message);}
export function dateValid(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;}
export function validate(s){
 ensure(s?.schemaVersion===1&&Number.isInteger(s.revision),'保存データの形式に対応していません。');
 ensure(s.profile&&typeof s.profile.memberName==='string'&&s.profile.memberName.trim().length>0&&s.profile.memberName.length<=50,'メンバー名を50文字以内で入力してください。');
 ensure(/^\d{4}-(0[1-9]|1[0-2])$/.test(s.profile.joinedMonth)&&s.profile.joinedMonth<=monthAt(today()),'入職年月は今月以前を選択してください。');
 ensure(dateValid(s.profile.latestMeetingDate)&&s.profile.latestMeetingDate<=today(),'実施日は今日以前を選択してください。');
 ensure(s.profile.joinedMonth<=monthAt(s.profile.latestMeetingDate),'実施日は入職年月以降にしてください。');
 ensure(Array.isArray(s.goals)&&Array.isArray(s.snapshots)&&s.snapshots.length<=3,'データの形式が不正です。');
 ensure(s.goals.filter(g=>g.status==='active').length<=3,'取り組み中の目標は最大3つです。');
 const ids=new Set();for(const g of s.goals){ensure(typeof g.id==='string'&&!ids.has(g.id),'目標IDが不正です。');ids.add(g.id);ensure(['active','achieved'].includes(g.status)&&Number.isInteger(g.revision)&&typeof g.continuationEditEnabled==='boolean','目標の状態が不正です。');ensure(g.title?.trim()&&g.title.length<=100&&dateValid(g.dueDate),'目標名と期限を入力してください。');ensure(Array.isArray(g.tasks)&&g.tasks.length<=3,'タスクは目標ごとに最大3つです。');const ti=new Set();for(const t of g.tasks){ensure(typeof t.id==='string'&&!ti.has(t.id),'タスクIDが不正です。');ti.add(t.id);ensure(t.title?.trim()&&t.title.length<=100&&dateValid(t.dueDate)&&['low','medium','high'].includes(t.priority)&&typeof t.completed==='boolean','タスク名・期限・優先度を確認してください。');}ensure(g.status!=='achieved'||allDone(g),'達成済み目標のタスク状態が不正です。');}
 for(const snap of s.snapshots){ensure(snap.experience&&Number.isInteger(snap.experience.years)&&snap.experience.years>=0&&Number.isInteger(snap.experience.months)&&snap.experience.months>=0&&snap.experience.months<12&&snap.profile.latestMeetingDate===snap.meetingDate,'履歴の業界歴・実施日が不正です。');ensure(dateValid(snap.meetingDate)&&snap.meetingDate<=today()&&Array.isArray(snap.goals)&&snap.profile&&snap.goalProgress,'履歴データが不正です。');validate({...s,profile:snap.profile,goals:snap.goals,snapshots:[]});}
 ensure(new Set(s.snapshots.map(x=>x.meetingDate)).size===s.snapshots.length,'履歴の実施日が重複しています。');return s;
}
export function changeGoal(s,gid,fn){const g=s.goals.find(x=>x.id===gid);ensure(g,'目標が見つかりません。');fn(g);g.revision++;return g;}
export function addGoal(s,title,dueDate){ensure(s.goals.filter(g=>g.status==='active').length<3,'取り組み中の目標は最大3つです。');s.goals.push({id:id(),title,dueDate,status:'active',continuationEditEnabled:false,achievedAt:null,revision:0,tasks:[]});}
export function addTask(s,gid,title,dueDate,priority='medium'){return changeGoal(s,gid,g=>{ensure(g.status==='active','達成済み目標は編集できません。');ensure(g.tasks.length<3,'タスクは目標ごとに最大3つです。');g.tasks.push({id:id(),title,dueDate,priority,completed:false});});}
export function editTask(s,gid,tid,changes){return changeGoal(s,gid,g=>{const t=g.tasks.find(x=>x.id===tid);ensure(g.status==='active'&&t&&(!t.completed||g.continuationEditEnabled),'完了タスクは編集できません。取り組みを続けるを選択してください。');Object.assign(t,changes);});}
export function deleteTask(s,gid,tid){return changeGoal(s,gid,g=>{const t=g.tasks.find(x=>x.id===tid);ensure(g.status==='active'&&t&&(!t.completed||g.continuationEditEnabled),'完了タスクは削除できません。');g.tasks=g.tasks.filter(x=>x.id!==tid);});}
export function achieve(s,gid){return changeGoal(s,gid,g=>{ensure(g.status==='active'&&allDone(g),'全タスクの完了が必要です。');g.status='achieved';g.achievedAt=today();g.continuationEditEnabled=false;});}
export function continueGoal(s,gid){return changeGoal(s,gid,g=>{ensure(g.status!=='achieved'||s.goals.filter(x=>x.status==='active').length<3,'目標の空き枠がありません。');g.status='active';g.continuationEditEnabled=true;g.achievedAt=null;});}
export function canRemove(s,g){return g.status==='achieved'&&s.snapshots.some(x=>x.meetingDate>g.achievedAt&&x.goals.some(p=>p.id===g.id&&p.status==='achieved'&&p.revision===g.revision));}
export function removeAchieved(s,gid){const g=s.goals.find(x=>x.id===gid);ensure(g&&canRemove(s,g),'達成日より後の1on1で最新内容を記録してから削除してください。');s.goals=s.goals.filter(x=>x.id!==gid);}
export function recordMeeting(s,overwrite=false){validate(s);const d=s.profile.latestMeetingDate;const existing=s.snapshots.some(x=>x.meetingDate===d);ensure(!existing||overwrite,'同じ実施日の履歴があります。上書き確認が必要です。');ensure(existing||s.snapshots.length<3||d>s.snapshots.at(-1).meetingDate,'保持中の3回より古い日付は記録できません。');const snap={id:id(),meetingDate:d,recordedAt:new Date().toISOString(),profile:clone(s.profile),experience:experience(s.profile.joinedMonth,d),goals:clone(s.goals),goalProgress:Object.fromEntries(s.goals.map(g=>[g.id,progress(g)]))};s.snapshots=[snap,...s.snapshots.filter(x=>x.meetingDate!==d)].sort((a,b)=>b.meetingDate.localeCompare(a.meetingDate)).slice(0,3);return s;}
export function emptyState(){return {schemaVersion:1,revision:0,profile:{memberName:'',joinedMonth:'',latestMeetingDate:today()},goals:[],snapshots:[]};}
export function demoState(){const s=emptyState();s.profile={memberName:'デモメンバー',joinedMonth:'2024-04',latestMeetingDate:today()};addGoal(s,'1on1で次の一歩を整理する',today());const g=s.goals[0];addTask(s,g.id,'今週の取り組みを共有する',today(),'medium');addTask(s,g.id,'次のアクションを決める',today(),'high');return s;}
