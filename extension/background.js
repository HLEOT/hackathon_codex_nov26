import {nextView} from './daytown-view.js';
// Daytown complements Chrome. It never replaces the new-tab page or search.
function configurePanel(){chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});}
chrome.runtime.onInstalled.addListener(configurePanel);
chrome.runtime.onStartup.addListener(configurePanel);
configurePanel();
// Serialize simultaneous new-tab openings so two tabs cannot choose the same view.
let queue=Promise.resolve();
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
 if(message?.kind!=='daytown-next-view'||sender.id!==chrome.runtime.id)return;
 queue=queue.then(async()=>{
  const key='daytown-view-v1';const previous=(await chrome.storage.local.get(key))[key]||{index:-1,greeting:-1};
  const view=nextView(previous,!!message.hasScenes);await chrome.storage.local.set({[key]:view});respond(view);
 }).catch(()=>respond(null));
 return true;
});
