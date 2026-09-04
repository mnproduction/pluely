# UX Contract

## Product context

- Audience: Desktop users working during live calls, interviews, and focused writing.
- Primary jobs: Verify setup, capture two audio channels, read a transcript, get a suggested response, and manage saved conversations and prompts.
- Target market(s): Global. No country-specific rules are documented in the repository.
- Active locales: English UI. Response and transcription language are provider settings.
- Language/content register and native-review policy: Plain product English. User content is never translated by the UI.
- Timezone/calendar policy: Render local dates and times through the host locale. Stored timestamps remain unchanged.
- Accessibility target: WCAG 2.2 AA.

## Business-context sources

| Domain / scope | Authoritative source | Source type | Reviewed date |
|---|---|---|---|
| Provider and local-feature behavior | `README.md`, `src/contexts/app.context.tsx` | Product and implementation evidence | 2026-09-04 |
| Data lifecycle | `src/lib/database`, `src/lib/storage` | Implementation evidence | 2026-09-04 |
| Screen-capture behavior | `README.md`, `src-tauri/src` | Product and implementation evidence | 2026-09-04 |
| Deletion / retention | No maintained policy found | Release risk | 2026-09-04 |
| Billing / payment | Not applicable to this local fork | Product decision | 2026-09-04 |
| Legal / regulatory copy | `LICENSE` only | License | 2026-09-04 |

No new retention, privacy, or legal promise may be inferred from implementation alone.

## Visual contract

- Project `DESIGN.md`: `DESIGN.md`.
- Token ownership model: Existing runtime tokens are canonical and `DESIGN.md` documents their intent.
- Runtime design-system/token source: `src/global.css` and `src/components/ui`.
- Mapping/export/adapters: Tailwind v4 maps CSS variables in `src/global.css` through `@theme inline`.
- Token drift gate: `premium-ui.json`, DESIGN.md lint, strict premium audit, TypeScript build, and tests.
- Supported themes: Light, dark, and Windows system preference.
- Design-context owner/review policy: Update `DESIGN.md`, runtime owner, and validation in one change.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | `src/components/ui/select.tsx` | DESIGN + this contract | authored | keyboard + open popup |
| Form | Shared Input, Textarea, Label, Dialog components | this contract | create / edit | validation workflow |
| Scrollbar | `src/global.css` | DESIGN.md | stable gutter where needed | computed style + visual |
| CRUD | Page hooks plus shared Radix Dialog | this contract | return to owning list | full flow |
| Search | Shared Input plus explicit clear action | this contract | local search | keyboard + no-results |
| Session inspector | Listen floating panel | this contract | non-modal | visual + keyboard |

## Component behavior

| Component | Default | Hover | Focus | Active | Disabled | Busy | Error |
|---|---|---|---|---|---|---|---|
| Button | clear label or accessible name | tonal change | visible ring | pressed feedback | no action, reduced opacity | fixed geometry | nearby text |
| Icon button | tooltip + accessible name | tonal change | visible ring | pressed feedback | no action | spinner if needed | nearby text |
| Input | label or accessible name | stable | visible ring | n/a | no edit | reserved status | associated message |
| Secret input | masked | stable | visible ring | show/hide control | no edit | saved state | never echo secret |
| Search | clear when non-empty | clear action visible | returns focus after clear | local result update | n/a | n/a | no-results state |
| Textarea | resize none | stable | visible ring | n/a | no edit | fixed geometry | associated message |
| List | stable rows | row highlight | row ring | selection state | n/a | spinner or empty frame | inline recovery |

## Dataset navigation

- Admin tables: Not present.
- Exploratory lists: Conversation history uses explicit 50-item batches. Prompt lists are expected to remain small and render locally.
- URL state: Dashboard search is transient because it filters private local content in a desktop window.
- Page size: 50 conversations.
- Empty/no-results/error/loading treatment: Distinct initial empty, filtered no-results, loading, and error states.
- Back/scroll restoration: Detail returns through router history. Search is local component state.
- Selection scope: One prompt profile at a time. Selection is exposed with `aria-pressed` and visible styling.

## Flow ledger

| Operation | Trigger | Pending | Success destination | Success feedback | Failure recovery | Focus outcome | Source ref |
|---|---|---|---|---|---|---|---|
| Create prompt | Create New | button disabled and stable | prompt list | new prompt selected | dialog keeps values and shows error | return to trigger | system prompt hook |
| Edit prompt | card action menu | button disabled and stable | prompt list | edited card visible | dialog keeps values and shows error | return to menu trigger | system prompt hook |
| Delete prompt | card action menu | confirmation action disabled | prompt list | card removed | dialog remains recoverable | return to nearest list control | system prompt hook |
| Search | input | n/a for local data | same page | count updates | clear action | search input | local state |
| Listen | headset action | transition disables duplicate action | Listen workspace | Live status plus channel meters | actionable inline error and diagnostics | Listen controls | system audio hook |
| Suggest response | Suggest or automatic rule | stable generating state | same session | streamed response | inline error, retry remains available | triggering control | system audio hook |

