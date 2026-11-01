import {resolve} from 'node:path';
import {installCodexNotify} from '../src/codex-notify.ts';
console.log(JSON.stringify(await installCodexNotify(resolve('.'))));
