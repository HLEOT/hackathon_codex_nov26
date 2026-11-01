import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DaytownStore,addTasks,death} from '../src/store.ts';
import {persistGravePortrait} from '../src/server.ts';

test('a grave permanently keeps its pet name and portrait bytes without any model key',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'daytown-grave-'));const oldKey=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='';
 try{
  const file=join(directory,'state.json'),source=join(directory,'happy.png'),portraits=join(directory,'graves');
  const original=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5wAAAABJRU5ErkJggg==','base64');await writeFile(source,original);
  const store=new DaytownStore(file,()=>{},0);
  await store.transact((state,events)=>{addTasks(state,[{title:'Fictional example',label:'Sample',tiny_first_step:'Open the sample folder.'}]);state.pet.name='Biscuit';death(state,state.tasks[0],events);});
  const id=store.snapshot().graves[0].id;assert.equal(store.snapshot().graves[0].petName,'Biscuit');assert.equal(store.snapshot().graves[0].portrait,null);
  await persistGravePortrait(store,id,source,portraits);
  assert.equal(store.snapshot().graves[0].portrait,`/generated/graves/${id}.png`);assert.deepEqual(await readFile(join(portraits,id+'.png')),original);
  await writeFile(source,Buffer.from('different artwork'));await store.transact(state=>{state.pet.name='A new friend';});await persistGravePortrait(store,id,source,portraits);
  assert.deepEqual(await readFile(join(portraits,id+'.png')),original);
  const reopened=new DaytownStore(file);await reopened.load();assert.equal(reopened.snapshot().graves[0].petName,'Biscuit');assert.equal(reopened.snapshot().graves[0].portrait,`/generated/graves/${id}.png`);
 }finally{if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;await rm(directory,{recursive:true,force:true});}
});
