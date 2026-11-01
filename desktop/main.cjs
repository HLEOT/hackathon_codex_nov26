const {app,BrowserWindow,ipcMain,screen,session,dialog}=require('electron');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..');
try{process.loadEnvFile(path.join(root,'.env'));}catch{}
const origin=`http://localhost:${process.env.PORT||3000}`;
let pet,dashboard,server,walking=false,walkTimer,direction=-1,hovered=false;
app.setName('Daytown');
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{pet?.showInactive();});
function trusted(event){try{return [pet?.webContents,dashboard?.webContents].includes(event.sender)&&new URL(event.senderFrame.url).origin===origin;}catch{return false;}}
async function readyServer(){
 try{if((await fetch(origin+'/api/state',{signal:AbortSignal.timeout(1500)})).ok)return;}catch{}
 server=spawn(process.execPath,['--env-file-if-exists=.env','src/server.ts'],{cwd:root,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},windowsHide:true,stdio:'ignore'});
 for(let i=0;i<40;i++){await new Promise(resolve=>setTimeout(resolve,150));try{if((await fetch(origin+'/api/state',{signal:AbortSignal.timeout(500)})).ok)return;}catch{}}
 throw new Error('Start Daytown with npm start and try again.');
}
function openDashboard(){
 if(dashboard&&!dashboard.isDestroyed()){dashboard.show();dashboard.focus();return;}
 dashboard=new BrowserWindow({title:'Daytown',width:1050,height:850,backgroundColor:'#f7f4e9',webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true}});
 dashboard.webContents.setWindowOpenHandler(()=>({action:'deny'}));
 dashboard.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
 dashboard.loadURL(origin);dashboard.on('closed',()=>dashboard=null);
}
app.whenReady().then(async()=>{
 try{
 await readyServer();
 session.defaultSession.setPermissionRequestHandler((contents,permission,callback,details)=>callback([pet?.webContents,dashboard?.webContents].includes(contents)&&contents.getURL().startsWith(origin+'/')&&permission==='media'&&!details.mediaTypes?.includes('video')));
 const area=screen.getPrimaryDisplay().workArea;
 pet=new BrowserWindow({title:'Daytown pet',width:260,height:230,x:area.x+area.width-275,y:area.y+area.height-245,frame:false,transparent:true,backgroundColor:'#00000000',hasShadow:false,resizable:false,alwaysOnTop:true,show:false,skipTaskbar:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 pet.webContents.setWindowOpenHandler(()=>({action:'deny'}));pet.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==origin)event.preventDefault();});
 pet.once('ready-to-show',()=>pet.showInactive());await pet.loadURL(origin+'/desktop-pet.html');
 walkTimer=setInterval(()=>{if(!walking||hovered||!pet||pet.isDestroyed())return;const area=screen.getDisplayMatching(pet.getBounds()).workArea;const bounds=pet.getBounds();let x=bounds.x+direction*2;if(x<area.x||x+260>area.x+area.width){direction*=-1;x=Math.max(area.x,Math.min(area.x+area.width-260,x));}pet.setPosition(x,area.y+area.height-230);},100);
 }catch(error){dialog.showErrorBox('Daytown',error.message);app.quit();}
});
ipcMain.on('daytown:pointer',(event,value)=>{if(trusted(event)){hovered=!!value;pet.setIgnoreMouseEvents(!value,{forward:true});}});
ipcMain.on('daytown:dashboard',event=>{if(trusted(event))openDashboard();});
ipcMain.on('daytown:walk',(event,value)=>{if(trusted(event))walking=!!value;});
ipcMain.on('daytown:close',event=>{if(trusted(event))app.quit();});
app.on('window-all-closed',()=>app.quit());app.on('before-quit',()=>{clearInterval(walkTimer);server?.kill();});
}
