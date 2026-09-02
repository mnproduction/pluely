# Security validation, 2026-09-02

This is a focused Windows review and patch set, not a certification or a complete audit of every dependency.

## Source selection

The reviewed upstream source is `iamsrikanthnani/pluely` at `62aa2d3d0390b832ac8a2b0cc9556fc096e58a98`. Its package and Cargo manifests still describe the GPL 0.1.9 code, although its README advertises the separate closed-source v1 product.

The fork survey collected 525 unique GitHub fork records and sampled up to five security-relevant files from 133 forks that had activity after creation. The 131 available Cargo lockfiles contained Tauri 2.7.0, 2.8.2, 2.9.5, or 2.10.3; none contained the fix for [GHSA-7gmj-67g7-phm9](https://github.com/tauri-apps/tauri/security/advisories/GHSA-7gmj-67g7-phm9). Readable CSP configurations remained disabled. This is a sampling result, not a claim that all forks were fully audited or exploitable.

Closer source inspection included DrewWalkup/nyx, b4sjoo/jarvis, SalosV/pluely, RedBeggins/Freely, Badbird3/pluely-fork, shinramenisbae/pluely, and lambdaflows/freely. Some remove licensing/telemetry, but none of these inspected snapshots fixes the Tauri/CSP baseline. The additional interview, document, or agent functionality would require more review. The minimal upstream base was selected for a controlled patch set.

## Recording fix validation, 0.1.10

- Reproduced the reported Auto-detect to Manual failure with a React hook test before fixing it. The old hook left native capture running while displaying Start Recording.
- 24 frontend tests pass, including eight recording lifecycle checks: mode switching, duplicate starts, discard/restart, manual-to-auto switching, retry after device failure, empty audio, keyboard focus, and event-listener cleanup.
- Six default native release tests pass, including three new session lifecycle tests for cancellation cleanup, manual stop, and natural completion.
- Two additional Windows hardware tests were explicitly enabled and passed: loopback capture remained active for 3.5 seconds and was discarded/restarted twice; an unavailable device returned an initialization error. Captured samples were discarded in memory, without transcription, storage, or network requests.
- Native start/stop commands share a mutex through teardown. Manual stop uses a session-specific signal and waits for completion. The time limit and progress reporting also work while the output is idle. Windows initializes COM on its capture thread and no longer hides initialization errors behind a fabricated sample rate.
- Existing provider settings and chat databases were not inspected or reset. No live xAI call was used for these checks.

## Initial 0.1.9 verified checks

- Frontend TypeScript and Vite production build pass.
- 16 Vitest checks pass, using synthetic credentials. They exercise xAI chat/image streaming, xAI STT multipart ordering, provider URL validation, redirect configuration, literal secret placeholders in chat text, storage migration, failed writes/retry, and cross-window updates.
- Three native Rust tests pass in the Windows release profile: DPAPI round-trip and tamper rejection, storage key restrictions, and the maximum accepted payload remaining decryptable after DPAPI overhead.
- `npm audit` reports zero known vulnerabilities after compatible dependency updates. Dependency installation and audit were performed with lifecycle scripts disabled.
- Tauri is locked to 2.11.5. The refreshed Rust lockfile was queried against OSV. Matches in the Windows normal/build dependency graph are six unmaintained-package notices: `paste` and five `unic-*` crates. No other active vulnerability advisory in that query matched the Windows dependency graph. Maintenance notices remain unresolved.
- The complete cross-platform lockfile still contains GTK/glib and RSA advisories. GTK/glib and RSA are not in the selected Windows normal/build dependency graph, as checked with `cargo tree --locked --target x86_64-pc-windows-msvc -e normal,build`. This does not establish safety of a Linux or macOS build.
- A native WebView smoke check opens Dashboard and Dev Space, reads the native app version and empty provider store, finds no provider records in localStorage, and observes CSP blocking an external image via an `img-src` violation.
- Native HTTP integration against a temporary loopback server passes: multipart STT upload, streaming response reads, no redirect to a second endpoint, rejection of external plain HTTP, audio file last in multipart, and synthetic Authorization delivery. The JavaScript HTTP plugin is pinned to 2.6.0 to match the Rust implementation; the inherited JS 2.5.2 streaming protocol is incompatible with Rust 2.6.0.
- SQL files have enforced LF endings because embedded migration checksums depend on their exact bytes. Only the empty database created during this task's smoke test was backed up after detecting the CRLF/LF mismatch; existing upstream app data was not touched.

## Limits and remaining risks

No real xAI API key was used, so account access, billing, model availability, transcription quality, and live xAI responses remain unverified. xAI REST STT is used for recorded segments. Ukrainian is not listed in the reviewed xAI STT guide.

No microphone/system-audio capture or screenshot of user content was sent to any provider during validation. Audio-device behavior and the quality of generated answers require a user session with the desired device and account. Several default shortcuts were already occupied on the review machine; they can be changed in Cursor & Shortcuts.

Provider secrets are encrypted on disk with Windows DPAPI but remain available in renderer memory during normal operation. Processes running with the same Windows account can generally access DPAPI-protected data for that account. The HTTP plugin retains HTTPS access for user-configured providers and loopback access for local models. Custom endpoints therefore remain a trust decision.

Chat history, transcripts, and attached screenshots are stored in local SQLite without application-level encryption. Remote Markdown images are blocked; clicked external links still navigate the user's system browser. No upstream update channel is configured. A source build is not a signed or independently attested release.
