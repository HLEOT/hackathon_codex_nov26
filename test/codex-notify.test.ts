import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import http from 'node:http';
import {parseNotify,prepareCodexNotify,installCodexNotify,codexNotifyStatus} from '../src/codex-notify.ts';

test('linking Codex preserves its existing hook, backs up exact config and is idempotent',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'daytown-notify-')),file=join(dir,'config.toml');
 try{
  const original='model = "example"\nnotify = ["existing.exe", "turn-ended"]\n[other]\nvalue = true\n';await writeFile(file,original);
  assert.deepEqual(parseNotify(original),['existing.exe','turn-ended']);
  const perRun=await prepareCodexNotify(dir,file,'node');assert.equal(await readFile(file,'utf8'),original);assert.deepEqual(JSON.parse(await readFile(perRun[2],'utf8')),['existing.exe','turn-ended']);
  await installCodexNotify(dir,file,'node');assert.equal((await codexNotifyStatus(dir,file)).installed,true);
  assert.equal(await readFile(join(dir,'runtime/codex-notify-backup.toml'),'utf8'),original);
  assert.deepEqual(JSON.parse(await readFile(join(dir,'runtime/codex-notify-previous.json'),'utf8')),['existing.exe','turn-ended']);
  const once=await readFile(file,'utf8');assert.ok(once.includes('[other]\nvalue = true'));
  await installCodexNotify(dir,file,'node');assert.equal(await readFile(file,'utf8'),once);
  assert.throws(()=>parseNotify("notify = ['custom.exe']\n"),/manual merge/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('completion chain runs original hook but sends Daytown metadata without prompts',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'daytown-chain-'));let received:any=null;
 const server=http.createServer((req,res)=>{let data='';req.on('data',part=>data+=part);req.on('end',()=>{received=JSON.parse(data);res.end('{}');});});
 server.listen(0,'127.0.0.1');await new Promise<void>(done=>server.once('listening',done));
 try{
  const resultFile=join(dir,'original.json'),previous=join(dir,'previous.json'),hook=join(dir,'previous.mjs');
  await writeFile(hook,"import{writeFileSync}from'node:fs';writeFileSync(process.argv[2],process.argv[3]);");
  await writeFile(previous,JSON.stringify([process.execPath,hook,resultFile]));
  const event={type:'agent-turn-complete','thread-id':'fake-thread','turn-id':'fake-turn','input-messages':['fictional private text'],'last-assistant-message':'fictional private answer'};
  await new Promise<void>((done,fail)=>{const child=spawn(process.execPath,[resolve('scripts/notify-chain.mjs'),previous,JSON.stringify(event)],{env:{...process.env,DAYTOWN_URL:`http://127.0.0.1:${(server.address() as any).port}/api/codex-event`},stdio:'ignore',windowsHide:true});child.once('error',fail);child.once('exit',code=>code===0?done():fail(new Error('Notify chain failed')));});
  assert.deepEqual(JSON.parse(await readFile(resultFile,'utf8')),event);
  assert.deepEqual(received,{type:'agent-turn-complete','thread-id':'fake-thread','turn-id':'fake-turn'});
 }finally{await new Promise<void>(done=>server.close(()=>done()));await rm(dir,{recursive:true,force:true});}
});
