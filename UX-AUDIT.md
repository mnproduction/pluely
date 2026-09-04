# Mira Desk UX Audit

Reviewed 2026-09-04 against the running Windows application, its routes, dialogs, compact Assistant, two-channel Listen workspace, and source behavior. The review uses the `frontend-design` and `frontend-design-premium` contracts with WCAG 2.2 AA as the accessibility target.

## Product model

Mira Desk has three surfaces with different jobs:

1. **Assistant:** a compact, always-available action bar for asking, capturing, and starting Listen.
2. **Listen:** the real-time workspace for microphone and system-audio transcription plus answer suggestions.
3. **Dashboard:** setup, provider configuration, saved content, prompts, appearance, and shortcuts.

The two-channel Listen view is the strongest product idea. It should remain the center of the experience. The main usability problem was that settings, provider details, and legacy Pluely concepts competed with this task model.

## Severity scale

- **P0:** Blocks or materially disrupts the live-call workflow.
- **P1:** Causes frequent confusion, inaccessible operation, unsafe recovery, or loss of trust.
- **P2:** Adds friction or inconsistency but has a clear workaround.
- **P3:** Polish and longer-term product improvements.

## Findings and decisions

| Area | Severity | Finding | Decision / status |
|---|---:|---|---|
| Listen | P0 | Opening session settings consumed normal layout height and reduced transcript and response to narrow strips. | Fixed. Settings and diagnostics now use a bounded non-modal floating inspector that overlays without reflow. |
| Assistant | P1 | The sparkles action was titled “Open Dev Space” but opened the Dashboard at its last route. | Fixed. It is named “Open dashboard.” |
| Listen | P1 | “Interview profile” implied a selected prompt profile even when none was selected. | Fixed. It now says “Two-channel session.” |
| Listen | P1 | Automatic response used the only native select and looked different from every Dashboard selector. | Fixed. It uses the shared authored Select with three explicit modes. |
| Dashboard | P1 | The landing page was a long setup note. It did not answer whether AI, STT, and audio were ready. | Fixed. Dashboard now shows 3-part session readiness and direct setup actions. |
| Providers | P1 | “Dev Space” and the upstream contribution promotion obscured the real job. | Fixed. Navigation and page title now say “Providers”; the stale promotion was removed. |
| Providers | P1 | API-key fields had no show/hide action and a disabled submit icon that never became a meaningful submit action because values already auto-save. | Fixed. Shared SecretInput is masked by default, has accessible show/hide state, and removes the false submit affordance. |
| Providers | P1 | Copy claimed a key was “never shared,” though authentication necessarily sends it to the selected provider. | Fixed. Copy states that Windows protects the local value and that it is sent to the selected provider for authentication. |
| Conversations | P1 | Clickable Cards were unavailable through normal keyboard semantics; search was narrow and had no clear or no-results recovery. | Fixed. Rows are buttons, search is full-width up to a readable maximum, Clear returns focus, and no-results is distinct. |
| Conversations | P1 | The local list rendered without an explicit bound. | Fixed. It displays 50 at a time with a Load more action. |
| System prompts | P1 | Prompt selection depended on a clickable Card and a green check. Search had no clear recovery. | Fixed. Prompt selection is a semantic pressed button with focus, and search has Clear and a distinct no-results state. |
| Responses | P1 | Response length Cards behaved like radio choices without radio semantics or keyboard interaction. | Fixed. They are a radio group of semantic buttons with `aria-checked`. |
| Settings | P1 | Delete-all history UI existed but was unreachable. Its old hand-built modal lacked focus management and reported success on a timer regardless of result. | Fixed. It is available in Settings and uses the shared Radix Dialog, real pending state, safe initial focus, and actual success/error feedback. |
| Settings | P1 | Always-on-top accessible text described the wrong next state, and the visible label switched between enable/disable. | Fixed. The label is stable and its accessible name describes the setting. |
| Settings | P2 | System theme text described dark mode even when Windows used light mode. The icon trigger had no accessible name. | Fixed. The current resolved Windows theme is shown and the trigger is named. |
| Assistant | P1 | `onKeyPress` was used for submit, which is deprecated and unsafe for composition input. Conversation arrays were sorted in place during render. | Fixed. The input uses `onKeyDown`; rendered history sorts a copy. Full UI localization and broader IME testing remain open. |
| Cursor | P2 | Blur attempted `display = "0"`, an invalid CSS value, so the custom cursor could remain visible. | Fixed. Blur now sets opacity to zero. |
| Shared controls | P1 | Buttons had no safe default `type`, allowing accidental form submission as forms are introduced. Shared Textarea did not own the no-resize contract. | Fixed in shared Button and Textarea. |
| Navigation | P1 | Logo was a clickable `div`; route matching used substring matching; Quit was represented as an external link. | Fixed. Actions use buttons, current route is exact with subroute support, and `aria-current` is exposed. |
| Navigation | P2 | Four icon-only footer links added unrelated upstream and social destinations. | Reduced to project site and upstream source, both with accessible names. |
| Scrollbars | P2 | Thumb contrast was extremely faint and lacked active, reduced-motion, and forced-color behavior. | Fixed at the global token owner. |
| Audio | P1 | Device selection did not prove that microphone and system-audio signals were actually arriving. | Fixed. Audio now has independent You/Them tests with live meters. The test path displays signal metadata only and does not transcribe or save audio. |
| Audio | P2 | Success messages appeared for a fixed time and shifted the page. Errors were logged only to the console. | Fixed. Each channel owns a stable status row, and device-load and test errors are visible in context. |
| Listen | P1 | Channel status relies heavily on tiny dots and 9px to 10px metadata. | Partially addressed by existing names and meters. Increase critical status text to at least 12px in the next visual-density pass. |
| Listen | P1 | The main settings icon opens the Dashboard at whichever route was last used. | Copy is now honest. A future Tauri navigation command should open the Audio or Providers route directly. |
| Listen | P2 | The follow-up field becomes useful only after a transcript but the reason is mainly a disabled state. | Partially fixed with an explanatory tooltip. Add persistent helper copy if testing shows continued confusion. |
| System prompts | P2 | “Generate with AI” was a popover inside a modal, creating nested overlay and focus complexity. | Fixed. Generation is an inline disclosure inside the Create/Edit dialog. |
| System prompts | P2 | Prompt previews did not clearly explain that one selected prompt is active globally. | Fixed. The selected card now has a visible “Active” badge with an explicit accessible label. Full prompt editing remains in the detail dialog. |
| Chat detail | P1 | The composer used an absolute footer that could cover the final message and error feedback. | Fixed. The conversation is a flex column with a sticky, non-overlapping composer and reserved error geometry. |
| Chat detail | P2 | Header actions are compressed at the current window width and “Open in Overlay” did not match the product term Assistant. | Partially fixed. The action is now “Use in Assistant.” Moving secondary actions into a narrow-width menu remains open. |
| Chat detail | P2 | Placeholder-only composer lacked a persistent accessible label. | Fixed. The composer and attachment action group now have explicit accessible names. |
| Shortcuts | P1 | Reset applied immediately without confirmation or undo. | Fixed. Reset uses the shared Dialog and names its full scope before applying. |
| Shortcuts | P2 | Enabled state depended on the switch alone and Change was blocked during global apply without a per-row explanation. | Fixed. Every row shows Enabled/Disabled text and the page has a stable live status region. |
| Screenshot | P2 | Descriptions exposed implementation mechanics, used inconsistent capitalization, and were longer than the choice itself. | Fixed. Capture and processing choices now describe user outcomes, and the automatic prompt has a persistent label. |
| Custom providers | P1 | The custom-provider form encouraged embedding a real API key directly in a cURL command. | Fixed. Copy and validation require `{{API_KEY}}` for credential headers. Endpoint cards omit query strings and fragments that could contain old secrets. |
| Custom providers | P1 | Custom-provider delete confirmation used a page-local modal instead of the canonical Dialog. | Fixed. AI and STT deletion now use the shared Dialog with pending and inline failure states. |
| Whole app | P1 | The owned UI is English-only while users can select Ukrainian response output. | Open product decision. Add an application locale setting and message catalog before translating individual screens. |
| Whole app | P2 | Route titles did not update `document.title`; no explicit 404 route existed. | Fixed. Every route owns a Mira Desk title and unknown routes show an app-owned recovery screen. |
| Whole app | P2 | Icon help depends on native `title`, which is delayed and unavailable on touch. | Open. Add one shared Tooltip primitive and migrate compact Assistant actions first. |

