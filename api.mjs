import './config.mjs';
export async function openai(endpoint, body, multipart = false) {
  if (!process.env.OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY in .env, then restart the server.');
  const response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, ...(!multipart && {'Content-Type':'application/json'}) },
    body: multipart ? body : JSON.stringify(body), signal: AbortSignal.timeout(180000)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${result.error?.message || 'request failed'}`);
  return result;
}
export async function transcribe(buffer, type = 'audio/webm') {
  const form = new FormData();
  const extension = type.includes('wav') ? 'wav' : type.includes('mp4') ? 'mp4' : 'webm';
  form.set('file', new Blob([buffer], {type}), `voice.${extension}`);
  form.set('model', process.env.TRANSCRIPTION_MODEL);
  form.set('prompt', 'A software builder dictating a task list. Common vocabulary includes auth tests, authentication, flaky tests, pull requests, PR 42, CI, TypeScript, Playwright and Codex. Commands also include “I am gassed”, “I need a break”, “I am ready”, and naming a task that is done. The list can also contain personal errands and appointments.');
  for (const word of ['auth','auth tests','authentication','flaky tests','pull request','PR','CI','TypeScript','Playwright','Codex']) form.append('keywords[]',word);
  form.append('languages[]','en');
  const result = await openai('audio/transcriptions', form, true);
  if (!result.text?.trim()) throw new Error('No speech heard. Try holding the microphone a little longer.');
  return result.text.trim();
}
