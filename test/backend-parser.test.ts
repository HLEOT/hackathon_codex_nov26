import test from 'node:test';
import assert from 'node:assert/strict';
import {parseVoiceCommand,validateCommand,epitaphFor} from '../src/voice.ts';
import {initialState} from '../src/store.ts';
const empty={task_id:null,tasks:[],when:null,minutes:null};
const added={id:'',title:'Dentist appointment',due:'2026-11-05T15:00:00.000Z',remind_at:'2026-11-05T14:45:00.000Z',building_type:'clinic',label:'Dentist',tiny_first_step:'Find the appointment email.'};
function reply(json:unknown){return new Response(JSON.stringify({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(json)}]}]}),{status:200,headers:{'Content-Type':'application/json'}});}
test('brain-dump parser requests strict Structured Outputs and preserves multiple tasks/dates',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-not-a-secret';
 try{
  let body:any;t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{body=JSON.parse(options.body);return reply({...empty,action:'add',tasks:[added,{...added,title:'File taxes',label:'Taxes',building_type:'town hall'}]});});
  const state=initialState(Date.parse('2026-11-01T11:00:00Z'));const result=await parseVoiceCommand('dentist Thursday at 3, taxes Friday',state);
  assert.equal(result.tasks.length,2);assert.equal(result.tasks[0].due,added.due);assert.match(body.instructions,/Europe\/London/);assert.match(body.instructions,/2026-11-01T11:00:00/);assert.equal(body.text.format.type,'json_schema');assert.equal(body.text.format.strict,true);assert.equal(body.text.format.schema.additionalProperties,false);assert.equal(body.store,false);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('all edit actions share the same enum parser and unsupported actions are rejected',()=>{
 for(const action of ['done','move','remind','next','snooze','show_week','ready','gassed'])assert.equal(validateCommand({...empty,action}).action,action);
 assert.throws(()=>validateCommand({...empty,action:'delete_everything'}),/Unknown command/);
 assert.throws(()=>validateCommand({...empty,action:'add',tasks:[{...added,due:'Thursdayish'}]}),/date/);
 assert.throws(()=>validateCommand({...empty,action:'snooze',minutes:-4}),/snooze/);
});
test('readiness and tiredness are cooperative voice actions rather than new tasks',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-not-a-secret';
 try{let body:any,call=0;t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{body=JSON.parse(options.body);return reply({...empty,action:call++===0?'ready':'gassed',minutes:5});});const state=initialState();assert.equal((await parseVoiceCommand('I am ready',state)).action,'ready');assert.equal((await parseVoiceCommand('I am gassed',state)).action,'gassed');assert.match(body.instructions,/never new tasks or medical assessments/);assert.ok(body.text.format.schema.properties.action.enum.includes('ready'));assert.ok(body.text.format.schema.properties.action.enum.includes('gassed'));assert.equal(state.tasks.length,0);}finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('natural reports can complete multiple matched tasks and express readiness in one strict response',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-not-a-secret';
 try{
  const acknowledgement='I’ve marked the auth tests and PR 42 as done, and we can take five minutes to rest.';
  let body:any;t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{body=JSON.parse(options.body);return reply({...empty,action:'done',task_id:'auth-existing',completed_task_ids:['auth-existing','pr-existing'],readiness:'gassed',needs_clarification:false,clarification_question:null,acknowledgement});});
  const state=initialState();state.tasks.push({...added,id:'auth-existing',title:'Fix flaky auth tests',createdAt:state.now,status:'todo'},{...added,id:'pr-existing',title:'Review PR 42',createdAt:state.now,status:'todo'});state.activeTaskId='auth-existing';
  const result=await parseVoiceCommand('I fixed auth tests and reviewed PR 42, I am gassed',state);assert.deepEqual(result.completed_task_ids,['auth-existing','pr-existing']);assert.equal(result.readiness,'gassed');assert.equal(result.needs_clarification,false);assert.match(body.instructions,/natural progress reports semantically/);assert.match(body.instructions,/negated completion must NEVER mark a task done/);assert.match(body.instructions,/Active task ID: auth-existing/);
  for(const field of ['completed_task_ids','readiness','needs_clarification','clarification_question','acknowledgement'])assert.ok(body.text.format.schema.required.includes(field));assert.equal(body.text.format.schema.properties.completed_task_ids.maxItems,30);assert.equal(body.text.format.schema.properties.acknowledgement.maxLength,240);assert.equal(result.acknowledgement,acknowledgement);assert.match(body.instructions,/only after the server successfully applies the change/);assert.match(body.instructions,/never that they are saved before confirmation/);assert.equal(body.text.format.strict,true);assert.equal(state.tasks.filter(task=>task.status==='done').length,0);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('uncertain completion reports ask a kind question instead of inventing a task or completing the active task',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-not-a-secret';
 try{
  let body:any;t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{body=JSON.parse(options.body);return reply({...empty,action:'next',completed_task_ids:[],readiness:null,needs_clarification:true,clarification_question:'Which task did you finish?'});});
  const state=initialState();state.tasks.push({...added,id:'known',createdAt:state.now,status:'todo'});state.activeTaskId='known';const result=await parseVoiceCommand('I finished that other thing',state);assert.equal(result.needs_clarification,true);assert.equal(result.action,'next');assert.deepEqual(result.completed_task_ids,[]);assert.equal(result.task_id,null);assert.equal(result.clarification_question,'Which task did you finish?');assert.match(body.instructions,/do not silently fall back to completing the active task/);assert.match(body.instructions,/clarify before applying any of them/);assert.equal(state.tasks[0].status,'todo');
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('report fields reject duplicate or malformed IDs and malformed clarification, while legacy commands remain valid',()=>{
 assert.equal(validateCommand({...empty,action:'done'}).completed_task_ids,undefined);
 for(const ids of [['same','same'],[''],[123],Array.from({length:31},(_,index)=>'id-'+index)])assert.throws(()=>validateCommand({...empty,action:'done',completed_task_ids:ids}),/unique existing task IDs/);
 assert.throws(()=>validateCommand({...empty,action:'next',readiness:'maybe'}),/Readiness/);
 assert.throws(()=>validateCommand({...empty,action:'next',needs_clarification:'yes'}),/Clarification/);
 assert.throws(()=>validateCommand({...empty,action:'next',needs_clarification:true,clarification_question:null}),/Ask a short question/);
 assert.throws(()=>validateCommand({...empty,action:'next',acknowledgement:42}),/Acknowledgements/);
 assert.throws(()=>validateCommand({...empty,action:'next',acknowledgement:'x'.repeat(241)}),/Acknowledgements/);
 assert.equal(validateCommand({...empty,action:'next',needs_clarification:true,clarification_question:'Which task did you finish?',acknowledgement:''}).acknowledgement,'');
});
test('day-only moves preserve an existing London appointment time instead of the new-task default',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-not-a-secret';
 try{
  let body:any;t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{body=JSON.parse(options.body);return reply({...empty,action:'move',task_id:'dentist-existing',when:'2026-11-06T15:00:00.000Z'});});
  const state=initialState(Date.parse('2026-11-01T11:00:00Z'));state.tasks.push({...added,id:'dentist-existing',createdAt:state.now,status:'todo'});
  const result=await parseVoiceCommand('move dentist to Friday',state);
  assert.equal(result.when,'2026-11-06T15:00:00.000Z');assert.match(body.instructions,/For NEW tasks only/);assert.match(body.instructions,/day-only move of an existing task, preserve its existing Europe\/London time-of-day/);assert.match(body.instructions,/unless the user explicitly requests a new time/);assert.match(body.instructions,/destination date's London offset/);assert.match(body.instructions,/2026-11-05T15:00:00.000Z/);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('remind me to do a new action creates its own task; reminding about an existing task is an edit',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-not-a-secret';
 try{
  const bodies:any[]=[];let call=0;t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{bodies.push(JSON.parse(options.body));return reply(call++===0?{...empty,action:'add',tasks:[{...added,title:'Stretch',label:'Stretch',due:null,remind_at:'2026-11-01T11:20:00.000Z',tiny_first_step:'Stand up and place both feet on the floor.'}]}:{...empty,action:'remind',task_id:'existing-dentist',when:'2026-11-01T11:30:00.000Z'});});
  const state=initialState(Date.parse('2026-11-01T11:00:00Z'));state.tasks.push({...added,id:'existing-dentist',createdAt:state.now,status:'todo'});
  const newReminder=await parseVoiceCommand('Remind me to stretch in 20 minutes',state);assert.equal(newReminder.action,'add');assert.equal(newReminder.task_id,null);assert.equal(newReminder.tasks[0].due,null);assert.equal(newReminder.tasks[0].remind_at,'2026-11-01T11:20:00.000Z');assert.match(bodies[0].instructions,/remind me TO <new action>/);assert.match(bodies[0].instructions,/Never interpret this as editing an unrelated next task/);assert.match(bodies[0].instructions,/leave due=null unless an explicit deadline is also stated/);
  const existingReminder=await parseVoiceCommand('Remind me about dentist in 30 minutes',state);assert.equal(existingReminder.action,'remind');assert.equal(existingReminder.task_id,'existing-dentist');assert.deepEqual(existingReminder.tasks,[]);assert.match(bodies[1].instructions,/remind me ABOUT <existing task>/);assert.match(bodies[1].instructions,/Preserve that existing task's deadline/);assert.equal(state.tasks[0].due,added.due);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('model refusal is surfaced safely and does not mutate tasks',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-not-a-secret';
 try{t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({output:[{content:[{type:'refusal',refusal:'No'}]}]})));const state=initialState();await assert.rejects(parseVoiceCommand('example',state),/different phrase/);assert.equal(state.tasks.length,0);}finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
test('epitaph generation asks for kindness and shares only the short label',async t=>{
 const old=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='unit-test-not-a-secret';
 try{let body:any;t.mock.method(globalThis,'fetch',async(_url:any,options:any)=>{body=JSON.parse(options.body);return reply({epitaph:'Here lies Biscuit. Off chasing a tiny receipt.'});});
 const result=await epitaphFor({...added,title:'Very private full task title',createdAt:'2026-11-01T11:00:00Z',status:'todo'},'Biscuit','2026-11-01T11:00:00Z');assert.match(body.instructions,/never cruel or shaming/);assert.doesNotMatch(body.input,/Very private/);assert.equal(body.text.format.strict,true);assert.match(result,/Biscuit/);
 }finally{if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;}
});