## Window-by-window usability notes

### Compact Assistant

The compact width and neutral surface work well. Listen, input, screenshot, and Dashboard are reachable without expanding the window. The key improvement is labeling: every icon must have an accessible name, and unfamiliar icons need a shared tooltip. The drag grip is intentionally non-interactive; the global Move Window shortcut is its keyboard alternative.

The microphone icon used by automatic speech can look disabled while the session is listening. That state should eventually distinguish “microphone available,” “speech detected,” “recording,” and “muted” without reusing a conventional mic-off symbol for an active feature.

### Listen workspace

This is the canonical product workspace. The channel cards, independent transcript labels, latest-question callout, and adjacent suggestion column form a clear sequence. The session inspector fix preserves that sequence. The next pass should raise the smallest text, consolidate duplicated error status between compact and expanded surfaces, and provide an explicit active system-prompt name.

Automatic response modes need short explanations:

- **Questions:** Suggest after the other speaker asks a likely question.
- **Every pause:** Suggest after each completed speech segment.
- **Off:** Only suggest when the user asks.

### Dashboard home

The readiness model is the correct landing-page information architecture. It gives the user a compact pre-call checklist without exposing any key, transcript, or response content. Readiness cards describe configuration, while the linked Audio page verifies live signal for both channels.

### Conversations and chat detail

