const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('daytownDesktop',{
 interactive:value=>ipcRenderer.send('daytown:pointer',!!value),
 dashboard:()=>ipcRenderer.send('daytown:dashboard'),
 walk:value=>ipcRenderer.send('daytown:walk',!!value),
 close:()=>ipcRenderer.send('daytown:close')
});
