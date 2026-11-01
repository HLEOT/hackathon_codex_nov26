import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {initialState,addTasks,advanceState,claimReminder,completeTask,pendingReminderEvents} from '../src/store.ts';
import {createApp} from '../src/server.ts';
const reminderTask={title:'Fictional task',label:'Sample',tiny_first_step:'Open the sample folder.',due:new Date(15*60000).toISOString(),remind_at:new Date(60000).toISOString()};
test('unclaimed reminders survive no-client ticks/reload; claim, completion and snooze stop replay',()=>{
 const state=initialState(0);addTasks(state,[reminderTask]);advanceState(state,120000);
 const reloaded=JSON.parse(JSON.stringify(state));const firedAt=reloaded.tasks[0].reminderFiredAt;
 const pending=pendingReminderEvents(reloaded);assert.equal(pending.length,1);assert.equal(pending[0].taskId,reloaded.tasks[0].id);assert.match(pending[0].text!,/13 minutes/);
 assert.equal(claimReminder(reloaded,reloaded.tasks[0].id,firedAt),true);assert.equal(pendingReminderEvents(reloaded).length,0);
 const snoozed=JSON.parse(JSON.stringify(state));snoozed.tasks[0].remind_at=new Date(180000).toISOString();delete snoozed.tasks[0].reminderFiredAt;
 assert.equal(pendingReminderEvents(snoozed).length,0);advanceState(snoozed,180000);assert.equal(pendingReminderEvents(snoozed).length,1);
 const completed=JSON.parse(JSON.stringify(state));completeTask(completed,completed.tasks[0].id);assert.equal(pendingReminderEvents(completed).length,0);
 const future=JSON.parse(JSON.stringify(state));future.tasks[0].remind_at=new Date(300000).toISOString();assert.equal(pendingReminderEvents(future).length,0);
});
function jsonRequest(port:number,path:string,body?:unknown){return new Promise<any>((resolve,reject)=>{
 const request=http.request({host:'127.0.0.1',port,path,method:body===undefined?'GET':'POST',headers:{Host:`localhost:${process.env.PORT||3000}`,...(body===undefined?{}:{'Content-Type':'application/json'})}},response=>{let data='';response.on('data',chunk=>data+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(data)}));});request.on('error',reject);if(body!==undefined)request.write(JSON.stringify(body));request.end();
});}
test('SSE connection replays a previously fired reminder, and pet presence expires across clients',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'daytown-replay-'));const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='';
 const daytown=await createApp({stateFile:join(dir,'state.json'),clock:false});const server=daytown.app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const port=(server.address() as any).port;
 try{
  await daytown.store.transact(state=>{Object.assign(state,initialState(0));addTasks(state,[reminderTask]);advanceState(state,120000);});
  const messages=await new Promise<any[]>((resolve,reject)=>{
   const request=http.get({host:'127.0.0.1',port,path:'/api/events',headers:{Host:`localhost:${process.env.PORT||3000}`}},response=>{let data='';response.on('data',chunk=>{data+=chunk;const messages=data.split('\n\n').filter(frame=>frame.startsWith('data: ')).map(frame=>JSON.parse(frame.slice(6)));if(messages.length>=2){resolve(messages);request.destroy();}});});request.on('error',reject);request.setTimeout(2000,()=>{request.destroy();reject(new Error('SSE reminder replay timed out'));});
  });
  assert.deepEqual(messages.slice(0,2).map(message=>message.kind),['state','reminder']);assert.equal(messages[1].state.tasks[0].reminderFiredAt,new Date(120000).toISOString());
  let now=100000;t.mock.method(Date,'now',()=>now);
  assert.deepEqual((await jsonRequest(port,'/api/pet-presence')).body,{open:false});
  assert.equal((await jsonRequest(port,'/api/pet-presence',{clientId:'dashboard-1',open:true})).body.open,true);
  assert.equal((await jsonRequest(port,'/api/pet-presence',{clientId:'extension-1',open:true})).body.open,true);
  assert.equal((await jsonRequest(port,'/api/pet-presence',{clientId:'dashboard-1',open:false})).body.open,true);
  now+=36000;assert.equal((await jsonRequest(port,'/api/pet-presence')).body.open,false);
  assert.equal((await jsonRequest(port,'/api/pet-presence',{clientId:'not a valid id',open:true})).status,400);
 }finally{daytown.close();await new Promise<void>(resolve=>server.close(()=>resolve()));if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;await rm(dir,{recursive:true,force:true});}
});
