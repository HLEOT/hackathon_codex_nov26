import {resolve} from 'node:path';
import {launchDesktopApp} from '../src/native.ts';
console.log('Daytown:',await launchDesktopApp(resolve('.'),`http://localhost:${process.env.PORT||3000}`));
