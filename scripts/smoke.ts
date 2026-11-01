import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import sharp from 'sharp';
import {parseVoiceCommand,spokenLine} from '../src/voice.ts';
import {initialState} from '../src/store.ts';
const base=`http://localhost:${process.env.PORT||3000}`;
const status=await(await fetch(base+'/api/status')).json();assert.equal(status.product,'Daytown');
const state=await(await fetch(base+'/api/state')).json();assert.ok(Array.isArray(state.tasks));
const png=Buffer.from(await(await fetch(base+'/api/town.png')).arrayBuffer());const metadata=await sharp(png).metadata();assert.equal(metadata.width,1536);assert.equal(metadata.height,864);console.log('PASS localhost state + server-composited town PNG');
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));assert.equal(manifest.manifest_version,3);assert.equal(manifest.chrome_url_overrides,undefined);assert.equal(manifest.chrome_settings_overrides,undefined);assert.ok(manifest.side_panel);console.log('PASS Chrome defaults preserved; side panel is additive');
const secret=await fetch(base+'/.env');assert.equal(secret.status,404);const blocked=await fetch(base+'/api/action',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:'{"action":"next"}'});assert.equal(blocked.status,403);console.log('PASS environment file not served; unrelated website writes rejected');
if(process.argv.includes('--live')){
 const fixture=process.argv.find((arg,index)=>index>1&&!arg.startsWith('--'));
 if(!fixture)throw new Error('Pass a spoken WAV fixture after --live.');
 const audio=await readFile(fixture);const response=await fetch(base+'/api/transcribe',{method:'POST',headers:{'Content-Type':'audio/wav'},body:audio});const transcription=await response.json();assert.ok(response.ok,transcription.error);assert.ok(transcription.text?.trim());
 const parsed=await parseVoiceCommand(transcription.text,initialState());assert.equal(parsed.action,'add');assert.ok(parsed.tasks.length);console.log('PASS recorded audio → transcription → Structured Outputs tasks');
 const speech=await spokenLine('Dentist in fifteen minutes!');assert.ok(speech.length>1000);console.log('PASS short OpenAI pet voice');
}else console.log('Live voice checks skipped; use --live path/to/spoken.wav.');
