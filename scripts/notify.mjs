// Codex appends one JSON argument. Never forward prompts or assistant text.
try {
  const event = JSON.parse(process.argv[2] || '{}');
  if (event.type === 'agent-turn-complete') {
    const response = await fetch(process.env.NUDGLING_URL || 'http://localhost:3000/api/codex-event', {
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({type:event.type,'thread-id':event['thread-id'],'turn-id':event['turn-id'],cwd:event.cwd}),signal:AbortSignal.timeout(3000)
    });
    if (!response.ok) console.error(`Nudgling hook: HTTP ${response.status}`);
  }
} catch(error) { console.error(`Nudgling hook: ${error.message}`); }
