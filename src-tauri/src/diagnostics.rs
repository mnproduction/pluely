//! Opt-in, read-only loopback diagnostics. This schema cannot hold audio,
//! transcripts, provider templates, credentials, or arbitrary error messages.
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use std::{
    collections::VecDeque,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    task::JoinSet,
};
use uuid::Uuid;

pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone, Default, Serialize)]
pub struct CaptureInfo {
    pub active: bool,
    pub device_name: String,
    pub sample_rate: u32,
    pub config: Option<crate::speaker::VadConfig>,
    pub samples_received: u64,
    pub last_level_at_ms: u64,
    pub rms: f64,
    pub peak: f32,
    pub speech_active: bool,
    pub speech_chunks: usize,
    pub silence_chunks: usize,
    pub segments_emitted: u64,
    pub segments_discarded: u64,
    pub last_segment_duration_ms: u64,
}

#[derive(Clone, Serialize)]
struct Event {
    at_ms: u64,
    kind: &'static str,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    Openai,
    Xai,
    Groq,
    Google,
    Deepgram,
    Elevenlabs,
    Custom,
    Unconfigured,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ModelKind {
    Whisper1,
    Gpt4oTranscribe,
    Gpt4oMiniTranscribe,
    WhisperLargeV3,
    WhisperLargeV3Turbo,
    Custom,
    Unset,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SttStage {
    Sending,
    Succeeded,
    Empty,
    HttpError,
    NetworkError,
    InvalidConfig,
    DecodeError,
    TimedOut,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorKind {
    Unauthorized,
    Quota,
    RateLimit,
    Model,
    BadRequest,
    Server,
    Network,
    Unknown,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudioSource {
    System,
    Microphone,
    Other,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LlmStage {
    Preparing,
    Sending,
    Streaming,
    Succeeded,
    Empty,
    HttpError,
    NetworkError,
    InvalidConfig,
    DecodeError,
    TimedOut,
    Cancelled,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LlmModelKind {
    Grok,
    Gpt,
    Claude,
    Gemini,
    Other,
    Unset,
}

#[derive(Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConfigField {
    Provider,
    ApiKey,
    Model,
    Other,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LlmUpdate {
    request_id: Uuid,
    stage: LlmStage,
    provider: ProviderKind,
    model: LlmModelKind,
    source: AudioSource,
    duration_ms: u64,
    first_text_ms: Option<u64>,
    response_chars: u64,
    chunks: u64,
    http_status: Option<u16>,
    error_kind: Option<ErrorKind>,
    missing: Option<ConfigField>,
}

#[derive(Clone, Serialize)]
struct LlmRecord {
    updated_at_ms: u64,
    #[serde(flatten)]
    update: LlmUpdate,
}

#[derive(Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PipelineInfo {
    panel_open: bool,
    capture_enabled: bool,
    capture_active: bool,
    system_capture_active: bool,
    microphone_capture_active: bool,
    microphone_speaking: bool,
    microphone_rms: f64,
    microphone_peak: f64,
    microphone_stream_active: bool,
    microphone_track_live: bool,
    microphone_track_muted: bool,
    microphone_track_enabled: bool,
    microphone_samples_received: u64,
    microphone_last_frame_at_ms: u64,
    microphone_sample_rate: u32,
    microphone_channel_count: u32,
    microphone_device_selection: MicrophoneDeviceSelection,
    microphone_audio_processor: MicrophoneAudioProcessor,
    paused: bool,
    recording: bool,
    transcribing: bool,
    generating: bool,
    response_queued: bool,
    stt_configured: bool,
    ai_configured: bool,
    transcript_chars: u64,
    transcript_turns: u64,
    system_turns: u64,
    microphone_turns: u64,
    response_chars: u64,
    has_error: bool,
    auto_response_mode: AutoResponseMode,
}

#[derive(Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum MicrophoneDeviceSelection {
    #[default]
    Unavailable,
    BrowserId,
    Label,
    Default,
    Fallback,
}

#[derive(Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum MicrophoneAudioProcessor {
    #[default]
    Unavailable,
    ScriptProcessor,
    AudioWorklet,
}

#[derive(Clone, Copy, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
enum AutoResponseMode {
    #[default]
    Questions,
    Pause,
    Off,
}

#[derive(Clone, Serialize)]
struct PipelineRecord {
    updated_at_ms: u64,
    #[serde(flatten)]
    update: PipelineInfo,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SttUpdate {
    request_id: Uuid,
    stage: SttStage,
    provider: ProviderKind,
    model: ModelKind,
    source: AudioSource,
    audio_bytes: u64,
    duration_ms: u64,
    http_status: Option<u16>,
    transcript_chars: Option<u64>,
    error_kind: Option<ErrorKind>,
}

#[derive(Clone, Serialize)]
struct SttRecord {
    updated_at_ms: u64,
    #[serde(flatten)]
    update: SttUpdate,
}

#[derive(Clone, Serialize)]
struct Snapshot {
    schema: u32,
    version: &'static str,
    pid: u32,
    at_ms: u64,
    capture: CaptureInfo,
    requests: VecDeque<SttRecord>,
    llm_requests: VecDeque<LlmRecord>,
    pipeline: PipelineInfo,
    pipeline_updated_at_ms: u64,
    pipeline_history: VecDeque<PipelineRecord>,
    events: VecDeque<Event>,
}

impl Default for Snapshot {
    fn default() -> Self {
        Self {
            schema: 3,
            version: env!("CARGO_PKG_VERSION"),
            pid: std::process::id(),
            at_ms: now_ms(),
            capture: CaptureInfo::default(),
            requests: VecDeque::new(),
            llm_requests: VecDeque::new(),
            pipeline: PipelineInfo::default(),
            pipeline_updated_at_ms: 0,
            pipeline_history: VecDeque::new(),
            events: VecDeque::new(),
        }
    }
}

#[derive(Serialize, Deserialize)]
struct ConnectionFile {
    schema: u32,
    pid: u32,
    version: String,
    address: String,
    expires_at_ms: u64,
    token_dpapi: String,
}

struct Session {
    task: tauri::async_runtime::JoinHandle<()>,
    expires_at_ms: u64,
    path: PathBuf,
}

impl Drop for Session {
    fn drop(&mut self) {
        self.task.abort();
    }
}

#[derive(Default, Clone)]
pub struct Diagnostics {
    snapshot: Arc<Mutex<Snapshot>>,
    session: Arc<Mutex<Option<Session>>>,
}

#[derive(Serialize)]
pub struct GatewayStatus {
    enabled: bool,
    expires_at_ms: Option<u64>,
}

impl Diagnostics {
    pub fn is_enabled(&self) -> bool {
        let session = self.session.lock().unwrap_or_else(|p| p.into_inner());
        session
            .as_ref()
            .is_some_and(|s| !s.task.inner().is_finished() && s.expires_at_ms > now_ms())
    }

    pub fn capture(&self, update: impl FnOnce(&mut CaptureInfo)) {
        if let Ok(mut state) = self.snapshot.lock() {
            update(&mut state.capture);
            state.at_ms = now_ms();
        }
    }

    pub fn event(&self, kind: &'static str) {
        if let Ok(mut state) = self.snapshot.lock() {
            state.events.push_back(Event {
                at_ms: now_ms(),
                kind,
            });
            while state.events.len() > 100 {
                state.events.pop_front();
            }
            state.at_ms = now_ms();
        }
    }

    fn record_stt(&self, update: SttUpdate) {
        if let Ok(mut state) = self.snapshot.lock() {
            // UUID identity lets concurrent requests finish in either order.
            state
                .requests
                .retain(|r| r.update.request_id != update.request_id);
            state.requests.push_back(SttRecord {
                updated_at_ms: now_ms(),
                update,
            });
            while state.requests.len() > 32 {
                state.requests.pop_front();
            }
            state.at_ms = now_ms();
        }
    }

    fn record_llm(&self, update: LlmUpdate) {
        if let Ok(mut state) = self.snapshot.lock() {
            state
                .llm_requests
                .retain(|r| r.update.request_id != update.request_id);
            state.llm_requests.push_back(LlmRecord {
                updated_at_ms: now_ms(),
                update,
            });
            while state.llm_requests.len() > 32 {
                state.llm_requests.pop_front();
            }
            state.at_ms = now_ms();
        }
    }

    fn record_pipeline(&self, update: PipelineInfo) {
        if let Ok(mut snapshot) = self.snapshot.lock() {
            if snapshot.pipeline != update {
                snapshot.pipeline_history.push_back(PipelineRecord {
                    updated_at_ms: now_ms(),
                    update: update.clone(),
                });
                while snapshot.pipeline_history.len() > 100 {
                    snapshot.pipeline_history.pop_front();
                }
            }
            snapshot.pipeline = update;
            snapshot.pipeline_updated_at_ms = now_ms();
        }
    }

    pub fn status(&self) -> GatewayStatus {
        let session = self.session.lock().unwrap_or_else(|p| p.into_inner());
        GatewayStatus {
            enabled: session
                .as_ref()
                .is_some_and(|s| !s.task.inner().is_finished() && s.expires_at_ms > now_ms()),
            expires_at_ms: session.as_ref().map(|s| s.expires_at_ms),
        }
    }

    pub fn stop(&self) {
        if let Some(session) = self
            .session
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .take()
        {
            // Remove only this gateway's fixed connection descriptor, never a user-selected file.
            let _ = fs::remove_file(&session.path);
            drop(session);
        }
    }

    pub fn start(&self, directory: PathBuf) -> Result<GatewayStatus, String> {
        self.start_for(directory, Duration::from_secs(30 * 60))
    }

    fn start_for(&self, directory: PathBuf, duration: Duration) -> Result<GatewayStatus, String> {
        let mut session = self
            .session
            .lock()
            .map_err(|_| "Diagnostics state unavailable")?;
        if session
            .as_ref()
            .is_some_and(|s| !s.task.inner().is_finished() && s.expires_at_ms > now_ms())
        {
            return Ok(GatewayStatus {
                enabled: true,
                expires_at_ms: session.as_ref().map(|s| s.expires_at_ms),
            });
        }
        if let Some(previous) = session.take() {
            drop(previous);
        }
        let listener = std::net::TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .map_err(|_| "Cannot open the local diagnostics listener")?;
        listener
            .set_nonblocking(true)
            .map_err(|_| "Cannot configure diagnostics listener")?;
        let address = listener
            .local_addr()
            .map_err(|_| "Cannot read diagnostics address")?
            .to_string();
        let token = format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple());
        let token_dpapi = B64.encode(crate::private_store::protect(token.as_bytes(), true)?);
        let expires_at_ms = now_ms() + duration.as_millis() as u64;
        let connection = ConnectionFile {
            schema: 1,
            pid: std::process::id(),
            version: env!("CARGO_PKG_VERSION").into(),
            address: address.clone(),
            expires_at_ms,
            token_dpapi,
        };
        fs::create_dir_all(&directory).map_err(|_| "Cannot create diagnostics directory")?;
        let path = directory.join("diagnostics-gateway.json");
        fs::write(
            &path,
            serde_json::to_vec(&connection).map_err(|_| "Cannot encode diagnostics connection")?,
        )
        .map_err(|_| "Cannot write diagnostics connection")?;
        let snapshot = self.snapshot.clone();
        let task = tauri::async_runtime::spawn(async move {
            let Ok(listener) = TcpListener::from_std(listener) else {
                return;
            };
            let deadline = tokio::time::sleep(duration);
            tokio::pin!(deadline);
            let mut clients = JoinSet::new();
            loop {
                tokio::select! {
                    _ = &mut deadline => break,
                    _ = clients.join_next(), if !clients.is_empty() => {},
                    accepted = listener.accept() => {
                        let Ok((client, peer)) = accepted else { break; };
                        if !peer.ip().is_loopback() || clients.len() >= 4 { continue; }
                        let snapshot = snapshot.clone();
                        let token = token.clone();
                        let address = address.clone();
                        clients.spawn(async move {
                            let _ = tokio::time::timeout(Duration::from_secs(2), serve(client, &address, &token, snapshot)).await;
                        });
                    }
                }
            }
            // JoinSet drop cancels clients on stop/expiry. No control API exists.
        });
        *session = Some(Session {
            task,
            expires_at_ms,
            path,
        });
        Ok(GatewayStatus {
            enabled: true,
            expires_at_ms: Some(expires_at_ms),
        })
    }
}

fn authorized(request: &str, address: &str, token: &str) -> bool {
    let mut lines = request.split("\r\n");
    if lines.next() != Some("GET /v1/diagnostics HTTP/1.1") {
        return false;
    }
    let mut host = None;
    let mut authorization = None;
    for line in lines {
        if line.is_empty() {
            break;
        }
        let Some((name, value)) = line.split_once(':') else {
            return false;
        };
        let value = value.trim();
        match name.to_ascii_lowercase().as_str() {
            "origin" | "transfer-encoding" => return false,
            "content-length" if value != "0" => return false,
            "host" => {
                if host.replace(value).is_some() {
                    return false;
                }
            }
            "authorization" => {
                if authorization.replace(value).is_some() {
                    return false;
                }
            }
            _ => {}
        }
    }
    let expected = format!("Bearer {token}");
    let actual = authorization.unwrap_or("");
    host == Some(address)
        && actual.len() == expected.len()
        && actual
            .bytes()
            .zip(expected.bytes())
            .fold(0_u8, |diff, (a, b)| diff | (a ^ b))
            == 0
}

async fn serve(
    mut client: TcpStream,
    address: &str,
    token: &str,
    snapshot: Arc<Mutex<Snapshot>>,
) -> std::io::Result<()> {
    let mut request = Vec::new();
    let mut chunk = [0_u8; 1024];
    while !request.windows(4).any(|b| b == b"\r\n\r\n") {
        let read = client.read(&mut chunk).await?;
        if read == 0 {
            return Ok(());
        }
        request.extend_from_slice(&chunk[..read]);
        if request.len() > 8192 {
            return Ok(());
        }
    }
    let allowed = std::str::from_utf8(&request).is_ok_and(|r| authorized(r, address, token));
    let (status, body) = if allowed {
        let mut current = snapshot.lock().unwrap_or_else(|p| p.into_inner()).clone();
        current.at_ms = now_ms();
        (
            "200 OK",
            serde_json::to_string(&current).unwrap_or_else(|_| "{}".into()),
        )
    } else {
        ("403 Forbidden", "{\"error\":\"forbidden\"}".into())
    };
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{body}", body.len());
    client.write_all(response.as_bytes()).await?;
    client.shutdown().await
}

fn check_window(window: &WebviewWindow) -> Result<(), String> {
    if matches!(window.label(), "main" | "dashboard") {
        Ok(())
    } else {
        Err("Diagnostics are unavailable in this window".into())
    }
}

pub fn start_for_app(app: &AppHandle) -> Result<GatewayStatus, String> {
    let directory = app
        .path()
        .app_local_data_dir()
        .map_err(|_| "Missing local app data directory")?;
    let status = app.state::<Diagnostics>().start(directory)?;
    crate::window::sync_capture_protection(app)
        .map_err(|error| format!("Cannot update capture visibility: {error}"))?;

    if let Some(expires_at_ms) = status.expires_at_ms {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let remaining_ms = expires_at_ms.saturating_sub(now_ms()).saturating_add(50);
            tokio::time::sleep(Duration::from_millis(remaining_ms)).await;
            if !app.state::<Diagnostics>().is_enabled() {
                if let Err(error) = crate::window::sync_capture_protection(&app) {
                    eprintln!("Cannot restore capture protection: {error}");
                }
            }
        });
    }

    Ok(status)
}

#[tauri::command]
pub fn diagnostics_start(app: AppHandle, window: WebviewWindow) -> Result<GatewayStatus, String> {
    check_window(&window)?;
    start_for_app(&app)
}

#[tauri::command]
pub fn diagnostics_stop(
    app: AppHandle,
    window: WebviewWindow,
    state: State<Diagnostics>,
) -> Result<(), String> {
    check_window(&window)?;
    state.stop();
    crate::window::sync_capture_protection(&app)
        .map_err(|error| format!("Cannot restore capture protection: {error}"))
}

#[tauri::command]
pub fn diagnostics_status(
    window: WebviewWindow,
    state: State<Diagnostics>,
) -> Result<GatewayStatus, String> {
    check_window(&window)?;
    Ok(state.status())
}

#[tauri::command]
pub fn diagnostics_record_stt(
    window: WebviewWindow,
    state: State<Diagnostics>,
    update: SttUpdate,
) -> Result<(), String> {
    check_window(&window)?;
    state.record_stt(update);
    Ok(())
}

#[tauri::command]
pub fn diagnostics_record_llm(
    window: WebviewWindow,
    state: State<Diagnostics>,
    update: LlmUpdate,
) -> Result<(), String> {
    check_window(&window)?;
    state.record_llm(update);
    Ok(())
}

#[tauri::command]
pub fn diagnostics_record_pipeline(
    window: WebviewWindow,
    state: State<Diagnostics>,
    update: PipelineInfo,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Pipeline diagnostics require the assistant window".into());
    }
    state.record_pipeline(update);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_browser_cross_origin_and_control_requests() {
        let valid = "GET /v1/diagnostics HTTP/1.1\r\nHost: 127.0.0.1:3333\r\nAuthorization: Bearer secret\r\n\r\n";
        assert!(authorized(valid, "127.0.0.1:3333", "secret"));
        for invalid in [
            valid.replace("secret", "wrong!"),
            valid.replace("127.0.0.1:3333", "evil.test:3333"),
            valid.replace("GET", "POST"),
            valid.replace("/v1/diagnostics", "/invoke/exit_app"),
            valid.replace("\r\n\r\n", "\r\nOrigin: http://evil.test\r\n\r\n"),
        ] {
            assert!(!authorized(&invalid, "127.0.0.1:3333", "secret"));
        }
    }

