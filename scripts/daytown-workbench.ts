import '../config.mjs';
import {ensureLandscape} from '../src/images.ts';
import {seedWeek} from '../src/store.ts';
import {writeFile,mkdir,readFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
console.log('Generating ONE transparent pixel workbench. No characters or additional stations.');
await ensureLandscape();
const {renderTown,getTownLayout}=await import('../src/compositor.ts');
const sharp=(await import('sharp')).default;
const state=seedWeek(Date.parse('2026-11-01T13:00:00Z')),actor=getTownLayout(state).actor;
// Public sample uses only the generic fictional pet, never connected personal artwork.
const pet=await sharp('data/assets/pet-happy.png').resize(48,48,{fit:'contain',background:'#00000000',kernel:'nearest'}).resize(actor.width,actor.height,{fit:'contain',background:'#00000000',kernel:'nearest'}).png().toBuffer();
await writeFile('data/assets/workbench-sample.png',await sharp(await renderTown(state)).composite([{input:pet,left:actor.x,top:actor.y}]).png().toBuffer());
await mkdir('demo-assets',{recursive:true});
const old=JSON.parse(await readFile('demo-assets/manifest.json','utf8'));
const keep=old.files.filter((entry:any)=>/^pet-(base|happy|eating|hungry|sick|critical|ghost|egg)\.png$/.test(entry.file));
const entries=[];
for(const file of ['workbench-base.png','workbench-sample.png']){await copyFile(`data/assets/${file}`,`demo-assets/${file}`);const data=await readFile(`demo-assets/${file}`);entries.push({file,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});}
await writeFile('demo-assets/manifest.json',JSON.stringify({...old,purpose:'One transparent pixel coder workbench with code-rendered fictional task sticky notes. Generic public pet fallback only; linked Codex pet is private.',visualStyle:'pixel-workbench-v1',stationStrategy:'ONE shared workbench cutout; task labels are composited in code; no character baked in artwork.',files:[...entries,...keep]},null,2));
console.log('PASS one-workbench generation and active demo bundle.');
