# How Codex helped — Daytown

Built during the DevDay Exchange Community Hackathon, London, 1 November 2026. The workspace was empty at the start. The initial Nudgling prototype was built in this same session; Daytown reuses its tested API wrappers, mint pet base image, environment configuration and selected voice/SSE code. No pre-hackathon application template was used.

## Concrete example

Codex wrote a notify integration smoke harness that launched an actual read-only Codex turn with a per-command `notify` config. It detected the completion's POST at the localhost server and verified SSE delivery in Chrome. When IPv4 loopback requests timed out, Codex isolated the problem and switched the listener to IPv6 localhost without changing firewall settings. This tested integration is retained as an optional builder signal; Daytown's task/reminder loop does not depend on it.

## Parallel implementation lanes

- `daytown_backend`: TypeScript local JSON store, Structured Outputs multi-task voice parser, one-shot reminders, health/death/egg transitions and backend tests.
- `daytown_visuals`: cached landscape/building/pet image generation and identity-preserving edits, sharp compositor, scene cache and compositor tests.
- `daytown_frontend`: illustrated dashboard, Manifest V3 new-tab override with offline cache, Document Picture-in-Picture pet, visual effects and voice controls.
- Primary Codex agent: official documentation research, cross-lane contracts and integration, environment/setup, tests, review, README/credits, milestone commits and delivery checks.

## Verified contributions before the Daytown pivot

- Real image generation with GPT Image 2.5 Flare and edit with Sunburst; recorded audio transcribed using gpt-transcribe; strict Responses JSON schema.
- Seven state tests covering elapsed hidden/idle time, faster completion pressure, breadcrumbs, egg recovery and energy modes.
- Chrome QA of typed command → generated tiny step → task switch → breadcrumb recovery → timed pop → egg → completed-step hatch.
- Added optional transparent desktop shell after the user requested a sprite-and-text application. Its Electron download stalled, so Daytown prioritizes the requested browser/PiP baseline.

## Daytown checks and review

Claims here refer to executed checks, not planned work. Live model calls use the ignored local .env file; no credentials or private tasks belong in this log.

- 23 integration/unit/manifest tests passed after independent reviews and fixes. TypeScript checks passed.
- Current live image smoke passed: landscape, transparent TAXES building, done/storm edits, same-character hungry/ghost pet, and server-composited PNG. The fictional sample bundle now includes all four sample-week buildings, pet stages and story scenes with checksums.
- Browser brain dump created four separate tasks, resolved Thursday/Friday/tonight in London time, selected the next dated task and showed one step. Completion fed the pet and moved the next step.
- Live transcription-to-Structured-Outputs and short TTS checks passed. A real model preserved a 15:00 dentist appointment when moved to Friday.
- Independent review fixed reminders lost while tabs were closed, duplicate-media races, day-only moves changing appointment times, clipped graves after number twelve, failed scene retry and repeated expensive composites.
- User feedback changed the extension from a new-tab takeover to an additive Chrome side panel, retaining default Google search and browser settings. Further feedback replaced clipped slogans with natural, direct sentences.
- The user found the opaque browser pop-out intrusive. Codex built a separate Windows application with per-pixel PNG alpha, click-through empty space and hover-only controls. Its running app reported visible/topmost/alpha-window status and emitted a transparent render artifact; localhost presence confirmed the process was alive. Electron's official runtime download timed out, so the native application avoids that external dependency on Windows.
- No firewall, script execution policy or other system protection was changed. A normal C# compilation produces an ignored local executable. Voice and walking remain off by default.

## App-first workbench refinement

User feedback replaced the room of project stations with one compact pixel desk, up to three task notes and one animated companion. Codex generated one transparent desk without a baked-in character, extracted existing working/idle frames from the user's locally connected pet, and aligned the same actor in the full app and native corner workshop. Personal artwork remains ignored.

The Windows workbench render reported visible/topmost/per-pixel alpha, 340 × 270 pixels and exactly one actor. Empty pixels pass clicks through. Controls appear on hover; voice and walking default off. The main standalone WebView2 application remains the entry point, with editable voice transcripts and explicit London dates.

Codex review caught an edge case where three visible notes could omit the selected next task among four undated tasks. The compositor prioritizes that next task. Light/dark/system themes and additive Chrome side-panel behavior are retained. The installed legacy extension's reload is user-managed; current source tests prove no new-tab or search override.

The user's live microphone test transcribed “auth” as “orth”. Codex added documented transcription vocabulary hints and editable task titles/first steps; it does not claim speech recognition is perfect.

Final workbench checks: 30 tests passed and TypeScript passed. The native pinboard counts all tasks and the full scene includes a raised floor, window, rug, plant and one actor. Anonymous GitHub access returned HTTP 200 with visibility public. npm start reuses an existing Daytown server.

## Timing, pressure, native voice and pet history

Codex added per-task manual elapsed work, explicit active-task selection, preserved timing on swaps, cooperative ready/gassed commands, protected focus/break intervals, pressure escalation with a cartoon pop, and lifetime metadata on permanent graves. A restart regression excludes unobserved downtime from work totals while preserving reserved focus protection. The full suite passed 43 tests and TypeScript.

The native overlay now opens a separate compact WebView2 voice card, sharing the main application profile for draft review. Recorded “I am gassed and need a five minute break” transcribed exactly and parsed as gassed with five minutes. Browser QA confirmed a named Auth tests completion targets that task while Taxes is active, and work time remains with the old task after swapping.

A review found an existing Codex notification command on the workstation. Codex implemented and tested a preserving notification chain rather than replacing it, with an exact local config backup. Tests prove the prior command receives its original event while Daytown receives metadata only. The installed user-level hook applies to new Codex sessions; pet appearance reuse remains a separate read-only bridge.

Final HTTP test also passed: named Ready selects the requested task, swaps preserve sessions, Pause and Gassed stop work, and duplicate Codex events are acknowledged once. The complete final suite has 44 tests. Native UI QA opened the real compact WebView2 card, parsed “I am ready” into a confirmation for the active task, and cancelled without mutation. A real read-only Codex turn reached Daytown through the preserving hook; installed activity and appearance states were checked separately.

## Final natural-voice check

The user confirmed that a single Talk click understood “I finished the pitch deck, and I’m gassed”, stopped listening, completed the task, acknowledged it aloud and started a break without typing or confirmation. The parser supports multiple explicit completed IDs, readiness, a clarification question and a grounded acknowledgement in one strict response. Atomic HTTP tests reject partial batches and prove that clarification leaves tasks unchanged. The final full suite passed 47 tests with TypeScript. The corner timer bar is always drawn, including while an egg waits.
