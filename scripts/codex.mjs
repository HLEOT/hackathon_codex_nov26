import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const hook=resolve('scripts/notify.mjs').replaceAll('\\','/');
const node=process.execPath.replaceAll('\\','/');
const child=spawn('codex',['-c',`notify=["${node}","${hook}"]`,...process.argv.slice(2)],{stdio:'inherit'});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>process.exitCode=code || 0);
