import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const raw=process.argv.at(-1)||'{}';
async function previousNotify(){
 try{const command=JSON.parse(await readFile(process.argv[2],'utf8'));if(!command.length)return;
  await new Promise(resolve=>{const child=spawn(command[0],[...command.slice(1),raw],{windowsHide:true,stdio:'ignore'});const timer=setTimeout(()=>{child.unref();resolve();},5000);timer.unref();child.once('error',()=>{clearTimeout(timer);resolve();});child.once('exit',()=>{clearTimeout(timer);resolve();});});
 }catch{}
}
async function daytownNotify(){
 try{const event=JSON.parse(raw);if(event.type!=='agent-turn-complete')return;
  await fetch(process.env.DAYTOWN_URL||'http://localhost:3000/api/codex-event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:event.type,'thread-id':event['thread-id'],'turn-id':event['turn-id']}),signal:AbortSignal.timeout(2500)});
 }catch{}
}
await Promise.allSettled([previousNotify(),daytownNotify()]);
