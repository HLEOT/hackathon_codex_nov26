# Nudgling build log — 1 November 2026, London

- Repository inspection: empty workspace, no existing code or project instructions. Node 24 available; global npm missing. Installed project-local npm and Express. Key supplied by user was saved only to ignored `.env`.
- Read current official Codex/API documentation before integration code. Verified `notify` command-array config and single JSON argument; `gpt-transcribe`; requested GPT Image 2.5 Flare/Sunburst; Responses `text.format` JSON schema. All model names kept in env files.
- Built requested smoke harness first. Initial image/transcription tests blocked by missing key; continued independent UI/state work.
- Notable failure: IPv4 loopback connections to the app timed out even with a listener. A same-process loopback probe succeeded. IPv6 localhost listener fixed cross-process and Chrome access. No firewall/security changes made.
- Live smoke results: notify script POST PASS; base generation plus edit PASS; WAV transcription PASS (`Fix flaky auth test.`); Structured Outputs PASS. Real Codex turn with per-command notify config PASS. Completion also appeared in the browser via SSE.
- Generated one unique mint pet with lilac sprout, then five edits of that base. All six PNGs cached in assets. Inspected base and fuse artwork; cute, nonviolent character preserved.
- State checks passed: idle grace, hidden tab elapsed time, completion timestamp and 3× pressure, throttled timers/pop, swaps/egg recovery, breadcrumb storage. Added energy-mode coverage after stretch implementation.
- Chrome QA: add task using real parser; one generated step; swap dialog; breadcrumb saved; reload; return to task with breadcrumb visible; 10-second demo at 100 yields egg; completing tiny step returns calm pet and increments completed count.
- Found and fixed task rows being rebuilt on every tick, which detached click targets and keyboard focus. Rows now update only when pocket state changes.
- Core journey verified before 15:15. Added Document PiP, energy modes and local factual three-line standup in requested order. TTS deferred after checking current speech migration guidance.
- No deployment, accounts, extensions, GPT-Live or global Codex configuration changes. Hook emits event metadata only; notable events are stored in ignored runtime/codex-events.jsonl. No API keys/prompts/assistant output in that log.
- Additional HTTP journey check passed: recorded WAV → server transcription route → command parser; add/done/swap/where-was-I/standup and unknown-input fallback; cross-origin POST denied; `.env` not served.
- User requested an application with only sprite/text visible so it does not obscure work. Added an optional transparent Electron shell, click-through empty background, hover controls and same-window full app expansion; browser demo remains supported. Checked official Electron transparency, IPC isolation and click-through APIs first.
- Computer Use stopped while inspecting the Chrome PiP window because it could not establish that native window's browser URL. No further interaction with that Chrome PiP window was attempted.
