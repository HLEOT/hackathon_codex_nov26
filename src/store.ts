import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';

export type Task={id:string;title:string;due:string|null;remind_at:string|null;building_type:string;label:string;tiny_first_step:string;status:'todo'|'done';completedAt?:string;reminderFiredAt?:string;reminderClaimedAt?:string;createdAt:string;workedMs?:number};
export type PetStage='egg'|'happy'|'eating'|'hungry'|'sick'|'critical'|'ghost';
export type Grave={id:string;taskId:string;epitaph:string;createdAt:string;petName?:string;portrait?:string|null;bornAt?:string|null;diedAt?:string;completedCount?:number;reason?:'neglect'|'pop'};
export type DaytownState={tasks:Task[];pet:{health:number;stage:PetStage;name:string;awaitingHatch:boolean;bornAt:string|null;lastFedAt:string|null;ghostUntil:string|null;eatingUntil:string|null;completedCount:number};graves:Grave[];revision:number;now:string;focusUntil:string|null;breakUntil:string|null;focusDurationMs:number;breakDurationMs:number;pressure:number;lastPopAt:string|null;activeTaskId:string|null;workSession:{taskId:string;startedAt:string}|null;codex:{status:'idle'|'running'|'done';awaitingReturn:boolean;completedAt?:string|null};weather:'sunny'|'cloudy'|'storm';nextTaskId:string|null;clockOffsetMs:number;lastTickAt:string;lastInteractionAt:string;hasHatched:boolean};
export type TownEvent={kind:'state'|'celebration'|'reminder'|'death'|'assets'|'pop';state?:DaytownState;taskId?:string;text?:string;graveId?:string;reason?:'neglect'|'pop'};
export function initialState(now=Date.now()):DaytownState {const iso=new Date(now).toISOString();return {tasks:[],pet:{health:100,stage:'egg',name:'Biscuit',awaitingHatch:true,bornAt:null,lastFedAt:null,ghostUntil:null,eatingUntil:null,completedCount:0},graves:[],revision:0,now:iso,focusUntil:null,breakUntil:null,focusDurationMs:300000,breakDurationMs:300000,pressure:0,lastPopAt:null,activeTaskId:null,workSession:null,codex:{status:'idle',awaitingReturn:false,completedAt:null},weather:'sunny',nextTaskId:null,clockOffsetMs:0,lastTickAt:iso,lastInteractionAt:iso,hasHatched:false};}
export function nextTask(state:DaytownState){return state.tasks.find(task=>task.id===state.activeTaskId&&task.status==='todo')||state.tasks.filter(task=>task.status==='todo').sort((a,b)=>(a.due?Date.parse(a.due):Infinity)-(b.due?Date.parse(b.due):Infinity)||Date.parse(a.createdAt)-Date.parse(b.createdAt))[0];}
export function healthStage(health:number):PetStage {return health>=70?'happy':health>=45?'hungry':health>=20?'sick':health>0?'critical':'ghost';}
export function syncDerived(state:DaytownState){
 if(state.activeTaskId&&!state.tasks.some(task=>task.id===state.activeTaskId&&task.status==='todo'))state.activeTaskId=null;
 const task=nextTask(state);state.nextTaskId=task?.id || null;
 const now=Date.parse(state.now);const overdue=state.tasks.some(t=>t.status==='todo'&&t.due&&Date.parse(t.due)<now);
 state.weather=overdue||state.pet.health<20?'storm':state.pet.health<70||(task?.due&&Date.parse(task.due)-now<3600000)?'cloudy':'sunny';
}
export function hatch(state:DaytownState,now:number){state.hasHatched=true;state.pressure=0;state.pet={...state.pet,health:100,stage:'happy',awaitingHatch:false,bornAt:new Date(now).toISOString(),lastFedAt:new Date(now).toISOString(),ghostUntil:null,eatingUntil:null,completedCount:0};}
export function stopWork(state:DaytownState){
 if(state.workSession){const task=state.tasks.find(task=>task.id===state.workSession!.taskId);if(task)task.workedMs=(task.workedMs||0)+Math.max(0,Date.parse(state.now)-Date.parse(state.workSession.startedAt));state.workSession=null;}
 state.focusUntil=null;
}
function acknowledge(state:DaytownState){state.pressure=0;state.lastInteractionAt=state.now;if(state.codex)state.codex.awaitingReturn=false;}
export function startWork(state:DaytownState,id?:string){
 const task=id?state.tasks.find(task=>task.id===id&&task.status==='todo'):nextTask(state);if(!task)throw Object.assign(new Error('Choose an unfinished task first.'),{status:400});
 if(state.workSession?.taskId!==task.id){stopWork(state);state.workSession={taskId:task.id,startedAt:state.now};}
 state.activeTaskId=task.id;acknowledge(state);syncDerived(state);return task;
}
export function selectTask(state:DaytownState,id:string){
 const task=state.tasks.find(task=>task.id===id&&task.status==='todo');if(!task)throw Object.assign(new Error('Choose an unfinished task first.'),{status:400});
 const wasWorking=!!state.workSession,focusUntil=state.focusUntil;stopWork(state);state.activeTaskId=id;acknowledge(state);if(wasWorking){startWork(state,id);state.focusUntil=focusUntil;}syncDerived(state);return task;
}
export function setReadiness(state:DaytownState,action:'ready'|'gassed',minutes=5){
 const count=Math.max(1,Math.min(60,Number(minutes)||5)),duration=count*60000;
 if(action==='ready'){startWork(state);state.breakUntil=null;state.focusDurationMs=duration;state.focusUntil=new Date(Date.parse(state.now)+duration).toISOString();return `Let’s spend ${count} ${count===1?'minute':'minutes'} on this step together.`;}
 stopWork(state);state.breakDurationMs=duration;state.breakUntil=new Date(Date.parse(state.now)+duration).toISOString();acknowledge(state);return `Take ${count} ${count===1?'minute':'minutes'} to rest, and we’ll pick up one small step when you’re ready.`;
}
export function death(state:DaytownState,task:Task|undefined,events:TownEvent[],reason:'neglect'|'pop'='neglect'){
 if(state.pet.awaitingHatch)return;
 const grave={id:randomUUID(),taskId:task?.id || '',epitaph:`Here lies ${state.pet.name}. Took a very long side quest${task?` around ${task.label.toLowerCase()}`:''}.`,createdAt:state.now,petName:state.pet.name,portrait:null,bornAt:state.pet.bornAt,diedAt:state.now,completedCount:state.pet.completedCount||0,reason};
 stopWork(state);state.pressure=0;
 state.graves.push(grave);state.pet.health=0;state.pet.stage='ghost';state.pet.awaitingHatch=true;state.pet.ghostUntil=new Date(Date.parse(state.now)+5000).toISOString();state.pet.eatingUntil=null;
 events.push({kind:'death',taskId:task?.id,graveId:grave.id,text:grave.epitaph,reason});
}
export function popPet(state:DaytownState,events:TownEvent[]){if(state.pet.awaitingHatch)return;state.lastPopAt=state.now;events.push({kind:'pop',taskId:nextTask(state)?.id,text:'A fresh start is one tiny step away.',reason:'pop'});death(state,nextTask(state),events,'pop');}
export function advanceState(state:DaytownState,realNow=Date.now()):TownEvent[]{
 const now=realNow+state.clockOffsetMs,pauseUntil=Math.max(state.focusUntil?Date.parse(state.focusUntil):0,state.breakUntil?Date.parse(state.breakUntil):0);const from=Math.max(Date.parse(state.lastTickAt),Math.min(now,pauseUntil));const events:TownEvent[]=[];
 state.now=new Date(now).toISOString();
 const task=nextTask(state);
 for(const t of state.tasks){if(t.status==='todo'&&t.remind_at&&!t.reminderFiredAt&&Date.parse(t.remind_at)<=now){t.reminderFiredAt=state.now;events.push({kind:'reminder',taskId:t.id,text:reminderLine(t,now)});}}
 if(!state.pet.awaitingHatch){
  if(task){const overdueStart=Math.min(...state.tasks.filter(t=>t.status==='todo'&&t.due).map(t=>Date.parse(t.due!)),Infinity),ignoredStart=Date.parse(state.lastInteractionAt)+30*60000;
   const codexDone=state.codex?.status==='done'&&state.codex.awaitingReturn,doneTime=state.codex?.completedAt?Date.parse(state.codex.completedAt):from,doneStart=codexDone?(Number.isFinite(doneTime)?doneTime:from):Infinity;
   const pressureStart=Math.max(from,Math.min(overdueStart,ignoredStart,doneStart));
   const seconds=Math.max(0,now-pressureStart)/1000,fastSeconds=codexDone?Math.max(0,now-Math.max(pressureStart,doneStart))/1000:0;
   state.pressure=Math.min(100,Math.max(0,state.pressure||0)+seconds*.2+fastSeconds*.4);
   if(state.pressure>=100)popPet(state,events);
  }
  if(!state.pet.awaitingHatch){
  let loss=0;
  for(const t of state.tasks){if(t.status==='todo'&&t.due){const minutes=Math.max(0,now-Math.max(from,Date.parse(t.due)))/60000;loss+=minutes*.75;}}
  if(task){const ignoredMinutes=Math.max(0,now-Math.max(from,Date.parse(state.lastInteractionAt)+30*60000))/60000;loss+=ignoredMinutes*.2;}
  state.pet.health=Math.max(0,state.pet.health-loss);
  if(state.pet.health<=0)death(state,task,events);
  else if(state.pet.eatingUntil&&Date.parse(state.pet.eatingUntil)>now)state.pet.stage='eating';
  else {state.pet.stage=healthStage(state.pet.health);state.pet.eatingUntil=null;}
  }
 }else if(state.pet.ghostUntil&&now>=Date.parse(state.pet.ghostUntil)){state.pet.stage='egg';state.pet.ghostUntil=null;}
 if(state.focusUntil&&Date.parse(state.focusUntil)<=now)state.focusUntil=null;if(state.breakUntil&&Date.parse(state.breakUntil)<=now)state.breakUntil=null;
 state.lastTickAt=state.now;syncDerived(state);return events;
}
export function reminderLine(task:Task,now:number){const minutes=task.due?Math.round((Date.parse(task.due)-now)/60000):null;return minutes!==null&&minutes>0?`${task.label} in ${minutes} ${minutes===1?'minute':'minutes'}!`:`Time for ${task.label}. One tiny step.`;}
export function pendingReminderEvents(state:DaytownState):TownEvent[]{
 const now=Date.parse(state.now);
 return state.tasks.filter(task=>task.status==='todo'&&task.remind_at&&Date.parse(task.remind_at)<=now&&task.reminderFiredAt&&Date.parse(task.reminderFiredAt)<=now&&task.reminderClaimedAt!==task.reminderFiredAt)
  .sort((a,b)=>Date.parse(a.remind_at!)-Date.parse(b.remind_at!))
  .map(task=>({kind:'reminder',taskId:task.id,text:reminderLine(task,now),state}));
}
export function addTasks(state:DaytownState,input:Array<Partial<Task>>){
 for(const raw of input.slice(0,30)){
  const title=String(raw.title||'Untitled task').trim().slice(0,180);if(!title)continue;
  state.tasks.push({id:randomUUID(),title,due:validDate(raw.due),remind_at:validDate(raw.remind_at),building_type:String(raw.building_type||'house').slice(0,40),label:String(raw.label||title).slice(0,24),tiny_first_step:String(raw.tiny_first_step||`Open what you need for ${title.toLowerCase()}.`).slice(0,300),status:'todo',createdAt:state.now});
 }
 if(!state.hasHatched&&state.tasks.length)hatch(state,Date.parse(state.now));
 state.lastInteractionAt=state.now;syncDerived(state);
}
export function validDate(value:unknown):string|null {return typeof value==='string'&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;}
export function claimReminder(state:DaytownState,taskId:string,reminderAt:string):boolean{
 const task=state.tasks.find(t=>t.id===taskId&&t.status==='todo');
 if(!task?.reminderFiredAt||task.reminderFiredAt!==reminderAt||task.reminderClaimedAt===reminderAt)return false;
 task.reminderClaimedAt=reminderAt;return true;
}
export function completeTask(state:DaytownState,id?:string):TownEvent[]{
 const task=id?state.tasks.find(t=>t.id===id&&t.status==='todo'):nextTask(state);if(!task)throw Object.assign(new Error('Choose an unfinished task first.'),{status:400});
 if(state.workSession?.taskId===task.id)stopWork(state);task.status='done';task.completedAt=state.now;if(state.activeTaskId===task.id)state.activeTaskId=null;acknowledge(state);
 if(state.pet.awaitingHatch)hatch(state,Date.parse(state.now));
 state.pet.completedCount=(state.pet.completedCount||0)+1;state.pet.health=Math.min(100,state.pet.health+25);state.pet.stage='eating';state.pet.lastFedAt=state.now;state.pet.eatingUntil=new Date(Date.parse(state.now)+4000).toISOString();
 syncDerived(state);return [{kind:'celebration',taskId:task.id,text:`Tiny step taken. ${state.pet.name} has a little more bounce.`}];
}
export function seedWeek(now:number):DaytownState{
 const state=initialState(now),iso=(minutes:number)=>new Date(now+minutes*60000).toISOString();
 addTasks(state,[{title:'Fix the flaky auth test',label:'Auth tests',building_type:'terminal',due:iso(15),remind_at:iso(1),tiny_first_step:'Run the failing test once and read its output.'},{title:'File the taxes',label:'Taxes',building_type:'project station',due:iso(45),remind_at:iso(25),tiny_first_step:'Open the tax folder and find one receipt.'},{title:'Review PR 42',label:'PR 42',building_type:'project station',due:iso(180),remind_at:iso(160),tiny_first_step:'Open the pull request and read its summary.'},{title:'Ship the demo',label:'Demo',building_type:'terminal',due:iso(1440),remind_at:iso(1380),tiny_first_step:'Run the app and check its first screen.'}]);
 return state;
}
export class DaytownStore {
 private state:DaytownState;private queue:Promise<unknown>=Promise.resolve();
 private file:string;private emit:(event:TownEvent)=>void;
 constructor(file:string,emit:(event:TownEvent)=>void=()=>{},now=Date.now()){this.file=file;this.emit=emit;this.state=initialState(now);}
 async load(){
  try{
   const loaded=JSON.parse(await readFile(this.file,'utf8'));
   if(!Array.isArray(loaded.tasks)||!Array.isArray(loaded.graves)||!loaded.pet)throw new Error('Invalid Daytown state');
   const base=initialState();
   this.state={...base,...loaded,pet:{...base.pet,...loaded.pet},codex:{...base.codex,...loaded.codex},tasks:loaded.tasks.map((task:Task)=>({...task,workedMs:Math.max(0,Number(task.workedMs)||0)})),graves:loaded.graves.map((grave:Grave)=>({...grave,bornAt:grave.bornAt??null,diedAt:grave.diedAt||grave.createdAt,completedCount:grave.completedCount||0}))};
   this.state.pressure=Math.max(0,Math.min(100,Number(this.state.pressure)||0));
   this.state.pet.completedCount=Math.max(0,Number(this.state.pet.completedCount)||0);
   if(!['idle','running','done'].includes(this.state.codex.status))this.state.codex.status='idle';
   this.state.codex.awaitingReturn=this.state.codex.awaitingReturn===true;this.state.codex.completedAt=validDate(this.state.codex.completedAt);
   if(this.state.workSession){
    const session=this.state.workSession,task=this.state.tasks.find(task=>task.id===session.taskId),start=Date.parse(session.startedAt),lastObserved=Date.parse(this.state.lastTickAt);
    // A declared work session continues while the server is running, even with
    // the dashboard closed. A server restart cannot verify work during downtime.
    if(task&&Number.isFinite(start)&&Number.isFinite(lastObserved))task.workedMs=(task.workedMs||0)+Math.max(0,lastObserved-start);
    this.state.workSession=null;
    const protectedUntil=this.state.focusUntil?Date.parse(this.state.focusUntil):NaN,simulatedNow=Date.now()+this.state.clockOffsetMs;
    if(!Number.isFinite(protectedUntil))this.state.focusUntil=null;
    else if(protectedUntil<=simulatedNow){
     // Preserve protection that elapsed while the server was offline, without
     // reporting it as observed work. A future reserved block may finish too.
     this.state.lastTickAt=new Date(Math.max(Number.isFinite(lastObserved)?lastObserved:0,Math.min(protectedUntil,simulatedNow))).toISOString();this.state.focusUntil=null;
    }
   }
   syncDerived(this.state);
  }catch(error:any){if(error.code!=='ENOENT')throw error;}
  return this.snapshot();
 }
 snapshot(){return structuredClone(this.state);}
 transact<T>(mutate:(state:DaytownState,events:TownEvent[])=>T):Promise<T>{
  const op=this.queue.then(async()=>{const copy=this.snapshot();const events:TownEvent[]=[];const result=mutate(copy,events);syncDerived(copy);copy.revision++;await mkdir(dirname(this.file),{recursive:true});const temporary=this.file+'.tmp';await writeFile(temporary,JSON.stringify(copy,null,2));await rename(temporary,this.file);this.state=copy;this.emit({kind:'state',state:this.snapshot()});for(const event of events)this.emit({...event,state:this.snapshot()});return result;});
  this.queue=op.catch(()=>{});return op;
 }
 async tick(){return this.transact((state,events)=>events.push(...advanceState(state)));}
}
