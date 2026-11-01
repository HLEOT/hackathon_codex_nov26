// Pure selection helper shared by the dashboard and packaged extension worker.
export function nextView(previous={index:-1,greeting:-1},hasScenes=false,random=Math.random()){
 const index=Number.isInteger(previous.index)?previous.index+1:0;
 const modes=['wide','close','street',hasScenes?'story':'close'];
 let mode=modes[index%4];if(mode===previous.mode)mode=mode==='wide'?'close':'wide';
 const greeting=(Number(previous.greeting)+1+Math.floor(Math.max(0,Math.min(.999999,random))*4))%5;
 return {index,mode,greeting};
}
