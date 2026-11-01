import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const {prepareCodexNotify}=await import('../src/codex-notify.ts');
const notify=await prepareCodexNotify(resolve('.'));
try{await fetch('http://localhost:3000/api/codex-start',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(1000)});}catch{}
const child=spawn('codex',['-c',`notify=${JSON.stringify(notify)}`,...process.argv.slice(2)],{stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>process.exitCode=code || 0);