The list now supports keyboard operation, clear recovery, no-results feedback, and bounded rendering. Search remains intentionally transient because titles are private local content. Chat detail owns its message flow and sticky composer without overlap. A compact menu for secondary header actions is still useful at narrow widths.

### System prompts

Selection, edit, create, and delete now follow one dialog and focus model. The selected prompt is visibly active for Assistant, and AI generation stays inline in the Create/Edit dialog so loading, error, and focus remain in one workflow.

### App Settings

Settings now includes the previously unreachable history deletion control. Permanent deletion uses the shared confirmation contract. Appearance, startup, taskbar visibility, and always-on-top settings are understandable, but the page would scan better as grouped cards: Appearance, Window behavior, Startup, and Local data.

### Responses

Response length now behaves like a true single choice. Language selection is visually consistent with other authored selects. Auto-scroll should explain whether it affects Assistant responses, chat history, or both.

### Screenshot

The two select controls provide a clear mode hierarchy and now describe outcome and timing. Full-screen versus selected-area capture remains separate from automatic versus review-before-sending behavior. A preview of what will be sent would increase trust, especially in automatic mode.

### Audio

The Audio page now carries the same You/Them model as Listen. Each selected device has an independent Test action, current device name, live meter, detected/not-detected status, and recovery guidance. System-audio testing uses a dedicated native level-only path so it cannot emit a transcript segment.

### Cursor and Shortcuts

Cursor selection is a proper authored listbox. Shortcut recording gives immediate feedback and validates conflicts. Reset now requires confirmation, global apply has a stable live status, and every row exposes Enabled or Disabled in text as well as through the switch.

### Providers

Renaming Dev Space to Providers clarifies the job. Built-in providers remain the normal path. Custom cURL providers are labeled Advanced and require secret placeholders in credential headers. API keys are maskable, endpoint summaries hide query strings and fragments, and removal uses the canonical dialog. Future work should add stable Saved/Saving/Failed feedback without displaying secret characters.

## Recommended implementation order

1. Add a shared Tooltip primitive, then migrate compact Assistant actions and ambiguous icon controls.
2. Expose the active system-prompt name in Listen and add stable provider Saved/Saving/Failed feedback.
3. Group App Settings into Appearance, Window behavior, Startup, and Local data sections.
4. Move chat-detail secondary actions into a compact menu below the narrow breakpoint.
5. Add application localization infrastructure and a Windows-focused keyboard accessibility pass.

## Validation scope

Static validation is recorded in `premium-audit.json`: the strict premium audit reports 0 findings, and `designmd lint DESIGN.md` reports 0 errors and 0 warnings. The frontend suite passes 72 tests. The native suite passes 11 tests, with 3 Windows audio hardware checks retained as explicit manual tests. The production frontend and Tauri release builds complete successfully; Vite reports only its existing large-chunk advisory.

Runtime visual review covers the compact Assistant, every Dashboard route, System Prompt dialogs and menu states, Chat detail, authored select popup, Listen idle/live states, and Listen settings/diagnostics. The new Audio test controls are compile-tested and their level-only native path has unit coverage; microphone and selected-output signal still require a final hardware check after switching to the 0.3.0 build. Captured review images are local temporary evidence only and are not part of the repository because they may contain private on-screen content.