    #[test]
    fn diagnostic_schema_rejects_arbitrary_text_and_is_bounded() {
        let diag = Diagnostics::default();
        for _ in 0..500 {
            diag.event("speech_started");
        }
        assert_eq!(diag.snapshot.lock().unwrap().events.len(), 100);
        let value = serde_json::json!({
            "request_id":Uuid::new_v4(),"stage":"http_error","provider":"openai","model":"whisper1",
            "source":"system","audio_bytes":100,"duration_ms":20,"http_status":401,
            "transcript_chars":null,"error_kind":"unauthorized","message":"secret-key-must-not-be-accepted"
        });
        assert!(serde_json::from_value::<SttUpdate>(value).is_err());
        assert!(!serde_json::to_string(&*diag.snapshot.lock().unwrap())
            .unwrap()
            .contains("secret-key"));
    }

    #[cfg(windows)]
    #[tokio::test]
    async fn loopback_gateway_authenticates_rotates_and_stops() {
        let diag = Diagnostics::default();
        let directory = std::env::temp_dir().join(format!("mira-gateway-test-{}", Uuid::new_v4()));
        diag.start(directory.clone()).unwrap();
        let path = directory.join("diagnostics-gateway.json");
        let descriptor: ConnectionFile = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert!(descriptor.address.starts_with("127.0.0.1:"));
        let token = String::from_utf8(
            crate::private_store::protect(&B64.decode(&descriptor.token_dpapi).unwrap(), false)
                .unwrap(),
        )
        .unwrap();
        assert!(!fs::read_to_string(&path).unwrap().contains(&token));
        let mut client = TcpStream::connect(&descriptor.address).await.unwrap();
        client.write_all(format!("GET /v1/diagnostics HTTP/1.1\r\nHost: {}\r\nAuthorization: Bearer {token}\r\n\r\n",descriptor.address).as_bytes()).await.unwrap();
        let mut response = String::new();
        client.read_to_string(&mut response).await.unwrap();
        assert!(response.starts_with("HTTP/1.1 200"));
        assert!(!response.contains(&token));
        diag.stop();
        assert!(!path.exists());
        assert!(!diag.status().enabled);
        diag.start_for(directory.clone(), Duration::from_millis(50))
            .unwrap();
        let next: ConnectionFile = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        assert_ne!(descriptor.token_dpapi, next.token_dpapi);
        tokio::time::sleep(Duration::from_millis(150)).await;
        assert!(!diag.status().enabled);
        assert!(TcpStream::connect(&next.address).await.is_err());
        diag.stop();
        fs::remove_dir(&directory).unwrap();
    }

