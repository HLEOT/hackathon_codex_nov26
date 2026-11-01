import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {readFileSync,existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve} from 'node:path';
import sharp from 'sharp';

const cache=resolve('data/codex-pet'),frames=resolve('data/assets/codex-link');
type Link={petId:string;name:string;spriteVersion:number;syncedAt?:string;connected?:boolean};
function selectedPet(){
 const home=process.env.CODEX_HOME||resolve(homedir(),'.codex');
 const outer=JSON.parse(readFileSync(resolve(home,'.codex-global-state.json'),'utf8'));
 const atoms=outer['electron-persisted-atom-state']||{};
 const artwork=atoms['cloud-pet-artwork-cache'];
 const key=artwork?JSON.stringify([artwork.accountId,artwork.userId]):null;
 const id=key?atoms['last-observed-cloud-pet-selection-v1']?.[key]:null;
 const pet=artwork?.pets?.find((entry:any)=>entry.id===id);
 if(!id||!pet)throw new Error('Open Codex, choose a pet once, then try Connect Codex again.');
 return {id,url:pet.spritesheetUrl,version:pet.spriteVersionNumber||1,name:pet.name};
}
function saved():Link|null{try{return JSON.parse(readFileSync(resolve(cache,'metadata.json'),'utf8'));}catch{return null;}}
export function getCodexPetConnection(){
 const link=saved();let available=false,selectionMatches=true;try{const selected=selectedPet();available=true;selectionMatches=!link||selected.id===link.petId;}catch{}
 return {connected:!!link?.connected&&selectionMatches&&existsSync(resolve(frames,'happy.png')),available,name:link?.name||null,source:'codex'};
}
export function getLinkedPetAssets():Record<string,string>|null{
 const link=saved();if(!link?.connected)return null;
 const version=encodeURIComponent(link.syncedAt||'cached');
 return Object.fromEntries(['happy','eating','hungry','sick','critical','ghost','egg'].filter(stage=>existsSync(resolve(frames,stage+'.png'))).map(stage=>[stage,'/generated/codex-link/'+stage+'.png?v='+version]));
}
export function getLinkedPetPath(stage:string):string|null{
 if(!/^(happy|eating|hungry|sick|critical|ghost|egg)$/.test(stage)||!saved()?.connected)return null;
 const path=resolve(frames,stage+'.png');return existsSync(path)?path:null;
}
export function getLinkedPetAnimations():Record<string,string[]>|null{
 const link=saved();if(!link?.connected)return null;const version=encodeURIComponent(link.syncedAt||'cached');
 return Object.fromEntries(['working','idle'].map(state=>[state,[0,1,2,3,4,5].map(index=>`${state}-${index}.png`).filter(file=>existsSync(resolve(frames,file))).map(file=>'/generated/codex-link/'+file+'?v='+version)]));
}
export async function connectCodexPet(){
 const selected=selectedPet(),previous=saved();
 await mkdir(cache,{recursive:true});await mkdir(frames,{recursive:true});
 const source=resolve(cache,'sheet.png');
 if(previous?.petId!==selected.id||!existsSync(source)){
  if(typeof selected.url!=='string'||!selected.url.startsWith('https://'))throw new Error('Codex has not cached its pet artwork yet. Open its pet picker and reconnect.');
  const url=new URL(selected.url);
  if(!url.hostname.endsWith('.oaiusercontent.com')&&!url.hostname.endsWith('.openai.com'))throw new Error('The pet artwork location is not an OpenAI asset host.');
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Codex’s cached artwork link has expired. Refresh the pet in Codex, then reconnect.');
  const data=Buffer.from(await response.arrayBuffer());if(data.length>20*1024*1024)throw new Error('Pet artwork is too large.');
  await writeFile(source,data);
 }
 const info=await sharp(source).metadata();
 if(info.width!==1536||![1872,2288].includes(info.height||0))throw new Error('This Codex sprite layout is not supported yet.');
 const rows:Record<string,[number,number]>={happy:[0,0],eating:[4,2],hungry:[6,0],sick:[5,2],critical:[5,5],ghost:[5,7]};
 for(const [stage,[row,column]]of Object.entries(rows))await sharp(source).extract({left:column*192,top:row*208,width:192,height:208}).png().toFile(resolve(frames,stage+'.png'));
 for(const [animation,row]of Object.entries({working:7,idle:0}))for(let column=0;column<6;column++)await sharp(source).extract({left:column*192,top:row*208,width:192,height:208}).png().toFile(resolve(frames,`${animation}-${column}.png`));
 const egg=resolve(cache,'egg.png');
 if(existsSync(egg))await copyFile(egg,resolve(frames,'egg.png'));
 else if(existsSync(resolve('data/assets/pet-egg.png')))await copyFile(resolve('data/assets/pet-egg.png'),resolve(frames,'egg.png'));
 const link:Link={petId:selected.id,name:selected.name||(previous?.petId===selected.id?previous?.name:null)||'Codex companion',spriteVersion:info.height===2288?2:1,syncedAt:new Date().toISOString(),connected:true};
 await writeFile(resolve(cache,'metadata.json'),JSON.stringify(link,null,2));
 return {connected:true,name:link.name,source:'codex',spriteVersion:link.spriteVersion};
}
