# Mira Desk

A Windows-focused GPL fork of [Pluely](https://github.com/iamsrikanthnani/pluely), based on the public 0.1.9 source at `62aa2d3d0390b832ac8a2b0cc9556fc096e58a98`. Original author: Srikanth Nani. Original GPL-3.0 license and attribution are retained. This fork does not contain the closed-source Pluely v1 implementation.

Previously named Pluely Local. Version 0.1.12 introduces the Mira Desk name and icon, including window titles, Windows executable metadata, and `MiraDesk.exe`. The app identifier and storage keys remain unchanged, so existing Pluely Local settings, provider keys, and history are retained.

## Use your xAI key

Open **Dashboard > Configure AI and speech providers**, then:

1. Select **Grok (xAI)**. Enter your xAI API key and a model ID available to your xAI account.
2. Select **xAI Speech to Text**. Enter the same key in the speech provider's API key field. No STT model ID is required.
3. Use the chat, screenshot, microphone, or system-audio controls. Audio is transcribed in recorded segments using `/v1/stt`.

Requests go directly to your selected provider. You pay that provider for API usage. The [xAI STT guide](https://docs.x.ai/developers/model-capabilities/audio/speech-to-text) does not list Ukrainian in its published language list at the time of this review; Ukrainian STT has not been verified. Other STT providers remain configurable.

## Local features

Version 0.1.17 keeps completed System Audio transcripts and LLM answers visible after capture is stopped. The diagnostic gateway also retains the last 100 changes to panel/pipeline state, so a later snapshot can explain when a result was shown or cleared.

Version 0.1.16 extends local diagnostics to the STT-to-LLM pipeline: panel state and heartbeat, configured-provider flags, request stages, HTTP/error categories, model families, time to first text, response character/chunk counts, cancellation and timeouts. No conversation content or credentials are included. Empty LLM responses and streaming errors now display an error; final SSE events without a trailing newline are retained. System Audio passes cancellation to the provider and distinguishes transcription from answer generation. LLM requests have a 120-second deadline.

Version 0.1.15 replaces the toolbar's simulated waveform with real native output levels. A silent or stopped capture shows zero; the microphone recorder still measures its actual microphone stream. STT timeouts now abort the underlying HTTP request.

For live troubleshooting, use **System Audio > Enable diagnostics**, or launch `MiraDesk.exe --diagnostics`. This opt-in, read-only gateway binds to a random port on `127.0.0.1` and expires after 30 minutes. It reports the actual capture device, sample counts, RMS/peak, VAD state, emitted segments, and categorized STT results. It does not expose audio, transcripts, API keys, editable provider URLs, raw error messages, or remote control commands. **Stop diagnostics** closes it immediately; normal app exit removes its connection descriptor.

Run `pwsh -NoProfile -File scripts/Read-MiraDiagnostics.ps1` to read the current snapshot, or add `-Seconds 20` for a bounded live sample. The helper reads only `%LOCALAPPDATA%\com.mnproduction.pluely.local\diagnostics-gateway.json`; its connection token is encrypted with Windows DPAPI. It connects directly without a proxy or redirects. The gateway requires the token, rejects browser-origin requests, and returns a bounded metadata schema. Other processes running as the same Windows account can use this diagnostic session while it is enabled.

Version 0.1.14 adds a live System Audio input meter and the name of the output selected when capture started. Match that output to your meeting's Speakers setting; headsets with separate Chat and Game endpoints expose different devices. If you change the selected output during capture, stop and restart System Audio to use it. Auto-detect sensitivity changes now restart capture with the updated settings. Use **Settings > Quiet calls** for low-volume output, or **Manual > Start Recording > Stop & Send** to test transcription without voice-activity detection. Empty STT results show a diagnostic instead of sending the words "No transcription found" to the answer model.

Version 0.1.13 extends **Hide Icon from Dock/Taskbar** on Windows to use [native utility windows](https://learn.microsoft.com/en-us/windows/win32/winmsg/extended-window-styles) (`WS_EX_TOOLWINDOW`) for both Assistant and Dashboard. The panels stay visible and interactive, while their taskbar and Alt+Tab entries are suppressed. Turning the setting off restores regular application windows. The policy is reapplied after reopening, resizing, maximizing/restoring, and changing Always on Top. Open Dashboard from the panel or by launching the executable again when its taskbar entry is hidden.

This mode does not remove a process from Task Manager. Windows decides whether it groups the running application under Apps or Background processes; that grouping is not guaranteed by the documented window-style API and still needs a manual check on the target Windows version.

Version 0.1.12 permits one instance per app identifier. Launching the executable again opens the existing Dashboard, even when the second copy has a different filename. Older builds without this guard can still run alongside it. Before switching from Pluely Local, use **Quit Pluely Local** in each running older build; the Dashboard's close button only hides its window. The new build has **Quit Mira Desk** in the sidebar.

On Windows, the native application uses Microsoft WebView2 to render its interface. WebView2 creates browser, renderer, GPU, and utility processes; other applications can also use it. These are normal runtime processes, described in [Microsoft's process model](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model). Changing this app's name or taskbar visibility does not hide running processes from Task Manager, and Microsoft runtime executables retain their own names.

Version 0.1.11 makes **Hide Icon from Dock/Taskbar** apply to both AI Assistant and Dashboard. Turning the switch on hides their taskbar entries. The preference is retained on startup and when windows are reopened; capture overlays always stay outside the taskbar. Hidden windows are not added to the taskbar when icon visibility is enabled.

Version 0.1.10 fixes switching from Auto-detect to Manual recording, duplicate starts, and restarting after Discard or Stop & Send. On Windows, idle loopback audio no longer leaves capture stuck, and unavailable output devices produce an initialization error.

The headphones panel records **system output audio** (for example, a call or a video). In Manual mode, click Start Recording, then Stop & Send. Discard stops recording without transcription. Microphone recording is a separate control.

The open-source implementation's themes, transparency, window movement, custom shortcuts, screenshot modes, chat follow-ups and attachments, response length/language, auto-scroll, saved prompts, and audio features are enabled. Generate with AI uses your configured provider.

Pluely's hosted model service, billing, remote prompt catalog, and proprietary v1 features are not included. No license is forged or sent to the upstream service.

## Privacy and security changes

- Removed PostHog, machine-identification telemetry, hosted license/inference commands, and the upstream updater.
- Disabled autostart by default. A separate app identifier keeps this fork's data apart from the original app.
- Updated Tauri beyond the fix for GHSA-7gmj-67g7-phm9 and refreshed dependency lockfiles.
- Enabled CSP. Model-generated external images are replaced with text; links require a click and open in the system browser.
- Provider requests use native HTTP with HTTPS required, except explicitly configured localhost servers. Redirects are disabled. Custom providers still require trusting the endpoint you enter.
- Provider configurations, including keys embedded in custom templates, are encrypted at rest with **Windows DPAPI**. Writes are serialized and replaced atomically; failures are shown with a retry action. Existing provider records in this app's own localStorage are removed only after migration succeeds.
- Expanded configuration placeholders only in the provider template, before inserting chat text and history. A message containing `{{API_KEY}}` cannot substitute the real key into the message body.
- Bundled VAD models, its worklet, and ONNX runtime assets locally.

DPAPI does not protect against another process running as the same Windows user or an attacker reading this app's memory. Provider secrets are present in renderer memory while configuring and sending requests. **Chat history, transcripts, and attached screenshots remain in local SQLite without application encryption.** Delete history from App Settings when appropriate. macOS and Linux secret storage have not been implemented in this fork.

## Build from source

Requires Windows, Rust, MSVC C++ build tools, WebView2, Node.js and npm.

```powershell
npm ci --ignore-scripts
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked --release --lib --features tauri/custom-protocol
npm run tauri build -- --no-bundle
```

For development: `npm run tauri dev`. VAD assets are copied from the installed, locked packages by `scripts/prepare-assets.mjs`; they are not fetched at application startup.

The Windows executable is written to `src-tauri/target/release/MiraDesk.exe`.

No upstream updater is enabled. Build newer revisions explicitly. Do not treat an arbitrary third-party installer as equivalent to these sources.

## Validation

Automated checks cover native DPAPI round-trip/tampering, failed and successful migration, failed persistence/retry, cross-window storage refresh, Grok text/image request shape, xAI multipart file ordering, HTTPS/loopback enforcement, redirects being disabled, and secret-placeholder isolation. They use synthetic data, never a real API key.

Current validation details and remaining dependency advisories are recorded in `SECURITY-VALIDATION.md`. No live xAI call has been made. These checks are not a certification that the application has no vulnerabilities.
