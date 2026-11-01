import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DaytownStore,addTasks,advanceState,claimReminder} from '../src/store.ts';
test('dashboard and extension race for one spoken reminder; snooze permits a new delivery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'daytown-claim-'));
 try{
  const store=new DaytownStore(join(dir,'state.json'),()=>{},0);
  await store.transact(state=>{addTasks(state,[{title:'Fictional sample task',label:'SAMPLE',tiny_first_step:'Open sample',remind_at:new Date(60000).toISOString()}]);advanceState(state,60000);});
  let task=store.snapshot().tasks[0];const claims=await Promise.all([store.transact(state=>claimReminder(state,task.id,task.reminderFiredAt!)),store.transact(state=>claimReminder(state,task.id,task.reminderFiredAt!))]);
  assert.equal(claims.filter(Boolean).length,1);
  const reopened=new DaytownStore(join(dir,'state.json'));await reopened.load();assert.equal(claimReminder(reopened.snapshot(),task.id,task.reminderFiredAt!),false);
  await store.transact(state=>{state.tasks[0].remind_at=new Date(120000).toISOString();delete state.tasks[0].reminderFiredAt;advanceState(state,120000);});
  task=store.snapshot().tasks[0];assert.equal(await store.transact(state=>claimReminder(state,task.id,task.reminderFiredAt!)),true);
 }finally{await rm(dir,{recursive:true,force:true});}
});
