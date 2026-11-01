import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const manifest=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url),'utf8'));
test('Daytown adds a side panel and leaves Chrome new tab and search untouched',()=>{
 assert.equal(manifest.manifest_version,3);
 assert.equal(manifest.side_panel.default_path,'panel.html');
 assert.equal(manifest.action.default_title,'Open Daytown');
 assert.ok(manifest.permissions.includes('sidePanel'));
 assert.equal(manifest.chrome_url_overrides,undefined);
 assert.equal(manifest.chrome_settings_overrides,undefined);
 assert.equal(manifest.content_scripts,undefined);
});
test('side panel scripts and styles are packaged; API permission is localhost only',async()=>{
 assert.deepEqual(manifest.host_permissions,['http://localhost:3000/*']);
 const html=await readFile(new URL('./panel.html',import.meta.url),'utf8');
 const scriptSources=[...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match=>match[1]);
 assert.deepEqual(scriptSources,['app.js']);
 const styles=[...html.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["']/g)].map(match=>match[1]);
 assert.deepEqual(styles,['style.css','panel.css']);
 for(const file of [...scriptSources,...styles,manifest.background.service_worker]){
  assert.doesNotMatch(file,/^(?:https?:)?\/\//);
  const source=await readFile(new URL('./'+file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/@import\s+url\(['"]?https?:/);
  assert.doesNotMatch(source,/\bsk-proj-/);
 }
});
