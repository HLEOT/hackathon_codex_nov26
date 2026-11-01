import {readFile,mkdir,copyFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,basename} from 'node:path';
export async function bootstrapDemoAssets(root=resolve('.')):Promise<number>{
 const source=resolve(root,'demo-assets'),target=resolve(root,'data/assets');
 let manifest:any;try{manifest=JSON.parse(await readFile(resolve(source,'manifest.json'),'utf8'));}catch(error:any){if(error.code==='ENOENT')return 0;throw error;}
 await mkdir(target,{recursive:true});let copied=0;
 for(const entry of manifest.files || []){
  if(typeof entry.file!=='string'||basename(entry.file)!==entry.file||!entry.file.endsWith('.png'))throw new Error('Invalid demo asset manifest');
  try{await access(resolve(target,entry.file));continue;}catch{}
  const buffer=await readFile(resolve(source,entry.file));
  if(createHash('sha256').update(buffer).digest('hex')!==entry.sha256)throw new Error(`Demo asset checksum failed: ${entry.file}`);
  await copyFile(resolve(source,entry.file),resolve(target,entry.file));copied++;
 }
 return copied;
}
