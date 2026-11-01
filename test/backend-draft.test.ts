import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizeLondonDate,normalizeCommandDates,CommandDateError} from '../src/voice.ts';
import {createApp} from '../src/server.ts';
const command=()=>({action:'add',task_id:null,when:null,minutes:null,tasks:[{id:'',title:'Fictional appointment',label:'SAMPLE',building_type:'clinic',tiny_first_step:'Find the appointment details.',due:'2026-07-01T15:00',remind_at:'2026-07-01T14:45'}]});
test('edited local dates use London summer/winter offsets independently of server timezone',()=>{
 assert.equal(normalizeLondonDate('2026-07-01T15:00'),'2026-07-01T14:00:00.000Z');
 assert.equal(normalizeLondonDate('2026-11-01T15:00'),'2026-11-01T15:00:00.000Z');
 assert.equal(normalizeLondonDate('2028-02-29T10:15:30.125'),'2028-02-29T10:15:30.125Z');
 const normalized=normalizeCommandDates(command());assert.equal(normalized.tasks[0].due,'2026-07-01T14:00:00.000Z');assert.equal(normalized.tasks[0].remind_at,'2026-07-01T13:45:00.000Z');
});
test('invalid calendar dates and DST gaps/folds are rejected with field-specific feedback',()=>{
 for(const [value,reason] of [['2026-02-30T15:00','invalid'],['2026-03-29T01:30','nonexistent'],['2026-10-25T01:30','ambiguous']] as const){
  assert.throws(()=>normalizeLondonDate(value,'tasks[0].due'),error=>error instanceof CommandDateError&&error.status===400&&error.code==='INVALID_DATE'&&error.field==='tasks[0].due'&&error.reason===reason);
 }
 assert.equal(normalizeLondonDate('2026-10-25T01:30:00+01:00'),'2026-10-25T00:30:00.000Z');
 assert.equal(normalizeLondonDate('2026-10-25T01:30:00+00:00'),'2026-10-25T01:30:00.000Z');
 assert.equal(normalizeLondonDate(null),null);assert.equal(normalizeLondonDate(''),null);
});
function requestJson(port:number,path:string,body:unknown){return new Promise<any>((resolve,reject)=>{
 const request=http.request({host:'127.0.0.1',port,path,method:'POST',headers:{Host:`localhost:${process.env.PORT||3000}`,'Content-Type':'application/json'}},response=>{let body='';response.on('data',chunk=>body+=chunk);response.on('end',()=>resolve({status:response.statusCode,body:JSON.parse(body)}));});request.on('error',reject);request.end(JSON.stringify(body));
});}
test('parse previews do not mutate tasks; edited drafts commit once with explicit London conversion',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'daytown-draft-')),oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='';
 const daytown=await createApp({stateFile:join(dir,'state.json'),clock:false});const server=daytown.app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const port=(server.address() as any).port;
 try{
  const before=daytown.store.snapshot();process.env.OPENAI_API_KEY='unit-test-not-a-secret';
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({...command(),tasks:[{...command().tasks[0],due:'2026-07-01T14:00:00.000Z',remind_at:'2026-07-01T13:45:00.000Z'}]})}]}]})));
  const preview=await requestJson(port,'/api/parse',{text:'a fictional appointment Wednesday at three'});process.env.OPENAI_API_KEY='';
  assert.equal(preview.status,200);assert.equal(preview.body.timeZone,'Europe/London');assert.equal(preview.body.command.action,'add');assert.deepEqual(daytown.store.snapshot(),before);
  const draft=preview.body.command;draft.tasks[0].due='2026-07-02T16:30';draft.tasks[0].remind_at='2026-07-02T16:15';
  const committed=await requestJson(port,'/api/commit-command',{command:draft});assert.equal(committed.status,200);assert.equal(committed.body.action,'add');assert.equal(committed.body.state.tasks.length,1);assert.equal(committed.body.state.tasks[0].due,'2026-07-02T15:30:00.000Z');assert.equal(committed.body.state.tasks[0].remind_at,'2026-07-02T15:15:00.000Z');
  const count=daytown.store.snapshot().tasks.length;draft.tasks[0].due='2026-03-29T01:30';const invalid=await requestJson(port,'/api/commit-command',{command:draft});assert.equal(invalid.status,400);assert.equal(invalid.body.code,'INVALID_DATE');assert.equal(invalid.body.field,'tasks[0].due');assert.equal(invalid.body.reason,'nonexistent');assert.equal(daytown.store.snapshot().tasks.length,count);
  const invented=await requestJson(port,'/api/commit-command',{command:{action:'done',task_id:'invented-task-id',tasks:[],when:null,minutes:null}});assert.equal(invented.status,400);assert.equal(daytown.store.snapshot().tasks[0].status,'todo');
  const wrongType=await requestJson(port,'/api/commit-command',{command:{action:'done',task_id:0,tasks:[],when:null,minutes:null}});assert.equal(wrongType.status,400);assert.equal(wrongType.body.code,'INVALID_COMMAND');assert.equal(daytown.store.snapshot().tasks[0].status,'todo');
 }finally{daytown.close();await new Promise<void>(resolve=>server.close(()=>resolve()));if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;await rm(dir,{recursive:true,force:true});}
});
