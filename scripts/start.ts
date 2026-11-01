import {resolve} from 'node:path';
import {createApp} from '../src/server.ts';
import {launchDesktopApp} from '../src/native.ts';
const port=Number(process.env.PORT||3000);
const origin=`http://localhost:${port}`;
let alreadyRunning=false;
try{const response=await fetch(origin+'/api/status',{signal:AbortSignal.timeout(1000)});const status=await response.json();alreadyRunning=response.ok&&status.product==='Daytown';}catch{}
if(alreadyRunning){
 console.log(`Daytown is already running at ${origin}`);
 if(process.platform==='win32'&&!process.env.DAYTOWN_WEB_ONLY)await launchDesktopApp(resolve('.'),origin);
 process.exit(0);
}
const {app,close}=await createApp();
const server=app.listen(port,'::1',()=>{
 console.log(`Daytown is running at http://localhost:${port}`);
 if(process.platform==='win32'&&!process.env.DAYTOWN_WEB_ONLY)launchDesktopApp(resolve('.'),`http://localhost:${port}`).catch(error=>console.error('Open app:',error.message));
});
function stop(){close();server.close();}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
