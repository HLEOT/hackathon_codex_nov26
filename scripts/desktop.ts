import {resolve} from 'node:path';
import {launchDesktopPet} from '../src/native.ts';
console.log('Desktop pet:',await launchDesktopPet(resolve('.'),`http://localhost:${process.env.PORT||3000}`));
