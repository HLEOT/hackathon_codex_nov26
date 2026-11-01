import sharp,{type OverlayOptions} from 'sharp';
import {existsSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {assetRoot,buildingKey,shortLabel,type VisualState} from './images.ts';
import {getLinkedPetPath} from './codex-link.ts';
export const TOWN_WIDTH=1536,TOWN_HEIGHT=864;
export const escapeXml=(value:unknown)=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]!));
const svg=(body:string,width=TOWN_WIDTH,height=TOWN_HEIGHT)=>Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${body}</svg>`);
export function getTownLayout(state:VisualState){
 const tasks=[...state.tasks].sort((a,b)=>Number(b.id===state.nextTaskId)-Number(a.id===state.nextTaskId)||Number(a.status==='done')-Number(b.status==='done')||((a.due?Date.parse(a.due):Infinity)-(b.due?Date.parse(b.due):Infinity)||0)).slice(0,3);
 const notePositions=[{x:1090,y:230},{x:1090,y:360},{x:1090,y:490}];
 const plots=tasks.map((task,index)=>({taskId:task.id,...notePositions[index],width:330,height:110}));
 const columnsG=Math.max(1,Math.ceil(Math.sqrt(state.graves.length*1456/170))),rowsG=Math.max(1,Math.ceil(state.graves.length/columnsG)),sizeG=Math.max(1,Math.min(100,Math.floor(1456/columnsG),Math.floor(170/rowsG)));
 const graves=state.graves.map((grave,index)=>({id:grave.id,x:40+Math.floor(index%columnsG*(1456/columnsG)),y:674+Math.floor(index/columnsG)*sizeG,width:sizeG,height:sizeG}));
 return {width:TOWN_WIDTH,height:TOWN_HEIGHT,workbench:{x:140,y:100,width:900,height:600},actor:{x:527,y:340,width:180,height:198},workbenchRawActor:{x:.43,y:.40,width:.20,height:.33},plots,graves,nextTaskId:state.nextTaskId||null};
}
function workbenchPlaceholder(){return svg('<path d="M160 320l420-190 430 180-430 240z" fill="#e2d5b4" stroke="#253644" stroke-width="12"/><path d="M160 320v40l420 245v-55z" fill="#b2ab93"/><path d="M580 550v55l430-246v-49z" fill="#8b938d"/><path d="M245 380v190h35V400M865 395v190h35V375" fill="#344651"/><rect x="390" y="110" width="245" height="225" rx="8" fill="#24394a" stroke="#172633" stroke-width="12"/><rect x="410" y="130" width="205" height="175" fill="#173e48"/><g fill="#72d5b0"><rect x="435" y="163" width="120" height="10"/><rect x="435" y="193" width="85" height="10"/><rect x="435" y="223" width="140" height="10"/></g><path d="M485 335v36h60v-36" fill="#344c58"/><path d="M408 400l120-57 130 67-123 67z" fill="#6b827d" stroke="#263b47" stroke-width="8"/><path d="M420 401l107-43 113 54-106 48z" fill="#9bafa3"/><path d="M780 220v-115h65v115" fill="#bf9858" stroke="#3c4543" stroke-width="7"/><path d="M742 115l70-40 78 40-78 40z" fill="#eac477"/><path d="M745 330v69l65 22v-69z" fill="#f3eee0" stroke="#4d615f" stroke-width="7"/><path d="M811 352q50-5 37 40l-33 7" fill="none" stroke="#f3eee0" stroke-width="12"/>',1200,800);}
function studioFloor(){
 const tiles=Array.from({length:9},(_,i)=>{const t=i/8;return '<path d="M'+(180+420*t)+' '+(480-210*t)+'L'+(580+420*t)+' '+(730-260*t)+'M'+(600+400*t)+' '+(270+200*t)+'L'+(180+400*t)+' '+(480+250*t)+'"/>';}).join('');
 return svg('<defs><clipPath id="floor"><path d="M180 480L600 270 1000 470 580 730z"/></clipPath></defs><path d="M190 522L600 309 1020 505 590 774z" fill="#081619" opacity=".18"/><path d="M180 480v26l400 251v-27z" fill="#789087"/><path d="M580 730v27l420-260v-27z" fill="#536e69"/><path d="M180 480V310L600 100v170z" fill="#b6c9ba"/><path d="M600 100l400 200v170L600 270z" fill="#95b4a7"/><path d="M180 310l420-210 400 200" fill="none" stroke="#d4dfcf" stroke-width="9"/><path d="M180 480L600 270 1000 470 580 730z" fill="#d2cfb6"/><g clip-path="url(#floor)" stroke="#a6ad96" stroke-width="2" opacity=".7">'+tiles+'</g><path d="M182 479L600 272 998 470" fill="none" stroke="#e7e2c9" stroke-width="5"/><path d="M337 562l250-127 241 118-249 143z" fill="#7ba5a1" stroke="#b7ccba" stroke-width="8"/><path d="M360 562l227-112 218 104-226 128z" fill="none" stroke="#557e7c" stroke-width="3"/><path d="M252 309v-89l186-93v90z" fill="#edf0d3" stroke="#6e9489" stroke-width="8"/><path d="M345 174v91M252 265l186-92" stroke="#8dada0" stroke-width="6"/><path d="M252 309l90 73 130-65-34-100z" fill="#f3e6b1" opacity=".14"/><path d="M868 460l50-25 48 24-49 26z" fill="#2a4844" opacity=".18"/><path d="M884 420v43l32 16 30-16v-43z" fill="#bb9169"/><path d="M881 420l35-17 34 17-34 18z" fill="#e2ba85"/><path d="M914 421v-73M914 392l-28-28M915 378l27-32" fill="none" stroke="#4c7e65" stroke-width="10"/><path d="M878 342h19v24h-19zM928 329h20v24h-20zM905 325h18v23h-18z" fill="#7ca875"/><ellipse cx="602" cy="580" rx="222" ry="76" fill="#0e2223" opacity=".12"/>');
}
const cache=new Map<string,Buffer>(),inflight=new Map<string,Promise<Buffer>>();
function signature(state:VisualState,poster:boolean){
 const now=state.now?Date.parse(state.now):Date.now();
 const petPath=poster?(getLinkedPetPath(state.pet.stage)||resolve(assetRoot,`pet-${state.pet.stage}.png`)):null;
 const files=['workbench-base.png',...(petPath?[petPath]:[])];
 const stamps=files.map(file=>{try{const info=statSync(resolve(assetRoot,file));return[file,info.mtimeMs,info.size];}catch{return[file,0];}});
 return createHash('sha256').update(JSON.stringify({v:'pixel-workbench-v1',tasks:state.tasks.map(task=>({id:task.id,label:shortLabel(task.label),key:buildingKey(task),done:task.status==='done',overdue:!!task.due&&Date.parse(task.due)<now,due:task.due})),graves:state.graves.map(grave=>poster?grave:{id:grave.id}),next:state.nextTaskId,weather:state.weather,health:poster?Math.round(state.pet.health):state.pet.health<35,stage:poster?state.pet.stage:null,poster,stamps})).digest('hex');
}
export async function renderTown(state:VisualState,{poster=false}:{poster?:boolean}={}){
 const snapshot=structuredClone(state),key=signature(snapshot,poster),hit=cache.get(key);if(hit){cache.delete(key);cache.set(key,hit);return hit;}
 if(inflight.has(key))return inflight.get(key)!;
 const work=compose(snapshot,poster).then(buffer=>{cache.set(key,buffer);while(cache.size>5)cache.delete(cache.keys().next().value!);return buffer;}).finally(()=>inflight.delete(key));inflight.set(key,work);return work;
}
async function compose(state:VisualState,poster:boolean){
 const layout=getTownLayout(state),layers:OverlayOptions[]=[],base=resolve(assetRoot,'workbench-base.png');
 const canvas=sharp({create:{width:TOWN_WIDTH,height:TOWN_HEIGHT,channels:4,background:{r:0,g:0,b:0,alpha:0}}});
 const desk=existsSync(base)?base:workbenchPlaceholder();
 layers.push({input:studioFloor(),left:0,top:0});
 const left=state.tasks.filter(task=>task.status!=='done').length,finished=state.tasks.length-left;
 layers.push({input:svg(`<rect x="1057" y="99" width="406" height="594" fill="#0c1c23" opacity=".2"/><rect x="1048" y="90" width="406" height="594" rx="8" fill="#b98c63"/><rect x="1060" y="102" width="382" height="570" rx="3" fill="#eadfc3"/><text x="1090" y="149" font-family="monospace" font-size="31" fill="#344f47">Your pinboard</text><text x="1090" y="193" font-family="monospace" font-size="27" fill="#526957">${left} ${left===1?'task':'tasks'} left</text><text x="1090" y="647" font-family="monospace" font-size="23" fill="#526957">${left>3?'+'+(left-3)+' more · ':''}${finished} finished</text>`),left:0,top:0});
 layers.push({input:await sharp(desk).resize(layout.workbench.width,layout.workbench.height,{fit:'contain',background:'#00000000',kernel:'nearest'}).png().toBuffer(),left:layout.workbench.x,top:layout.workbench.y});
 const next=layout.plots.find(plot=>plot.taskId===state.nextTaskId),now=state.now?Date.parse(state.now):Date.now();
 if(next)layers.push({input:svg(`<path d="M950 420H1010V${next.y+50}H${next.x}" stroke="#66bda3" stroke-width="3" stroke-dasharray="6 8" fill="none"/>`),left:0,top:0});
 for(const plot of [...layout.plots].sort((a,b)=>a.y-b.y)){
  const task=state.tasks.find(item=>item.id===plot.taskId)!,done=task.status==='done',storm=!done&&!!task.due&&Date.parse(task.due)<now;
  const colour=storm?'#e3a369':done?'#a5cfb2':['#d4e6bd','#d7dfed','#e6d4e6'][layout.plots.indexOf(plot)%3];
  layers.push({input:svg(`<path d="M${plot.x+4} ${plot.y+7}h${plot.width}v${plot.height}h-${plot.width}z" fill="#132638" opacity=".10"/><rect x="${plot.x}" y="${plot.y}" width="${plot.width}" height="${plot.height}" fill="${colour}"/><rect x="${plot.x+88}" y="${plot.y-7}" width="60" height="17" fill="#f1e5bd" opacity=".8"/><rect x="${plot.x+22}" y="${plot.y+30}" width="17" height="17" fill="none" stroke="#47635a" stroke-width="2"/>${done?`<path d="M${plot.x+25} ${plot.y+38}l5 5 9-12" fill="none" stroke="#47635a" stroke-width="3"/>`:''}<text x="${plot.x+24}" y="${plot.y+68}" font-family="monospace" font-size="25" fill="#304b45">${escapeXml(shortLabel(task.label))}</text><text x="${plot.x+24}" y="${plot.y+95}" font-family="monospace" font-size="12" fill="#61766c">${done?'Finished':storm?'Due now':'One tiny step'}</text>`),left:0,top:0});
 }
 for(const grave of layout.graves){const stone=svg('<path d="M25 100V44h8V30h14V22h20v8h14v14h8v56z" fill="#26384a" stroke="#62778d" stroke-width="4"/><rect x="43" y="48" width="28" height="4" fill="#8ba1b6"/><rect x="55" y="38" width="4" height="27" fill="#8ba1b6"/><rect x="35" y="83" width="43" height="5" fill="#d39d70"/>',110,110);layers.push({input:await sharp(stone).resize(grave.width,grave.height,{kernel:'nearest'}).png().toBuffer(),left:grave.x,top:grave.y});}
 if(state.weather==='storm'||state.pet.health<35)layers.push({input:svg('<path d="M1290 80l-15 24h13l-15 24 32-31h-13l12-17" fill="#dca573"/>'),left:0,top:0});
 if(poster){const count=state.tasks.filter(task=>task.status==='done').length;layers.push({input:svg(`<rect x="30" y="24" width="740" height="86" fill="#0b1424" stroke="#3f6e75" stroke-width="2"/><text x="52" y="61" font-family="monospace" font-size="26" fill="#95f3d1">Daytown · Your week</text><text x="52" y="88" font-family="monospace" font-size="15" fill="#a0b2c6">${count} finished tasks · ${state.graves.length} memorials · ${Math.round(state.pet.health)}% pet health</text>`),left:0,top:0});
   const petFile=getLinkedPetPath(state.pet.stage)||resolve(assetRoot,`pet-${state.pet.stage}.png`);if(existsSync(petFile))layers.push({input:await sharp(petFile).resize(layout.actor.width,layout.actor.height,{fit:'contain',background:'#00000000',kernel:'nearest'}).png().toBuffer(),left:layout.actor.x,top:layout.actor.y});
  const lines=state.graves.slice(-3).map(grave=>grave.epitaph.slice(0,105));if(lines.length)layers.push({input:svg(`<rect x="30" y="${810-lines.length*22}" width="1150" height="${30+lines.length*22}" fill="#0c1526"/>${lines.map((line,i)=>`<text x="45" y="${832-(lines.length-1-i)*22}" font-family="monospace" font-size="12" fill="#a4b7cc">${escapeXml(line)}</text>`).join('')}`),left:0,top:0});
 }
 return canvas.composite(layers).png().toBuffer();
}
