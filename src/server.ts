import '../config.mjs';
import express from 'express';
import type {Request,Response} from 'express';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,appendFile,writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {bootstrapDemoAssets} from './bootstrap.ts';
import {launchDesktopPet,launchDesktopApp,launchCompanionVoice} from './native.ts';
import {getCodexPetConnection,connectCodexPet,getLinkedPetPath} from './codex-link.ts';
import {codexNotifyStatus,installCodexNotify} from './codex-notify.ts';
import {DaytownStore,selectTask,startWork,stopWork,setReadiness,advanceState,addTasks,completeTask,death,healthStage,nextTask,seedWeek,validDate,claimReminder,pendingReminderEvents} from './store.ts';
import type {DaytownState,TownEvent} from './store.ts';
import {parseVoiceCommand,transcribeAudio,epitaphFor,spokenLine,normalizeCommandDates} from './voice.ts';
import type {ParsedCommand} from './voice.ts';
import {ensureTownAssets,getAssetStatus,setAssetEventHandler} from './images.ts';
import {renderTown,getTownLayout} from './compositor.ts';

const root=fileURLToPath(new URL('..',import.meta.url));
const port=Number(process.env.PORT||3000);
const httpError=(message:string,status=400)=>Object.assign(new Error(message),{status});
export async function persistGravePortrait(store:DaytownStore,graveId:string,sourceFile:string,directory=resolve(root,'data/assets/graves')){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(graveId)||!store.snapshot().graves.some(grave=>grave.id===graveId&&!grave.portrait))return;
 // Capture bytes immediately: reconnecting a different pet must not change an
 // existing memorial. Both source and snapshot stay in ignored local data.
 const portrait=readFileSync(sourceFile);
 await mkdir(directory,{recursive:true});
 try{await writeFile(resolve(directory,graveId+'.png'),portrait,{flag:'wx'});}catch(error:any){if(error.code!=='EEXIST')throw error;}
 await store.transact(state=>{const grave=state.graves.find(item=>item.id===graveId);if(grave&&!grave.portrait)grave.portrait='/generated/graves/'+graveId+'.png';});
}
export async function createApp(options:{stateFile?:string;clock?:boolean}={}){
 await bootstrapDemoAssets(root);
 const app=express();const clients=new Set<Response>();let store:DaytownStore;let codexSequence=0,latestCodex:any=null;
 const audioCache=new Map<string,Buffer>();const codexSeen=new Set<string>();
 const petPresence=new Map<string,number>();
 const hasOpenPet=()=>{const now=Date.now();for(const [id,lastSeen] of petPresence)if(now-lastSeen>=35000)petPresence.delete(id);return petPresence.size>0;};
 const broadcast=(event:TownEvent)=>{const data=`data: ${JSON.stringify(event)}\n\n`;for(const client of clients)client.write(data);};
 const commitEvent=(event:TownEvent)=>{
  broadcast(event);
  if(event.state)ensureTownAssets(event.state);
  if(event.kind==='death'&&event.graveId){
   const snapshot=store.snapshot();const task=snapshot.tasks.find(t=>t.id===event.taskId);
   const portraitSource=getLinkedPetPath('happy')||resolve(root,'data/assets/pet-happy.png');
   void persistGravePortrait(store,event.graveId,portraitSource).catch(()=>{});
   if(process.env.OPENAI_API_KEY)epitaphFor(task,snapshot.pet.name,snapshot.now).then(epitaph=>store.transact(state=>{const grave=state.graves.find(g=>g.id===event.graveId);if(grave)grave.epitaph=epitaph;})).catch(()=>{});
  }
 };
 store=new DaytownStore(options.stateFile||resolve(root,'data/state.json'),commitEvent);await store.load();
 setAssetEventHandler(()=>broadcast({kind:'assets',state:store.snapshot()}));ensureTownAssets(store.snapshot());
 app.disable('x-powered-by');
 app.use((req,res,next)=>{
  if(![`localhost:${port}`,`127.0.0.1:${port}`,`[::1]:${port}`].includes(req.headers.host||''))return res.status(403).json({error:'Localhost only'});
  const origin=req.headers.origin;const trustedOrigin=!origin||[`http://localhost:${port}`,`http://127.0.0.1:${port}`,`http://[::1]:${port}`].includes(origin)||/^chrome-extension:\/\/[a-p]{32}$/.test(origin);
  if(!trustedOrigin)return res.status(403).json({error:'Use Daytown from localhost or its installed extension.'});
  if(origin){res.set('Access-Control-Allow-Origin',origin);res.vary('Origin');res.set('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.set('Access-Control-Allow-Headers','Content-Type');}
  if(req.method==='OPTIONS')return res.sendStatus(204);next();
 });
 app.use(express.json({limit:'64kb'}));
 app.get('/api/state',(req,res)=>res.json(store.snapshot()));
 app.get('/api/codex-pet',(req,res)=>res.json(getCodexPetConnection()));
 app.post('/api/codex-pet/connect',async(req,res)=>{
  const connection=await connectCodexPet();await store.transact(state=>{state.pet.name=connection.name;});
  res.json({...connection,state:store.snapshot()});
 });
 app.post('/api/app-launch',async(req,res)=>res.json({ok:true,kind:await launchDesktopApp(root,`http://localhost:${port}`)}));
 app.get('/api/codex-link',async(req,res)=>res.json({...await codexNotifyStatus(root),activity:store.snapshot().codex}));
 app.post('/api/codex-link',async(req,res)=>res.json(await installCodexNotify(root)));
 app.post('/api/companion-launch',async(req,res)=>res.json({ok:true,kind:await launchCompanionVoice(root,`http://localhost:${port}`)}));
 app.get('/api/status',(req,res)=>res.json({keyConfigured:!!process.env.OPENAI_API_KEY,latest:latestCodex,sequence:codexSequence,product:'Daytown',assets:getAssetStatus(store.snapshot())}));
 app.get('/api/events',(req,res)=>{
  const snapshot=store.snapshot();
  res.set({'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});res.flushHeaders();res.write(`data: ${JSON.stringify({kind:'state',state:snapshot})}\n\n`);
  // A reminder can become due while every dashboard/pet is closed. Replay it
  // until one client claims its persisted fired timestamp, without firing anew.
  for(const event of pendingReminderEvents(snapshot))res.write(`data: ${JSON.stringify(event)}\n\n`);
  clients.add(res);
  const heartbeat=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clients.delete(res);clearInterval(heartbeat);});
 });
 app.get('/api/assets',(req,res)=>res.json(getAssetStatus(store.snapshot())));
 app.get('/api/pet-presence',(req,res)=>res.json({open:hasOpenPet()}));
 app.post('/api/pet-presence',(req,res)=>{
  const {clientId,open}=req.body;
  if(typeof clientId!=='string'||!/^[a-zA-Z0-9._:-]{1,100}$/.test(clientId)||typeof open!=='boolean')throw httpError('A client ID and pet window state are required.');
  hasOpenPet();
  if(open){petPresence.set(clientId,Date.now());if(petPresence.size>64)petPresence.delete(petPresence.keys().next().value!);}
  else petPresence.delete(clientId);
  res.json({open:hasOpenPet()});
 });
 app.get('/api/layout',(req,res)=>res.json(getTownLayout(store.snapshot())));
 app.get('/api/town.png',async(req,res)=>{const state=store.snapshot();res.type('png').set('Cache-Control','no-cache').send(await renderTown(state));});
 app.get('/api/poster.png',async(req,res)=>{res.type('png').set('Content-Disposition','attachment; filename="my-daytown-week.png"').send(await renderTown(store.snapshot(),{poster:true}));});
 app.post('/api/images',(req,res)=>{ensureTownAssets(store.snapshot());res.status(202).json(getAssetStatus(store.snapshot()));});
 app.post('/api/desktop-launch',async(req,res)=>{
  res.json({ok:true,kind:await launchDesktopPet(root,`http://localhost:${port}`)});
 });
 app.post('/api/transcribe',express.raw({type:['audio/*','video/webm','application/octet-stream'],limit:'24mb'}),async(req,res)=>{
  if(!Buffer.isBuffer(req.body)||req.body.length<100)throw httpError('Hold the mic a little longer and say a few words.');res.json({text:await transcribeAudio(req.body,req.headers['content-type']||'audio/webm')});
 });
 async function executeParsed(parsed:ParsedCommand){
  if(parsed.needs_clarification)return {action:'clarify',needs_clarification:true,reply:parsed.clarification_question||'Which task did you finish?',state:store.snapshot()};
  let reply='';
  await store.transact((state,events)=>{
   events.push(...advanceState(state));
   if(parsed.action==='ready'||parsed.action==='gassed'){if(parsed.action==='ready'&&parsed.task_id)selectTask(state,parsed.task_id);reply=setReadiness(state,parsed.action,parsed.minutes||5);}
   else if(parsed.action==='add')addTasks(state,parsed.tasks);
   else if(parsed.action==='done'){
    const ids=parsed.completed_task_ids?.length?parsed.completed_task_ids:[parsed.task_id||nextTask(state)?.id];
    if(!ids.length||ids.some(id=>!state.tasks.some(task=>task.id===id&&task.status==='todo')))throw httpError('One of those tasks is already done or is unavailable. Which task did you finish?');
    const names=ids.map(id=>state.tasks.find(task=>task.id===id)!.title);
    for(const id of ids)events.push(...completeTask(state,id));
    reply='I’ve taken '+names.join(' and ')+' off your pinboard.';
    if(parsed.readiness==='gassed')reply+=' '+setReadiness(state,'gassed',parsed.minutes||5);
    else if(parsed.readiness==='ready'&&nextTask(state))reply+=' '+setReadiness(state,'ready',parsed.minutes||5);
   }

   else if(parsed.action==='move'||parsed.action==='remind'||parsed.action==='snooze'){
    const task=parsed.task_id?state.tasks.find(t=>t.id===parsed.task_id&&t.status==='todo'):nextTask(state);if(!task)throw httpError('Choose a task first.');
    if(parsed.action==='snooze'){task.remind_at=new Date(Date.parse(state.now)+(parsed.minutes||15)*60000).toISOString();delete task.reminderFiredAt;}
    else if(parsed.action==='move'){const when=validDate(parsed.when);if(!when)throw httpError('Which day should that move to?');task.due=when;task.remind_at=new Date(Date.parse(when)-15*60000).toISOString();delete task.reminderFiredAt;}
    else {const when=validDate(parsed.when);if(!when)throw httpError('When should I remind you?');task.remind_at=when;delete task.reminderFiredAt;}
    state.lastInteractionAt=state.now;
   }else state.lastInteractionAt=state.now;
   state.pressure=0;state.codex.awaitingReturn=false;state.lastInteractionAt=state.now;
  });
  if(parsed.action!=='add'&&parsed.acknowledgement)reply=parsed.acknowledgement;
  if(!reply&&parsed.action==='next')reply=nextTask(store.snapshot())?.tiny_first_step||'Your pinboard is clear, so you can enjoy a breather.';
  return {action:parsed.action,reply,state:store.snapshot()};
 }
 function commandText(body:any){if(typeof body?.text!=='string'||!body.text.trim()||body.text.length>4000)throw httpError('Say or type a thought under 4000 characters.');return body.text;}
 app.post('/api/parse',async(req,res)=>{
  const snapshot=store.snapshot();const command=await parseVoiceCommand(commandText(req.body),snapshot);
  res.json({command,now:snapshot.now,timeZone:'Europe/London'});
 });
 app.post('/api/commit-command',async(req,res)=>{
  res.json(await executeParsed(normalizeCommandDates(req.body?.command)));
 });
 app.post('/api/command',async(req,res)=>{
  const parsed=await parseVoiceCommand(commandText(req.body),store.snapshot());
  res.json(await executeParsed(parsed));
 });
 app.post('/api/action',async(req,res)=>{
  const {action,taskId}=req.body;let reply='';await store.transact((state,events)=>{
   events.push(...advanceState(state));
   if(action==='ready'||action==='gassed'){if(action==='ready'&&taskId)selectTask(state,taskId);reply=setReadiness(state,action,Number(req.body.minutes)||5);}
   else if(action==='select'){selectTask(state,taskId);reply='Your workbench is ready for '+nextTask(state)?.title+'.';}
   else if(action==='pause'){stopWork(state);state.focusUntil=null;state.lastInteractionAt=state.now;state.pressure=0;state.codex.awaitingReturn=false;reply='Your work timer is paused.';}
   else if(action==='done')events.push(...completeTask(state,taskId));
   else if(action==='focus'){if(taskId)selectTask(state,taskId);reply=setReadiness(state,'ready',Math.max(1,Math.min(60,Number(req.body.minutes)||5)));}
   else if(action==='snooze'){const task=taskId?state.tasks.find(t=>t.id===taskId&&t.status==='todo'):nextTask(state);if(!task)throw httpError('Choose an unfinished task.');task.remind_at=new Date(Date.parse(state.now)+Math.max(1,Math.min(10080,Number(req.body.minutes)||15))*60000).toISOString();delete task.reminderFiredAt;state.lastInteractionAt=state.now;}
   else if(action==='next')state.lastInteractionAt=state.now;
   else throw httpError('Unknown action.');
   state.pressure=0;state.codex.awaitingReturn=false;state.lastInteractionAt=state.now;
  });res.json({reply,state:store.snapshot()});
 });
 app.post('/api/debug',async(req,res)=>{
  const {action}=req.body;
  await store.transact((state,events)=>{
   events.push(...advanceState(state));
   if(action==='seed'){const graves=state.graves;Object.assign(state,seedWeek(Date.now()));state.graves=graves;const linked=getCodexPetConnection();if(linked.connected&&linked.name)state.pet.name=linked.name;}
   else if(action==='advance'){const minutes=Number(req.body.minutes);if(!Number.isFinite(minutes)||minutes<0||minutes>10080)throw httpError('Advance time by 0 to 10080 minutes.');state.clockOffsetMs+=minutes*60000;events.push(...advanceState(state));}
   else if(action==='pressure'){const value=Number(req.body.value);if(!Number.isFinite(value)||value<0||value>100)throw httpError('Pressure must be between 0 and 100.');if(state.pet.awaitingHatch)throw httpError('Finish one tiny step to hatch the egg first.');state.pressure=value;events.push(...advanceState(state));}
   else if(action==='codex-done'){state.codex={status:'done',awaitingReturn:true,completedAt:state.now};}
   else if(action==='health'){const value=Number(req.body.value);if(!Number.isFinite(value)||value<0||value>100)throw httpError('Health must be between 0 and 100.');if(state.pet.awaitingHatch&&value>0)throw httpError('Complete a tiny step to hatch the egg.');state.pet.health=value;if(value===0)death(state,nextTask(state),events);else state.pet.stage=healthStage(value);}
   else if(action==='celebrate'){const task=state.tasks.find(t=>t.id===req.body.taskId)||nextTask(state)||state.tasks.at(-1);if(task)events.push({kind:'celebration',taskId:task.id,text:'A little moment worth celebrating.'});}
   else throw httpError('Unknown demo control.');
  });res.json({state:store.snapshot()});
 });
 app.post('/api/tts',async(req,res)=>{
  const text=req.body.text;if(typeof text!=='string'||!text.trim()||text.length>300)throw httpError('Pet voice lines must be 1 to 300 characters.');
  const format=req.body.format==='wav'?'wav':'mp3';
  const key=createHash('sha256').update(`${process.env.TTS_MODEL}:${process.env.TTS_VOICE}:${format}:${text}`).digest('hex');let audio=audioCache.get(key);
  if(!audio){audio=await spokenLine(text,format);audioCache.set(key,audio);if(audioCache.size>30)audioCache.delete(audioCache.keys().next().value!);}
  res.type(format==='wav'?'audio/wav':'audio/mpeg').set('Cache-Control','private, max-age=3600').send(audio);
 });
 app.post('/api/reminders/claim',async(req,res)=>{
  const {taskId,reminderAt}=req.body;
  const claimed=await store.transact(state=>claimReminder(state,taskId,reminderAt));
  res.json({claimed});
 });
 app.post('/api/codex-start',async(req,res)=>{await store.transact(state=>{state.codex={status:'running',awaitingReturn:false,completedAt:null};});res.json({ok:true});});
 app.post('/api/codex-event',async(req,res)=>{
  if(req.body.type!=='agent-turn-complete')throw httpError('Expected agent-turn-complete');
  const id=`${req.body['thread-id']||''}:${req.body['turn-id']||''}`;
  if(id!==':'&&codexSeen.has(id))return res.json({ok:true,duplicate:true});if(id!==':')codexSeen.add(id);if(codexSeen.size>500)codexSeen.delete(codexSeen.values().next().value!);
  latestCodex={type:'agent-turn-complete',threadId:String(req.body['thread-id']||'').slice(0,160),turnId:String(req.body['turn-id']||'').slice(0,160),at:Date.now()};codexSequence++;
  await store.transact((state,events)=>{events.push(...advanceState(state));state.codex={status:'done',awaitingReturn:true,completedAt:state.now};});
  await mkdir(resolve(root,'runtime'),{recursive:true});await appendFile(resolve(root,'runtime/codex-events.jsonl'),JSON.stringify(latestCodex)+'\n');res.json({ok:true,sequence:codexSequence});
 });
 // Generated content contains images only. Never expose the state file or .env.
 app.use('/generated',(req,res,next)=>{if(!/\.(png|webp|jpe?g)$/i.test(req.path))return res.sendStatus(404);next();},express.static(resolve(root,'data/assets')));
 app.use('/assets',express.static(resolve(root,'assets')));
 app.use(express.static(resolve(root,'public')));
 app.use((error:any,req:Request,res:Response,next:unknown)=>{console.error('Daytown request failed:',error.status||502,error.name||'Error');res.status(error.status||502).json({error:error.message||'Please try again.',...(error.code?{code:error.code}:{}),...(error.field?{field:error.field,reason:error.reason,timeZone:'Europe/London'}:{})});});
 const timer=options.clock===false?null:setInterval(()=>store.tick().catch(()=>console.error('Could not save Daytown state.')),1000);
 return {app,store,close:()=>{if(timer)clearInterval(timer);for(const client of clients)client.end();}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const {app}=await createApp();app.listen(port,'::1',()=>console.log(`Daytown → http://localhost:${port}`));
}
