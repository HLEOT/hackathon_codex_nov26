import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initialState,addTasks,advanceState,completeTask,healthStage,DaytownStore} from '../src/store.ts';
const task=(due:string|null=null,remind_at:string|null=null)=>({title:'File taxes',label:'Taxes',building_type:'town hall',due,remind_at,tiny_first_step:'Open the tax folder.'});
test('tasks sort by due date while undated tasks remain available',()=>{
 const state=initialState(0);addTasks(state,[task(),{...task(new Date(120000).toISOString()),title:'later'},{...task(new Date(60000).toISOString()),title:'sooner'}]);
 assert.equal(state.tasks.find(t=>t.id===state.nextTaskId)?.title,'sooner');assert.equal(state.pet.stage,'happy');
});
test('health drains only for actual elapsed overdue time, never before due',()=>{
 const state=initialState(0);addTasks(state,[task(new Date(60000).toISOString())]);advanceState(state,60000);assert.equal(state.pet.health,100);advanceState(state,120000);assert.equal(state.pet.health,99.25);
});
test('an ignored next task gets a thirty-minute grace; health thresholds are stable',()=>{
 const state=initialState(0);addTasks(state,[task()]);advanceState(state,30*60000);assert.equal(state.pet.health,100);advanceState(state,35*60000);assert.equal(state.pet.health,99);
 assert.deepEqual([100,69,44,19,0].map(healthStage),['happy','hungry','sick','critical','ghost']);
});
test('a focus timer pauses neglect and overdue drain until focus ends',()=>{
 const state=initialState(0);addTasks(state,[task(new Date(0).toISOString())]);state.focusUntil=new Date(120000).toISOString();advanceState(state,60000);assert.equal(state.pet.health,100);advanceState(state,180000);assert.equal(state.pet.health,99.25);
});
test('reminders fire once even across many later ticks',()=>{
 const state=initialState(0);addTasks(state,[task(new Date(120000).toISOString(),new Date(60000).toISOString())]);
 assert.equal(advanceState(state,60000).filter(e=>e.kind==='reminder').length,1);assert.equal(advanceState(state,90000).filter(e=>e.kind==='reminder').length,0);assert.equal(advanceState(state,120000).filter(e=>e.kind==='reminder').length,0);
});
test('death produces one permanent grave, ghost becomes egg, only completion re-hatches',()=>{
 const state=initialState(0);addTasks(state,[task(new Date(0).toISOString())]);state.pet.health=1;
 assert.equal(advanceState(state,120000).filter(e=>e.kind==='death').length,1);assert.equal(state.pet.stage,'ghost');assert.equal(state.graves.length,1);
 assert.equal(state.graves[0].petName,'Biscuit');assert.equal(state.graves[0].portrait,null);
 assert.equal(advanceState(state,126000).filter(e=>e.kind==='death').length,0);assert.equal(state.pet.stage,'egg');
 addTasks(state,[{...task(),title:'Another thought'}]);assert.equal(state.pet.stage,'egg');assert.equal(state.pet.health,0);
 assert.equal(completeTask(state)[0].kind,'celebration');assert.equal(state.pet.stage,'eating');assert.equal(state.pet.awaitingHatch,false);assert.equal(state.pet.health,100);assert.equal(state.graves.length,1);
 advanceState(state,131000);assert.equal(state.pet.stage,'happy');
});
test('serialized atomic saves retain concurrent edits and survive reload',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'daytown-test-'));const file=join(dir,'state.json');
 try{const store=new DaytownStore(file,()=>{},0);await store.load();await Promise.all([store.transact(state=>addTasks(state,[task()])),store.transact(state=>addTasks(state,[{...task(),title:'Second'}]))]);const saved=JSON.parse(await readFile(file,'utf8'));assert.equal(saved.tasks.length,2);assert.equal(saved.revision,2);const restored=new DaytownStore(file);await restored.load();assert.equal(restored.snapshot().tasks.length,2);}finally{await rm(dir,{recursive:true,force:true});}
});
