import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const before=await(await fetch('http://localhost:3000/api/status')).json();
const {prepareCodexNotify}=await import('../src/codex-notify.ts');
const notify=await prepareCodexNotify(resolve('.'));
const child=spawn('codex',['exec','--skip-git-repo-check','--ephemeral','--ignore-user-config','-s','read-only','-c',`notify=${JSON.stringify(notify)}`,'Reply only with DAYTOWN_SMOKE_OK. Do not use tools or modify files.'],{stdio:['ignore','pipe','pipe']});
let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',()=>{});
const timeout=setTimeout(()=>child.kill(),60000);
child.on('error',error=>{console.error(error.message);clearTimeout(timeout);process.exitCode=1;});
child.on('close',async code=>{
 clearTimeout(timeout);
 const after=await(await fetch('http://localhost:3000/api/status')).json();
 if(code===0 && after.sequence>before.sequence && after.latest?.threadId!=='smoke') console.log('PASS: actual Codex agent-turn-complete hook reached localhost.');
 else {console.log('BLOCKED: live Codex hook not observed within 60 seconds. Use simulate Codex done.');process.exitCode=1;}
});