## Navigation and responsive behavior

- Route document title policy: Route titles are visible headings. Browser document-title localization remains a tracked improvement.
- Route error / 403 page behavior: Shared ErrorLayout preserves an app-owned recovery surface.
- Breadcrumb/tab/route-state policy: Flat sidebar navigation; detail pages provide Back.
- Sidebar/drawer/bottom-sheet transformation: Dashboard is a fixed desktop window with a 14rem sidebar. The current minimum supported content width is 760px.
- Responsive table strategy: Not applicable.
- Truncation/full-value access: Device names preserve full values in the authored Select. Important chat and prompt values open on activation.
- Focus restoration and sticky-obstruction policy: Radix overlays restore focus. Sticky chat input must not cover the final message.

## Overlays and feedback

- Dialog primitive: `src/components/ui/dialog.tsx` based on Radix.
- Destructive confirmation levels: Permanent deletion names the object and consequence, with Cancel as the safe first action.
- Toast placement/duration/deduplication: No canonical toast provider exists. Use inline status near the owning control until one is added.
- Alert/banner scope and persistence: Recoverable errors remain inline until the state changes or retry succeeds.
- Tooltip delay/dismissal: Native title is the current baseline for compact toolbars; richer shared tooltips are a tracked improvement.
- Unsaved-changes behavior: Prompt dialogs preserve entered values after save failure. Navigation-loss protection is a tracked improvement.
- Layer/z-index contract: dialog > floating session inspector > popover > page content.

## Async and resilience

- Mutation default: Pessimistic for provider, prompt, shortcut, and deletion changes.
- Idempotency and duplicate-submit policy: Disable the initiating action while pending.
- Auto-save/draft recovery: Provider and settings changes save locally. Explicit saved/failed status is required when touched.
- Offline/read-stale/write behavior: Local history remains readable. Provider actions surface network failure without clearing input.
- Retry/backoff/timeout behavior: Manual retry from the same preserved state. No unbounded retry.
- Version conflict and multi-tab behavior: Desktop single-user state; storage events synchronize selected settings where implemented.
- Session expiry/re-authentication: Provider-specific and not owned by the app.
- Long-running progress and return path: Transcription and generation use labeled progress in the current session.
- Stale-request cancellation/invalidation and pending-state ownership: Completion requests expose cancellation. Local search has no asynchronous race.
- Dialog/form preservation and retry after mutation failure: Preserve all entered values and keep the dialog open.

## Validation

- Schema/validation layer: Existing page hooks and provider validators.
- Trigger timing: On explicit commit, with immediate clearing when the user edits an invalid field.
- Error summary/inline policy: Text near the field or owning operation, with `role="alert"` for new failures.
- Server error mapping: Provider-safe error text, without keys or request bodies.
- Sensitive-value handling: API keys masked by default and protected with Windows DPAPI. Telemetry excludes secrets and content.
- Product forms own validation, focus the first invalid field when practical, prevent duplicate submits, and preserve recoverable input.

## Permission and clipboard

- Permission UI strategy: Explain missing microphone or screen permission at the action point and provide the recovery action.
- Clipboard copy policy: Copy only visible user-requested response content. Never place secrets in copied diagnostics.
- Disabled-state explanation: Use adjacent text or a tooltip with the concrete reason.

## Migration status

- Migration ledger location: `UX-AUDIT.md`.
- Canonical primitives and owners: Shared Button, Input, Textarea, Select, Dialog, ScrollArea, and PageLayout.
- Current risk-prioritized slices: Listen layout, semantic controls, search recovery, provider readiness, and selector consistency.
- Legacy import/token enforcement: Strict premium static audit.
- Rollout/rollback and removal gates: Build, unit tests, visual state review, then package as a new version.

## Verification

- Required static commands: `npm test`, `npm run build`, strict premium audit, and DESIGN.md lint.
- Browser/device/locale/theme matrix: Desktop Assistant and Dashboard, light/dark, narrow dashboard, reduced motion, empty/no-results/error/open-overlay states.
- Accessibility checks: Keyboard navigation, focus visibility, accessible names, semantic selection, and dialog focus restoration.
- Component-state/visual regression coverage: Manual runtime screenshots until automated visual tests exist.
- Canonical sibling flow used for comparison: System prompt create/edit/delete and conversation list/detail.
- Project audit command/result: Recorded in `premium-audit.json`.
- Failure-path evidence: Existing unit tests plus manual provider/audio diagnostics states.
