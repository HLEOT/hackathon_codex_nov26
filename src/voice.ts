import '../config.mjs';
import {openai,transcribe as originalTranscribe} from '../api.mjs';
import type {DaytownState,Task} from './store.ts';
export type ParsedCommand={action:'add'|'done'|'move'|'remind'|'next'|'snooze'|'show_week'|'ready'|'gassed';task_id:string|null;tasks:Array<Pick<Task,'id'|'title'|'due'|'remind_at'|'building_type'|'label'|'tiny_first_step'>>;when:string|null;minutes:number|null};
export class CommandDateError extends Error {
 status=400;code='INVALID_DATE';timeZone='Europe/London';field:string;reason:'invalid'|'nonexistent'|'ambiguous';
 constructor(field:string,reason:'invalid'|'nonexistent'|'ambiguous'){
  super(reason==='nonexistent'?`${field}: that London time does not exist because the clocks move forward. Choose another time.`:reason==='ambiguous'?`${field}: that London time occurs twice when the clocks move back. Choose another time or specify an explicit UTC offset.`:`${field}: enter a valid date and time.`);
  this.field=field;this.reason=reason;
 }
}
const londonClock=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',calendar:'iso8601',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
function utcFromParts(parts:number[]){const date=new Date(0);date.setUTCFullYear(parts[0],parts[1]-1,parts[2]);date.setUTCHours(parts[3],parts[4],parts[5]||0,parts[6]||0);return date.getTime();}
function londonParts(ms:number){const parts=Object.fromEntries(londonClock.formatToParts(new Date(ms)).map(part=>[part.type,part.value]));return ['year','month','day','hour','minute','second'].map(key=>Number(parts[key]));}
export function normalizeLondonDate(value:unknown,field='date'):string|null {
 if(value===null||value==='')return null;
 if(typeof value!=='string')throw new CommandDateError(field,'invalid');
 const match=value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/i);
 if(!match)throw new CommandDateError(field,'invalid');
 const requested=[Number(match[1]),Number(match[2]),Number(match[3]),Number(match[4]),Number(match[5]),Number(match[6]||0),Number((match[7]||'').padEnd(3,'0')||0)];
 const naive=utcFromParts(requested),date=new Date(naive);
 if(!Number.isFinite(naive)||date.getUTCFullYear()!==requested[0]||date.getUTCMonth()+1!==requested[1]||date.getUTCDate()!==requested[2]||date.getUTCHours()!==requested[3]||date.getUTCMinutes()!==requested[4]||date.getUTCSeconds()!==requested[5])throw new CommandDateError(field,'invalid');
 if(match[8]){const instant=Date.parse(value);if(!Number.isFinite(instant))throw new CommandDateError(field,'invalid');return new Date(instant).toISOString();}
 // Sample offsets on both sides of the desired date, then keep only instants
 // whose London wall clock exactly matches. Zero/two matches are DST gaps/folds.
 const offsets=new Set<number>();
 for(const hours of [-36,-12,0,12,36]){const probe=Math.floor((naive+hours*3600000)/1000)*1000;offsets.add(utcFromParts(londonParts(probe))-probe);}
 const candidates=[...offsets].map(offset=>naive-offset).filter(instant=>londonParts(instant).every((part,index)=>part===requested[index]));
 if(candidates.length!==1)throw new CommandDateError(field,candidates.length===0?'nonexistent':'ambiguous');
 return new Date(candidates[0]).toISOString();
}
export function normalizeCommandDates(command:unknown):ParsedCommand {
 if(!command||typeof command!=='object'||!Array.isArray((command as any).tasks))throw Object.assign(new Error('A parsed command with a tasks array is required.'),{status:400,code:'INVALID_COMMAND'});
 const parsed=structuredClone(command) as ParsedCommand;
 for(const [index,task] of parsed.tasks.entries()){if(!task||typeof task!=='object')throw Object.assign(new Error('Each task must be an object.'),{status:400,code:'INVALID_COMMAND'});task.due=normalizeLondonDate(task.due,`tasks[${index}].due`);task.remind_at=normalizeLondonDate(task.remind_at,`tasks[${index}].remind_at`);}
 parsed.when=normalizeLondonDate(parsed.when,'when');
 try{return validateCommand(parsed);}catch(error){throw Object.assign(error as Error,{status:400,code:'INVALID_COMMAND'});}
}
const nullableDate={type:['string','null']};
export const commandSchema={type:'object',additionalProperties:false,properties:{action:{type:'string',enum:['add','done','move','remind','next','snooze','show_week','ready','gassed']},task_id:{type:['string','null']},when:nullableDate,minutes:{type:['number','null']},tasks:{type:'array',items:{type:'object',additionalProperties:false,properties:{id:{type:'string'},title:{type:'string'},due:nullableDate,remind_at:nullableDate,building_type:{type:'string'},label:{type:'string'},tiny_first_step:{type:'string'}},required:['id','title','due','remind_at','building_type','label','tiny_first_step']}}},required:['action','task_id','tasks','when','minutes']};
function outputJson(result:any){
 const content=result.output?.flatMap((item:any)=>item.content||[])||[];
 if(content.some((item:any)=>item.type==='refusal'))throw new Error('Try a different phrase for that task.');
 if(result.status==='incomplete')throw new Error('That thought was cut short. Please try again.');
 return JSON.parse(content.filter((item:any)=>item.type==='output_text').map((item:any)=>item.text).join(''));
}
export function validateCommand(parsed:any):ParsedCommand{
 if(!parsed||typeof parsed!=='object')throw new Error('A parsed command is required.');
 if(!['add','done','move','remind','next','snooze','show_week','ready','gassed'].includes(parsed.action))throw new Error('Unknown command returned. Please try again.');
 if(parsed.task_id!==null&&(typeof parsed.task_id!=='string'||!parsed.task_id.trim()||parsed.task_id.length>180))throw new Error('Use an existing task ID, or null for the next task.');
 if(!Array.isArray(parsed.tasks)||parsed.tasks.length>30)throw new Error('Please add at most 30 tasks in one thought.');
 if(parsed.action==='add'&&!parsed.tasks.length)throw new Error('What would you like to get done?');
 for(const task of parsed.tasks){if(typeof task.title!=='string'||!task.title.trim()||typeof task.tiny_first_step!=='string'||!task.tiny_first_step.trim())throw new Error('A task needs a title and one tiny first step.');for(const key of ['due','remind_at'])if(task[key]!==null&&!Number.isFinite(Date.parse(task[key])))throw new Error('Could not resolve that task date. Try a specific day and time.');}
 if(parsed.when!==null&&!Number.isFinite(Date.parse(parsed.when)))throw new Error('Could not resolve that date. Try a specific day and time.');
 if(parsed.minutes!==null&&(!Number.isFinite(parsed.minutes)||parsed.minutes<1||parsed.minutes>10080))throw new Error('Choose a snooze from 1 minute to one week.');
 return parsed;
}
export async function parseVoiceCommand(text:string,state:DaytownState):Promise<ParsedCommand>{
 const result=await openai('responses',{model:process.env.RESPONSES_MODEL,store:false,
 instructions:`You parse voice commands for Daytown, a local task town for easily distracted people. Current simulated date/time: ${state.now}. User timezone: Europe/London. Resolve relative dates to ISO 8601 with the correct London timezone offset. The week begins Monday. For NEW tasks only, an explicit day without a time defaults to 18:00 local; tonight defaults to 20:00 local. If no date is said for a new task, due is null. For a day-only move of an existing task, preserve its existing Europe/London time-of-day, including minutes, unless the user explicitly requests a new time. Convert that local time using the destination date's London offset; never reuse an old UTC offset across daylight-saving changes. Example: moving an existing dentist appointment at 15:00 to Friday keeps Friday at 15:00 local, not 18:00. Only when the moved task has no existing due time may a day-only move default to 18:00 local. Do not invent appointments. A brain-dump may contain multiple independent tasks: extract ALL of them. Supported action enum: add, done, move, remind, next, snooze, show_week, ready, gassed. Map readiness phrases such as I am ready, ready to work, or lets go to ready: start a five-minute focus on the active task. Map I am gassed, I am tired, or I need a break to gassed: take a five-minute break with pressure relief. These are cooperative preferences, never new tasks or medical assessments. For ready/gassed, tasks=[], when=null, minutes=5 unless a duration is explicit, and task_id=null unless an existing task was explicitly named. IMPORTANT reminder-intent distinction: 'remind me TO <new action> in/at <time>' creates a NEW task with action=add, task_id=null and that task in tasks; set remind_at to the requested time and leave due=null unless an explicit deadline is also stated. For example, 'Remind me to stretch in 20 minutes' means add title='Stretch', due=null, remind_at=current simulated time plus 20 minutes. Never interpret this as editing an unrelated next task. In contrast, 'remind me ABOUT <existing task>', 'remind me about this later', or 'remind me later' changes an existing task's reminder with action=remind, the matching task_id (or null for this/next), tasks=[], and when=requested reminder time (default 15 minutes later if only later is said). Preserve that existing task's deadline. This distinction takes priority over generic reminder wording. Unrecognized task-like input falls back to add. Map 'what is next' to next, 'show my week' to show_week. For edits find the matching supplied task ID, or use null for the next task if not specified. Never invent an existing ID. For add put tasks in the array and id=''; each tiny_first_step must be ONE concrete action taking under two minutes, never a checklist. building_type is a simple building (clinic, house, town hall, cottage, studio, shop, library, greenhouse). label is a short neutral sign of at most 20 characters; no personal details beyond the short task label. For timed tasks set remind_at to 15 minutes before due unless a reminder time is specified. For non-add actions tasks=[]; irrelevant fields are null. For move/remind supply when; for snooze supply minutes (default 15). Current unfinished tasks: ${JSON.stringify(state.tasks.filter(t=>t.status==='todo').map(t=>({id:t.id,title:t.title,due:t.due})))}`,
 input:text,text:{format:{type:'json_schema',name:'daytown_command',strict:true,schema:commandSchema}}
 });
 return validateCommand(outputJson(result));
}
export async function epitaphFor(task:Task|undefined,petName:string,now:string):Promise<string>{
 const result=await openai('responses',{model:process.env.RESPONSES_MODEL,store:false,instructions:'Write one short funny, kind epitaph for a fictional cartoon pet in a task-manager town. Playful, warm, never cruel or shaming. Maximum 120 characters, one sentence, no medical claims. Name the pet and reference only the short task label. Example for Taxes: Here lies Biscuit. Died of unfiled taxes, Friday. No real-world death references.',input:JSON.stringify({petName,label:task?.label||'a very long side quest',day:new Date(now).toLocaleDateString('en-GB',{weekday:'long',timeZone:'Europe/London'})}),text:{format:{type:'json_schema',name:'daytown_epitaph',strict:true,schema:{type:'object',additionalProperties:false,properties:{epitaph:{type:'string'}},required:['epitaph']}}}});
 const parsed=outputJson(result);if(typeof parsed.epitaph!=='string'||!parsed.epitaph.trim())throw new Error('No epitaph generated');return parsed.epitaph.trim().slice(0,160);
}
export const transcribeAudio=(buffer:Buffer,type:string)=>originalTranscribe(buffer,type);
export async function spokenLine(text:string,format:'mp3'|'wav'='mp3'):Promise<Buffer>{
 if(!process.env.OPENAI_API_KEY)throw new Error('Set OPENAI_API_KEY in .env and restart for the pet voice.');
 const response=await fetch('https://api.openai.com/v1/audio/speech',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.TTS_MODEL,voice:process.env.TTS_VOICE||'coral',input:text,response_format:format,instructions:'A warm playful cartoon companion. Speak briefly and gently.'}),signal:AbortSignal.timeout(30000)});
 if(!response.ok){const error:any=await response.json();throw new Error(`Speech request failed (${response.status}): ${error.error?.message||'Try again'}`);}return Buffer.from(await response.arrayBuffer());
}
