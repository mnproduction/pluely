# Security validation, 2026-09-02

This is a focused Windows review and patch set, not a certification or a complete audit of every dependency.

## Source selection

The reviewed upstream source is `iamsrikanthnani/pluely` at `62aa2d3d0390b832ac8a2b0cc9556fc096e58a98`. Its package and Cargo manifests still describe the GPL 0.1.9 code, although its README advertises the separate closed-source v1 product.

The fork survey collected 525 unique GitHub fork records and sampled up to five security-relevant files from 133 forks that had activity after creation. The 131 available Cargo lockfiles contained Tauri 2.7.0, 2.8.2, 2.9.5, or 2.10.3; none contained the fix for [GHSA-7gmj-67g7-phm9](https://github.com/tauri-apps/tauri/security/advisories/GHSA-7gmj-67g7-phm9). Readable CSP configurations remained disabled. This is a sampling result, not a claim that all forks were fully audited or exploitable.

Closer source inspection included DrewWalkup/nyx, b4sjoo/jarvis, SalosV/pluely, RedBeggins/Freely, Badbird3/pluely-fork, shinramenisbae/pluely, and lambdaflows/freely. Some remove licensing/telemetry, but none of these inspected snapshots fixes the Tauri/CSP baseline. The additional interview, document, or agent functionality would require more review. The minimal upstream base was selected for a controlled patch set.

## Windows utility windows, 0.1.13 (2026-09-03)

- Hide Icon now applies the documented `WS_EX_TOOLWINDOW` style and clears `WS_EX_APPWINDOW` on this application's Assistant and Dashboard windows. Disabling it restores regular app-window styles. Other extended styles are preserved. No other application's windows or process enumeration are modified.
- Tauri/Tao's taskbar API only calls `ITaskbarList::DeleteTab`; it does not set utility-window styles. An initial native runtime check also reproduced Tao overwriting a manually set utility style during its own show/hide transitions. The final implementation uses a temporary native hide/change/show cycle, repairs styles after reopening and resize events, and reapplies the policy after Always on Top changes. Failed changes restore the prior policy and attempt to restore both windows.
- All 30 frontend tests pass. The isolated Windows release build passed 14 native runtime checks: baseline, enabling, repeated enabling, Dashboard opening, Always on Top, panel resizing/restoring, Dashboard maximizing/restoring, Dashboard hiding/reopening, disabling, reenabling, and text input. Checks used `com.mnproduction.pluely.utility-test`, an empty test profile, and a separate executable.
- The tests verified that the Assistant stayed visible, a hidden Dashboard stayed hidden when the setting changed, visible app windows had the intended native style flags, other styles and the panel bounds were preserved, and Always on Top survived subsequent transitions. Synthetic text was typed and cleared without submitting it. A captured WebView image confirmed the rendered panel and input remained intact. Normal Quit completed after the checks.
- Microsoft documents exclusion from the taskbar and Alt+Tab for utility windows. Task Manager's Apps versus Background processes grouping is not an API guarantee. The Task Manager accessibility tree did not expose its process groups on the review machine, so that grouping remains a manual verification item. Earlier Computer Use capture also failed with `SetIsBorderRequired failed (0x80004002)`.
- The final executable uses the unchanged production identifier and data paths. Existing user keys and history were not inspected or changed, and running production instances were left untouched during these checks.

## Mira Desk branding and single instance, 0.1.12 (2026-09-03)

- The application name, native icons, window titles, frontend branding, and Windows executable target are now Mira Desk / `MiraDesk.exe`. GPL attribution and the production identifier `com.mnproduction.pluely.local` are retained. No provider storage or history migration is needed for the rename.
- The official `tauri-plugin-single-instance` 2.4.4 is registered before the other plugins. Its Windows implementation uses the app identifier for the instance guard, independently of the executable filename. The callback opens the existing Dashboard through the normal window visibility helpers.
- All 30 frontend tests and the production TypeScript/Vite and native Windows release builds pass.
- An executable built with the isolated identifier `com.mnproduction.pluely.single-instance-test` passed runtime checks for the Mira Desk document title, Dashboard native title, loaded SVG icon, Quit label, and native version 0.1.12. No production provider records or chat content were accessed.
- Launching the same test executable twice kept the original process alive, exited the second process with code 0, and made the existing hidden Dashboard visible. Repeating with an executable copy under a different filename produced the same result. Normal Quit released the guard, and a fresh launch and second Quit succeeded.
- The final production executable was rebuilt without the test configuration. Its Windows ProductName and FileDescription are `Mira Desk`, FileVersion is 0.1.12, and it embeds the production identifier and Assistant title, not the isolated test values.
- Older Pluely Local builds and the original application do not implement this instance guard and must be fully quit separately. Their running processes were left untouched during validation. WebView2 runtime processes remain visible with Microsoft's executable names. The full Task Manager presentation was not visually verified; the runtime checks above verify app metadata and rendered branding.

## App icon fix validation, 0.1.11 (2026-09-03)

- Reproduced five failing frontend cases before the fix: the saved hidden preference was briefly replaced by the default at startup, the switch was inverted relative to its Hide label, a show event forced visibility on, a new Dashboard mount repeated the startup override, and failed native updates were saved as though they succeeded.
- All 30 frontend tests pass, including six app icon checks for those cases and cross-window settings synchronization. The production TypeScript/Vite and native Windows release builds pass.
- Native code applies the setting to both main and Dashboard, preserves it for newly created windows, reapplies it after showing windows, and avoids adding hidden windows or capture overlays to the taskbar.
- A separate executable using the isolated identifier `com.mnproduction.pluely.icon-test` started successfully and exposed its toolbar to Windows accessibility inspection. Full taskbar visual verification was not completed: Computer Use returned `SetIsBorderRequired failed (0x80004002)` for screenshots and `coordinate input geometry is unavailable` for input. This remains a manual UI verification limitation.
- Existing user app data and provider keys were not inspected or changed during verification. The delivered build retains the production app identifier.

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
