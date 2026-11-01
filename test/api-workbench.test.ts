import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../src/server.ts';
import {addTasks} from '../src/store.ts';

test('HTTP actions target the selected task, pause work, take breaks and acknowledge Codex once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'daytown-work-api-')),oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='';
 const daytown=await createApp({stateFile:join(dir,'state.json'),clock:false});
 const server=daytown.app.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done));const port=(server.address() as any).port;
 const post=(path:string,body:unknown)=>new Promise<any>((done,fail)=>{const request=http.request({host:'127.0.0.1',port,path,method:'POST',headers:{Host:`localhost:${process.env.PORT||3000}`,'Content-Type':'application/json'}},response=>{let text='';response.on('data',data=>text+=data);response.on('end',()=>done({status:response.statusCode,...JSON.parse(text)}));});request.on('error',fail);request.end(JSON.stringify(body));});
 try{
  await daytown.store.transact(state=>addTasks(state,[{title:'First fictional task',tiny_first_step:'Open a file.'},{title:'Second fictional task',tiny_first_step:'Read one line.'}]));
  const [first,second]=daytown.store.snapshot().tasks;
  const event={type:'agent-turn-complete','thread-id':'fake-api-thread','turn-id':'fake-api-turn'};
  assert.equal((await post('/api/codex-event',event)).sequence,1);
  assert.equal((await post('/api/codex-event',event)).duplicate,true);
  assert.equal(daytown.store.snapshot().codex.awaitingReturn,true);
  const ready=await post('/api/action',{action:'ready',taskId:second.id});assert.equal(ready.status,200);assert.equal(ready.state.workSession.taskId,second.id);assert.equal(ready.state.codex.awaitingReturn,false);assert.ok(ready.reply.includes('minutes'));
  const selected=await post('/api/action',{action:'select',taskId:first.id});assert.equal(selected.state.nextTaskId,first.id);assert.equal(selected.state.workSession.taskId,first.id);
  const paused=await post('/api/action',{action:'pause'});assert.equal(paused.state.workSession,null);assert.equal(paused.state.focusUntil,null);
  const rest=await post('/api/action',{action:'gassed'});assert.ok(Date.parse(rest.state.breakUntil)>Date.parse(rest.state.now));assert.equal(rest.state.pressure,0);
  const invalid=await post('/api/action',{action:'select',taskId:'does-not-exist'});assert.equal(invalid.status,400);assert.equal(daytown.store.snapshot().activeTaskId,first.id);
 }finally{daytown.close();await new Promise<void>(done=>server.close(()=>done()));if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;await rm(dir,{recursive:true,force:true});}
});