    #[test]
    fn llm_schema_excludes_content_and_bounds_request_history() {
        let diag = Diagnostics::default();
        let value = serde_json::json!({
            "request_id":Uuid::new_v4(),"stage":"succeeded","provider":"xai","model":"grok",
            "source":"system","duration_ms":500,"first_text_ms":250,"response_chars":25,
            "chunks":2,"http_status":200,"error_kind":null,"missing":null
        });
        for _ in 0..50 {
            let mut update: LlmUpdate = serde_json::from_value(value.clone()).unwrap();
            update.request_id = Uuid::new_v4();
            diag.record_llm(update);
        }
        assert_eq!(diag.snapshot.lock().unwrap().llm_requests.len(), 32);
        let mut forbidden = value;
        forbidden["prompt"] = "private conversation".into();
        assert!(serde_json::from_value::<LlmUpdate>(forbidden).is_err());
        assert!(serde_json::from_value::<PipelineInfo>(
            serde_json::json!({"response":"private text"})
        )
        .is_err());
        let pipeline = serde_json::to_value(PipelineInfo::default()).unwrap();
        assert!(pipeline.get("microphone_capture_active").is_some());
        assert!(pipeline.get("microphone_samples_received").is_some());
        assert!(pipeline.get("microphone_device_selection").is_some());
        assert!(pipeline.get("system_turns").is_some());
        assert!(pipeline.get("transcript_text").is_none());
        assert_eq!(diag.snapshot.lock().unwrap().schema, 3);
        for index in 0..500 {
            diag.record_pipeline(PipelineInfo {
                panel_open: index % 2 == 0,
                ..Default::default()
            });
        }
        assert_eq!(diag.snapshot.lock().unwrap().pipeline_history.len(), 100);
    }
}
