import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
let building:Promise<string>|null=null;
let appBuilding:Promise<string>|null=null;
export async function nativeAppExecutable(root:string):Promise<string>{
 if(appBuilding)return appBuilding;
 appBuilding=(async()=>{
  const sdk=resolve(root,'.tools/webview2/sdk');
  const core=resolve(sdk,'lib/net462/Microsoft.Web.WebView2.Core.dll');
  const forms=resolve(sdk,'lib/net462/Microsoft.Web.WebView2.WinForms.dll');
  await mkdir(resolve(root,'runtime'),{recursive:true});
  if(!existsSync(core)){
   await mkdir(resolve(root,'.tools/webview2'),{recursive:true});
   await new Promise<void>((done,fail)=>{
    const setup=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',"$ErrorActionPreference='Stop'; Invoke-WebRequest -Uri 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4314.35/microsoft.web.webview2.1.0.4314.35.nupkg' -OutFile $env:DAYTOWN_WEBVIEW_ZIP -TimeoutSec 45; Expand-Archive -LiteralPath $env:DAYTOWN_WEBVIEW_ZIP -DestinationPath $env:DAYTOWN_WEBVIEW_SDK -Force"],{cwd:root,windowsHide:true,env:{...process.env,DAYTOWN_WEBVIEW_ZIP:resolve(root,'.tools/webview2/sdk.zip'),DAYTOWN_WEBVIEW_SDK:sdk},stdio:'ignore'});
    setup.once('error',fail);setup.once('exit',code=>code===0?done():fail(new Error('Could not install Microsoft WebView2 SDK. Please retry Open app.')));
   });
  }
  for(const source of [core,forms,resolve(sdk,'runtimes/win-x64/native/WebView2Loader.dll')]){const name=source.split(/[\\/]/).at(-1)!;const target=resolve(root,'runtime',name);if(!existsSync(target))await copyFile(source,target);}
  const source=resolve(root,'desktop/AppWindow.cs');
  const hash=createHash('sha256').update(await readFile(source)).digest('hex').slice(0,12);
  const output=resolve(root,`runtime/DaytownApp-${hash}.exe`);if(existsSync(output))return output;
  await new Promise<void>((done,fail)=>{
   const compiler=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Add-Type -Path $env:DAYTOWN_SOURCE -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,$env:DAYTOWN_WEBVIEW_CORE,$env:DAYTOWN_WEBVIEW_FORMS -OutputAssembly $env:DAYTOWN_OUTPUT -OutputType WindowsApplication'],{cwd:root,windowsHide:true,env:{...process.env,DAYTOWN_SOURCE:source,DAYTOWN_OUTPUT:output,DAYTOWN_WEBVIEW_CORE:core,DAYTOWN_WEBVIEW_FORMS:forms},stdio:['ignore','pipe','pipe']});
   let errors='';compiler.stderr.on('data',chunk=>errors+=chunk);compiler.once('error',fail);compiler.once('exit',code=>code===0?done():fail(new Error('Could not compile Daytown. '+errors.slice(0,500))));
  });return output;
 })();try{return await appBuilding;}finally{appBuilding=null;}
}
export async function launchDesktopApp(root:string,url:string):Promise<string>{
 const executable=process.platform==='win32'?await nativeAppExecutable(root):resolve(root,'node_modules/electron/dist',process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron');
 const env={...process.env};delete env.OPENAI_API_KEY;delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(executable,process.platform==='win32'?[url]:[resolve(root,'desktop/main.cjs'),'--app'],{cwd:root,env,detached:true,stdio:'ignore',windowsHide:false});
 await new Promise<void>((done,fail)=>{child.once('spawn',done);child.once('error',fail);});child.unref();return 'application';
}
export async function launchCompanionVoice(root:string,url:string):Promise<string>{
 if(process.platform!=='win32')throw new Error('The native voice panel currently requires Windows. Open /companion.html from Daytown in your browser.');
 const executable=await nativeAppExecutable(root);
 const env={...process.env};delete env.OPENAI_API_KEY;delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(executable,[url,'--companion'],{cwd:root,env,detached:true,stdio:'ignore',windowsHide:false});
 await new Promise<void>((done,fail)=>{child.once('spawn',done);child.once('error',fail);});child.unref();return 'companion';
}
export async function nativePetExecutable(root:string):Promise<string>{
 if(building)return building;
 building=(async()=>{
  const source=resolve(root,'desktop/PetOverlay.cs');
  const hash=createHash('sha256').update(await readFile(source)).digest('hex').slice(0,12);
  const output=resolve(root,`runtime/DaytownPet-${hash}.exe`);
  if(existsSync(output))return output;
  await mkdir(resolve(root,'runtime'),{recursive:true});
  await new Promise<void>((done,fail)=>{
   const compiler=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command','Add-Type -Path $env:DAYTOWN_SOURCE -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll -OutputAssembly $env:DAYTOWN_OUTPUT -OutputType WindowsApplication'],{cwd:root,windowsHide:true,env:{...process.env,DAYTOWN_SOURCE:source,DAYTOWN_OUTPUT:output},stdio:['ignore','pipe','pipe']});
   let errors='';compiler.stderr.on('data',chunk=>errors+=chunk);compiler.on('error',fail);compiler.on('exit',code=>code===0?done():fail(new Error('Could not compile the desktop pet. '+errors.slice(0,500))));
  });return output;
 })();try{return await building;}finally{building=null;}
}
export async function launchDesktopPet(root:string,url:string):Promise<string>{
 const native=process.platform==='win32';
 const executable=native?await nativePetExecutable(root):resolve(root,'node_modules/electron/dist',process.platform==='darwin'?'Electron.app/Contents/MacOS/Electron':'electron');
 if(!existsSync(executable))throw new Error('Install Electron with npm install for the transparent desktop pet.');
 const env={...process.env};delete env.OPENAI_API_KEY;delete env.ELECTRON_RUN_AS_NODE;
 const child=spawn(executable,native?[url]:[resolve(root,'desktop/main.cjs')],{cwd:root,env,detached:true,stdio:'ignore',windowsHide:false});
 await new Promise<void>((done,fail)=>{child.once('spawn',done);child.once('error',fail);});child.unref();return native?'windows-native':'electron';
}
