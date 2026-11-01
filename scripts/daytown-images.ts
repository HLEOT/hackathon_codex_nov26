// Active artwork is the pixel-art developer workspace, with no pet regeneration.
await import('./daytown-workbench.ts');
if(process.argv.includes('--all')){
 const {seedWeek}=await import('../src/store.ts');
 const {ensureTownAssets,waitForAssets,getAssetStatus}=await import('../src/images.ts');
 const state=seedWeek(Date.parse('2026-11-01T13:00:00Z'));
 ensureTownAssets(state);await waitForAssets();console.log(JSON.stringify(getAssetStatus(state),null,2));
}
