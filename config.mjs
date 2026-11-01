import {readFileSync} from 'node:fs';
// Defaults also live in an env file; user .env / process values take precedence.
for (const line of readFileSync(new URL('.env.example',import.meta.url),'utf8').split(/\r?\n/)) {
  const match=line.match(/^([A-Z_]+)=(.*)$/); if(match && !process.env[match[1]]) process.env[match[1]]=match[2];
}
