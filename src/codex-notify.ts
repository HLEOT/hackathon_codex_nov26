import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {homedir} from 'node:os';
import {resolve,dirname} from 'node:path';

export function notifyConfigPath(){return resolve(process.env.CODEX_HOME||resolve(homedir(),'.codex'),'config.toml');}
export function parseNotify(config:string):string[]{
 const root=config.split(/^\s*\[/m)[0];
 if(!/^notify\s*=/m.test(root))return [];
 const match=root.match(/^notify[ \t]*=[ \t]*(\[[^\r\n]*\])[ \t]*(?:#.*)?$/m);
 if(!match)throw new Error('Your existing Codex notify setting needs a manual merge; it has been left unchanged.');
 let value:unknown;try{value=JSON.parse(match[1]);}catch{throw new Error('Your existing Codex notify uses a format that needs a manual merge; it has been left unchanged.');}
 if(!Array.isArray(value)||!value.length||value.some(item=>typeof item!=='string'))throw new Error('The existing Codex notify command is invalid; it has been left unchanged.');
 return value;
}
export async function codexNotifyStatus(root:string,configFile=notifyConfigPath()){
 try{const config=await readFile(configFile,'utf8'),command=parseNotify(config);return {installed:command.includes(resolve(root,'scripts/notify-chain.mjs')),available:true,scope:'new Codex sessions'};}catch{return {installed:false,available:existsSync(configFile),scope:'new Codex sessions'};}
}
export async function prepareCodexNotify(root:string,configFile=notifyConfigPath(),node=process.execPath){
 const config=await readFile(configFile,'utf8').catch((error:any)=>{if(error.code==='ENOENT')return '';throw error;}),previous=parseNotify(config),hook=resolve(root,'scripts/notify-chain.mjs');
 if(previous.includes(hook))return previous;
 const runtime=resolve(root,'runtime');await mkdir(runtime,{recursive:true});
 const previousFile=resolve(runtime,'codex-notify-runner.json');await writeFile(previousFile,JSON.stringify(previous));
 return [node,hook,previousFile];
}
export async function installCodexNotify(root:string,configFile=notifyConfigPath(),node=process.execPath){
 const config=await readFile(configFile,'utf8'),previous=parseNotify(config),hook=resolve(root,'scripts/notify-chain.mjs');
 if(previous.includes(hook))return {installed:true,alreadyLinked:true,scope:'new Codex sessions'};
 const runtime=resolve(root,'runtime');await mkdir(runtime,{recursive:true});
 const previousFile=resolve(runtime,'codex-notify-previous.json');
 // Keep both the exact original configuration and its notification command local.
 await writeFile(resolve(runtime,'codex-notify-backup.toml'),config,{flag:'wx'}).catch((error:any)=>{if(error.code!=='EEXIST')throw error;});
 await writeFile(previousFile,JSON.stringify(previous));
 const line='notify = '+JSON.stringify([node,hook,previousFile]);
 const next=/^notify\s*=/m.test(config.split(/^\s*\[/m)[0])?config.replace(/^notify[^\r\n]*$/m,line):line+'\n'+config;
 await mkdir(dirname(configFile),{recursive:true});const temporary=configFile+'.daytown.tmp';await writeFile(temporary,next);await rename(temporary,configFile);
 return {installed:true,alreadyLinked:false,scope:'new Codex sessions'};
}
