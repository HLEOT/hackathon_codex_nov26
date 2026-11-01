import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initialState,addTasks,advanceState,completeTask,selectTask,startWork,stopWork,setReadiness,nextTask,DaytownStore} from '../src/store.ts';
const iso=(ms:number)=>new Date(ms).toISOString();
function setup(due:string|null=null){const state=initialState(0);addTasks(state,[{title:'First task',label:'First',tiny_first_step:'Open the first file.',due},{title:'Second task',label:'Second',tiny_first_step:'Read the next line.',due}]);return state;}

test('pressure respects thirty-minute ignored grace and triples only when Codex awaits a return',()=>{
 const idle=setup();advanceState(idle,30*60000);assert.equal(idle.pressure,0);advanceState(idle,31*60000);assert.equal(idle.pressure,12);
 const normal=setup(iso(0));advanceState(normal,10000);assert.equal(normal.pressure,2);
 const done=setup(iso(0));done.codex={status:'done',awaitingReturn:true,completedAt:iso(0)};advanceState(done,10000);assert.equal(done.pressure,6);
 const justDone=setup();justDone.codex={status:'done',awaitingReturn:true,completedAt:iso(5000)};advanceState(justDone,10000);assert.equal(justDone.pressure,3);
});
test('ready starts one work session and focus pauses pressure and health',()=>{
 const state=setup(iso(0)),id=state.tasks[0].id;const reply=setReadiness(state,'ready');assert.equal(reply,'Let’s spend 5 minutes on this step together.');assert.equal(state.workSession?.taskId,id);assert.equal(state.focusUntil,iso(300000));
 advanceState(state,120000);assert.equal(state.pressure,0);assert.equal(state.pet.health,100);
 setReadiness(state,'ready');assert.equal(state.workSession?.startedAt,iso(0));state.now=iso(180000);stopWork(state);assert.equal(state.tasks[0].workedMs,180000);stopWork(state);assert.equal(state.tasks[0].workedMs,180000);
});
test('gassed settles work, takes a five-minute break, and does not invent a task or reduce health',()=>{
 const state=setup(iso(0));startWork(state);state.now=iso(60000);state.lastTickAt=state.now;state.pressure=82;
 const reply=setReadiness(state,'gassed');assert.equal(reply,'Take 5 minutes to rest, and we’ll pick up one small step when you’re ready.');assert.equal(state.tasks.length,2);assert.equal(state.workSession,null);assert.equal(state.tasks[0].workedMs,60000);assert.equal(state.pressure,0);assert.equal(state.breakUntil,iso(360000));
 advanceState(state,360000);assert.equal(state.pet.health,100);assert.equal(state.pressure,0);assert.equal(state.breakUntil,null);
});
test('select swaps active tasks without punishment and accounts for elapsed work exactly once',()=>{
 const state=setup(),first=state.tasks[0].id,second=state.tasks[1].id;setReadiness(state,'ready');state.now=iso(60000);state.pressure=70;selectTask(state,second);
 assert.equal(nextTask(state)?.id,second);assert.equal(state.tasks[0].workedMs,60000);assert.equal(state.workSession?.taskId,second);assert.equal(state.workSession?.startedAt,iso(60000));assert.equal(state.focusUntil,iso(300000));assert.equal(state.pressure,0);
 state.now=iso(90000);selectTask(state,first);assert.equal(state.tasks[1].workedMs,30000);state.now=iso(100000);stopWork(state);assert.equal(state.tasks[0].workedMs,70000);assert.equal(state.workSession,null);
 const before=structuredClone(state);assert.throws(()=>selectTask(state,'invented'),/unfinished/);assert.deepEqual(state,before);
});
test('select while paused changes the active task without starting a session',()=>{const state=setup();selectTask(state,state.tasks[1].id);assert.equal(state.workSession,null);assert.equal(state.nextTaskId,state.tasks[1].id);});
test('done settles work and records one completion for the current pet lifetime',()=>{const state=setup();setReadiness(state,'ready');state.now=iso(42000);completeTask(state);assert.equal(state.tasks[0].workedMs,42000);assert.equal(state.workSession,null);assert.equal(state.pet.completedCount,1);assert.equal(state.activeTaskId,null);assert.equal(state.nextTaskId,state.tasks[1].id);});
test('100 pressure pops once, persists history, and only done re-hatches the egg',()=>{
 const state=setup(iso(0));completeTask(state,state.tasks[0].id);state.pressure=99;state.now=iso(60000);state.lastTickAt=state.now;
 const events=advanceState(state,66000);assert.deepEqual(events.filter(event=>['pop','death'].includes(event.kind)).map(event=>event.kind),['pop','death']);assert.equal(state.lastPopAt,iso(66000));assert.equal(state.pressure,0);assert.equal(state.pet.stage,'ghost');assert.equal(state.graves[0].reason,'pop');assert.equal(state.graves[0].bornAt,iso(0));assert.equal(state.graves[0].diedAt,iso(66000));assert.equal(state.graves[0].completedCount,1);
 assert.equal(advanceState(state,72000).filter(event=>event.kind==='pop').length,0);assert.equal(state.pet.stage,'egg');completeTask(state);assert.equal(state.pet.stage,'eating');assert.equal(state.pet.completedCount,1);assert.equal(state.graves.length,1);assert.equal(state.lastPopAt,iso(66000));
});
test('old persisted states receive nested defaults without losing task or grave history',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'daytown-migrate-'));
 try{const old:any=setup();old.graves=[{id:'old-grave',taskId:old.tasks[0].id,epitaph:'A remembered friend.',createdAt:iso(0)}];for(const field of ['pressure','lastPopAt','breakUntil','activeTaskId','workSession'])delete old[field];delete old.pet.completedCount;old.codex={status:'done'};const file=join(dir,'state.json');await writeFile(file,JSON.stringify(old));const store=new DaytownStore(file);const loaded=await store.load();assert.equal(loaded.pressure,0);assert.equal(loaded.breakUntil,null);assert.equal(loaded.workSession,null);assert.equal(loaded.activeTaskId,null);assert.equal(loaded.pet.completedCount,0);assert.equal(loaded.codex.awaitingReturn,false);assert.equal(loaded.graves[0].epitaph,'A remembered friend.');assert.equal(loaded.graves[0].diedAt,iso(0));assert.equal(loaded.tasks.length,2);}finally{await rm(dir,{recursive:true,force:true});}
});
test('a server restart settles work only through its last observed tick, excluding offline time',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'daytown-work-restart-'));
 try{
  const realNow=24*3600000;t.mock.method(Date,'now',()=>realNow);
  const old=setup();old.tasks[0].workedMs=1234;setReadiness(old,'ready');old.now=iso(60000);old.lastTickAt=old.now;const file=join(dir,'state.json');await writeFile(file,JSON.stringify(old));
  const store=new DaytownStore(file,()=>{},24*3600000),loaded=await store.load();assert.equal(loaded.tasks[0].workedMs,61234);assert.equal(loaded.workSession,null);assert.equal(loaded.focusUntil,null);
  // Further ticks after restart do not silently resume the manual work timer.
  await store.transact(state=>{state.clockOffsetMs=0;advanceState(state,realNow+5000);});assert.equal(store.snapshot().tasks[0].workedMs,61234);
  const withoutSession=setup();withoutSession.focusUntil=iso(300000);await writeFile(file,JSON.stringify(withoutSession));const preserved=await new DaytownStore(file).load();assert.equal(preserved.focusUntil,iso(300000));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('restart preserves a reserved focus block and excludes protected offline time from health and pressure',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'daytown-protected-restart-'));let realNow=150000;t.mock.method(Date,'now',()=>realNow);
 try{
  const old=setup(iso(0));setReadiness(old,'ready');old.now=iso(60000);old.lastTickAt=old.now;const file=join(dir,'state.json');await writeFile(file,JSON.stringify(old));
  const futureStore=new DaytownStore(file),future=await futureStore.load();assert.equal(future.workSession,null);assert.equal(future.focusUntil,iso(300000));assert.equal(future.tasks[0].workedMs,60000);
  advanceState(future,200000);assert.equal(future.pet.health,100);assert.equal(future.pressure,0);assert.equal(future.tasks[0].workedMs,60000);
  realNow=600000;const expired=await new DaytownStore(file).load();assert.equal(expired.focusUntil,null);assert.equal(expired.workSession,null);assert.equal(expired.lastTickAt,iso(300000));
  advanceState(expired,600000);assert.equal(expired.pressure,60);assert.equal(expired.pet.health,92.5);assert.equal(expired.tasks[0].workedMs,60000);
 }finally{await rm(dir,{recursive:true,force:true});}
});
