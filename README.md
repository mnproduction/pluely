# Pluely Local

A Windows-focused GPL fork of [Pluely](https://github.com/iamsrikanthnani/pluely), based on the public 0.1.9 source at `62aa2d3d0390b832ac8a2b0cc9556fc096e58a98`. Original author: Srikanth Nani. Original GPL-3.0 license and attribution are retained. This fork does not contain the closed-source Pluely v1 implementation.

## Use your xAI key

Open **Dashboard > Configure AI and speech providers**, then:

1. Select **Grok (xAI)**. Enter your xAI API key and a model ID available to your xAI account.
2. Select **xAI Speech to Text**. Enter the same key in the speech provider's API key field. No STT model ID is required.
3. Use the chat, screenshot, microphone, or system-audio controls. Audio is transcribed in recorded segments using `/v1/stt`.

Requests go directly to your selected provider. You pay that provider for API usage. The [xAI STT guide](https://docs.x.ai/developers/model-capabilities/audio/speech-to-text) does not list Ukrainian in its published language list at the time of this review; Ukrainian STT has not been verified. Other STT providers remain configurable.

## Local features

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
cargo test --manifest-path src-tauri/Cargo.toml --lib private_store
npm run tauri build -- --no-bundle
```

For development: `npm run tauri dev`. VAD assets are copied from the installed, locked packages by `scripts/prepare-assets.mjs`; they are not fetched at application startup.

No upstream updater is enabled. Build newer revisions explicitly. Do not treat an arbitrary third-party installer as equivalent to these sources.

## Validation

Automated checks cover native DPAPI round-trip/tampering, failed and successful migration, failed persistence/retry, cross-window storage refresh, Grok text/image request shape, xAI multipart file ordering, HTTPS/loopback enforcement, redirects being disabled, and secret-placeholder isolation. They use synthetic data, never a real API key.

Current validation details and remaining dependency advisories are recorded in `SECURITY-VALIDATION.md`. No live xAI call has been made. These checks are not a certification that the application has no vulnerabilities.
