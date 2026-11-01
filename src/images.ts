import {createHash} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir, readFile, writeFile, copyFile, open, unlink, stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {getLinkedPetAssets,getLinkedPetAnimations} from './codex-link.ts';
// These wrappers were smoke-tested against the current image generation/edit APIs.
// @ts-ignore JavaScript module shared with the original integration smoke tests.
import {openai} from '../api.mjs';

export type VisualTask={id:string;label:string;building_type:string;status?:string;due?:string|null;title?:string;tiny_first_step?:string};
export type VisualState={tasks:VisualTask[];pet:{stage:string;health:number;name?:string};graves:Array<{id:string;taskId?:string;epitaph:string;createdAt?:string}>;nextTaskId?:string|null;now?:string;weather?:string;revision?:number};
export const assetRoot=resolve('data/assets');
const style='Crisp isometric pixel-art coder workspace, midnight navy and charcoal, neon mint terminal light and amber status lights, discrete square pixels and nearest-neighbour edges, restrained 16-bit game art, clean isometric perspective, no blur, no cottages, no houses, no village, no fantasy architecture.';
export const petStages=['happy','eating','hungry','sick','critical','ghost','egg'] as const;
const petChanges:Record<string,string>={happy:'Healthy, content and smiling, normal round body.',eating:'Joyfully eating a tiny star-shaped biscuit, little happy closed eyes.',hungry:'A little hungry, smaller belly, hopeful expression, looking towards a tiny empty bowl.',sick:'Feeling tired and droopy, a tiny soft forehead patch, gently wilted sprout. Cute, no injury.',critical:'Very tired, translucent pale mint skin and droopy lilac sprout, worried but cute face. No injury, no violent or frightening imagery.',ghost:'A kind cute semi-transparent mint ghost of this exact pet floating upwards, wispy lower body, same oval eyes, peach cheeks and lilac sprout. Friendly, not frightening.',egg:'A small unhatched cream egg with mint spots and a lilac sprout motif, no face and no limbs. Same character colours.'};
const running=new Set<string>(),queued=new Set<string>(),done=new Set<string>(),failures=new Map<string,{message:string;at:number}>();
const queue:Array<{key:string;work:()=>Promise<void>}>=[];
let notify:()=>void=()=>{},active=0;
let previousNext:string|null|undefined;
let requestedSceneKey:string|null=null;
export function setAssetEventHandler(handler:()=>void){notify=handler;}
export function shortLabel(value:unknown){return String(value || 'TASK').replace(/[\r\n\t]/g,' ').replace(/\s+/g,' ').trim().slice(0,18) || 'TASK';}
export function safeBuildingType(value:unknown){const type=String(value || '').toLowerCase();return ['terminal','project station','server rack','debug console','design station'].includes(type)?type:'project station';}
export function buildingKey(task:VisualTask){return createHash('sha256').update('workspace-v1|'+shortLabel(task.label)+'|'+safeBuildingType(task.building_type)).digest('hex').slice(0,16);}
function path(name:string){return resolve(assetRoot,name);}
function url(name:string){return existsSync(path(name))?'/generated/'+name:null;}
function enqueue(key:string,work:()=>Promise<void>){
 if(queued.has(key)||running.has(key)||done.has(key))return;
 const failed=failures.get(key);if(failed&&Date.now()-failed.at<300000)return;
 queued.add(key);queue.push({key,work});void pump();
}
async function pump(){
 while(active<2&&queue.length){
  const job=queue.shift()!;queued.delete(job.key);running.add(job.key);active++;
  void job.work().then(()=>{done.add(job.key);failures.delete(job.key);}).catch(error=>{failures.set(job.key,{message:String(error?.message || 'Image generation failed'),at:Date.now()});}).finally(()=>{running.delete(job.key);active--;notify();void pump();});
 }
}
async function saveResult(name:string,result:any){
 if(!result.data?.[0]?.b64_json)throw new Error('Image response did not include PNG data');
 await mkdir(assetRoot,{recursive:true});const temp=path(name+'.tmp');
 await writeFile(temp,Buffer.from(result.data[0].b64_json,'base64'));
 const {rename}=await import('node:fs/promises');await rename(temp,path(name));notify();
}
async function oncePerFile(name:string,work:()=>Promise<void>){
 await mkdir(assetRoot,{recursive:true});
 if(existsSync(path(name)))return;
 const lock=path(name+'.lock');let handle;
 for(let attempt=0;attempt<850;attempt++){
  if(existsSync(path(name)))return;
  try{handle=await open(lock,'wx');break;}catch(error:any){
   if(error.code!=='EEXIST')throw error;
   const info=await stat(lock).catch(()=>null);
   if(info&&Date.now()-info.mtimeMs>300000)await unlink(lock).catch(()=>{});
   await new Promise(resolve=>setTimeout(resolve,250));
  }
 }
 if(!handle)throw new Error('Another image generation is still running; retry shortly.');
 try{if(!existsSync(path(name)))await work();}finally{await handle.close();await unlink(lock).catch(()=>{});}
}
async function generate(name:string,prompt:string,{transparent=false,size='1024x1024'}={}){
 await oncePerFile(name,async()=>{const result=await openai('images/generations',{model:process.env.IMAGE_GENERATION_MODEL,prompt,size,quality:'medium',background:transparent?'transparent':'opaque',output_format:'png'});await saveResult(name,result);});
}
async function edit(name:string,base:string,prompt:string,{transparent=true,size='1024x1024'}={}){
 await oncePerFile(name,async()=>{
 const form=new FormData();form.set('image',new Blob([await readFile(path(base))],{type:'image/png'}),'base.png');
 form.set('model',process.env.IMAGE_EDIT_MODEL!);form.set('prompt',prompt);form.set('size',size);form.set('quality','medium');form.set('background',transparent?'transparent':'opaque');form.set('output_format','png');
 await saveResult(name,await openai('images/edits',form,true));
 });
}
export async function ensureLandscape(){
 await generate('workbench-base.png','A single compact delightful pixel-art coder workbench diorama, isolated transparent cutout. 3:2 landscape composition. Just ONE small isometric desk: dark navy chunky monitor with mint code pixels, keyboard on the FRONT edge, one amber desk lamp, coffee cup, two tiny tools, a few blank sticky notes on monitor side, small low drawer. Warm off-white desk surface with mint and amber accents, clean dark outline. Crisp square pixel clusters like an affectionate 16-bit game prop, nearest-neighbour look, no blur. Full object centred with transparent padding. Front three-quarter view with keyboard visible, plenty of OPEN TRANSPARENT SPACE immediately in FRONT of the keyboard so a separately animated character can stand there and work. Make the desk look readable when this entire image is only 300 pixels wide. There is NO character: no human, animal, creature, pet, mascot, face, or body anywhere. No room, walls, background rectangle, server racks, multiple stations, duplicate desks, buildings, cottages, lettering or readable text. Exactly one small cosy workbench with a transparent background.',{transparent:true,size:'1536x1024'});
}
export async function ensureBuilding(task:VisualTask){
 // A task is a sticky note beside the ONE workbench, never another desk or actor.
 await ensureLandscape();
}
export async function ensurePetBase(){
 await mkdir(assetRoot,{recursive:true});
 if(!existsSync(path('pet-base.png'))){
  if(existsSync(resolve('assets/base.png')))await copyFile(resolve('assets/base.png'),path('pet-base.png'));
  else await generate('pet-base.png',`${style} Create a unique cute cartoon virtual pet: a pear-shaped mint green mochi creature with two tiny feet, dark oval eyes, peach cheeks and a single lilac sprout on its head. Full body centered, front view, generous margins. Transparent background. No text.`,{transparent:true});
 }
 if(!existsSync(path('pet-happy.png')))await copyFile(path('pet-base.png'),path('pet-happy.png'));
}
export async function ensurePetStage(stage:string){
 await ensurePetBase();if(stage==='happy')return;
 await edit(`pet-${stage}.png`,'pet-base.png',`Edit this exact mint pet into this state: ${petChanges[stage] || petChanges.happy} Preserve its identity, lilac sprout, eyes, peach cheeks, soft clay illustration style and centered framing. Transparent background. No text. Cute and kind.`);
}
export async function ensureGravestone(){
 // Pixel memorial stones are drawn in the compositor; no mismatched village asset.
}
export async function ensureStoryScene(task:VisualTask,index:number){
 // Variations are now code-driven crops/lighting of one consistent small workbench.
 await ensureLandscape();
}
export function ensureTownAssets(state:VisualState){
 if(!process.env.OPENAI_API_KEY)return;
 enqueue('workbench',ensureLandscape);
 // Pet identity is now supplied separately by the chosen Codex pet; never regenerate it here.
 // The next-task transition, never tab opening, is the story generation trigger.
 // No image calls are made per task or tab; latest direction uses one shared diorama.
}
export function retryAssetFailures(){failures.clear();}
export function getAssetStatus(state:VisualState){
 const buildings:Record<string,{normal:string|null;done:string|null;storm:string|null}>={};
 for(const task of state.tasks)buildings[task.id]={normal:null,done:null,storm:null};
 return {base:url('workbench-base.png'),workbench:url('workbench-base.png'),workbenchActor:{x:.43,y:.40,width:.20,height:.33},pet:{...Object.fromEntries(petStages.map(stage=>[stage,url(`pet-${stage}.png`)])),...getLinkedPetAssets()},petAnimations:getLinkedPetAnimations()||{},grave:null,buildings,scenes:[] as string[],style:'pixel-workbench-v1',jobs:{pending:queue.length,active,errors:Object.fromEntries([...failures].map(([key,value])=>[key,value.message]))}};
}
export async function waitForAssets(){while(active || queue.length)await new Promise(resolve=>setTimeout(resolve,250));}
