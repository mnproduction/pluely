// Pluely windows speaker input and stream
use super::AudioDevice;
use anyhow::Result;
use futures_util::Stream;
use std::collections::VecDeque;
use std::sync::{mpsc, Arc, Mutex};
use std::task::{Poll, Waker};
use std::thread;
use std::time::Duration;
use tracing::error;
use wasapi::{
    get_default_device, DeviceCollection, Direction, SampleType, StreamMode, WasapiError,
    WaveFormat,
};

struct CaptureThreadCleanup(Arc<Mutex<WakerState>>);
impl Drop for CaptureThreadCleanup {
    fn drop(&mut self) {
        let mut state = self.0.lock().unwrap();
        state.shutdown = true;
        if let Some(waker) = state.waker.take() {
            drop(state);
            waker.wake();
        }
    }
}

struct ComApartment;
impl Drop for ComApartment {
    fn drop(&mut self) {
        wasapi::deinitialize();
    }
}

pub fn get_input_devices() -> Result<Vec<AudioDevice>> {
    let mut devices = Vec::new();

    let default_device = get_default_device(&Direction::Capture).ok();
    let default_id = default_device.as_ref().and_then(|d| d.get_id().ok());

    let collection = DeviceCollection::new(&Direction::Capture)?;
    let count = collection.get_nbr_devices()?;

    for i in 0..count {
        if let Ok(device) = collection.get_device_at_index(i) {
            let name = device
                .get_friendlyname()
                .unwrap_or_else(|_| format!("Microphone {}", i));
            let id = device
                .get_id()
                .unwrap_or_else(|_| format!("windows_input_{}", i));
            let is_default = default_id.as_ref().map(|def| def == &id).unwrap_or(false);

            devices.push(AudioDevice {
                id,
                name,
                is_default,
            });
        }
    }

    Ok(devices)
}

pub fn get_output_devices() -> Result<Vec<AudioDevice>> {
    let mut devices = Vec::new();

    let default_device = get_default_device(&Direction::Render).ok();
    let default_id = default_device.as_ref().and_then(|d| d.get_id().ok());

    let collection = DeviceCollection::new(&Direction::Render)?;
    let count = collection.get_nbr_devices()?;

    for i in 0..count {
        if let Ok(device) = collection.get_device_at_index(i) {
            let name = device
                .get_friendlyname()
                .unwrap_or_else(|_| format!("Speaker {}", i));
            let id = device
                .get_id()
                .unwrap_or_else(|_| format!("windows_output_{}", i));
            let is_default = default_id.as_ref().map(|def| def == &id).unwrap_or(false);

            devices.push(AudioDevice {
                id,
                name,
                is_default,
            });
        }
    }

    Ok(devices)
}

fn find_device_by_id(direction: &Direction, device_id: &str) -> Option<wasapi::Device> {
    let collection = match DeviceCollection::new(direction) {
        Ok(c) => c,
        Err(e) => {
            error!(
                "[find_device_by_id] Failed to create device collection: {}",
                e
            );
            return None;
        }
    };

    let count = match collection.get_nbr_devices() {
        Ok(c) => c,
        Err(e) => {
            error!("[find_device_by_id] Failed to get device count: {}", e);
            return None;
        }
    };

    for i in 0..count {
        if let Ok(device) = collection.get_device_at_index(i) {
            if let Ok(id) = device.get_id() {
                if id == device_id {
                    return Some(device);
                }
            }
        }
    }

    error!(
        "[find_device_by_id] No matching device found for ID: {}",
        device_id
    );
    None
}

pub struct SpeakerInput {
    device_id: Option<String>,
}

impl SpeakerInput {
    pub fn new(device_id: Option<String>) -> Result<Self> {
        // Store the device_id for later use in stream()
        let device_id = device_id.filter(|id| !id.is_empty() && id != "default");
        Ok(Self { device_id })
    }

    // Starts the audio stream
    pub fn stream(self) -> Result<SpeakerStream> {
        let sample_queue = Arc::new(Mutex::new(VecDeque::new()));
        let waker_state = Arc::new(Mutex::new(WakerState {
            waker: None,
            has_data: false,
            shutdown: false,
        }));
        let (init_tx, init_rx) = mpsc::channel();

        let queue_clone = sample_queue.clone();
        let waker_clone = waker_state.clone();
        let device_id = self.device_id;

        let capture_thread = thread::spawn(move || {
            let _cleanup = CaptureThreadCleanup(waker_clone.clone());
            if let Err(e) =
                SpeakerStream::capture_audio_loop(queue_clone, waker_clone, init_tx, device_id)
            {
                error!("Pluely Audio capture loop failed: {}", e);
            }
        });

        let mut stream = SpeakerStream {
            sample_queue,
            waker_state,
            capture_thread: Some(capture_thread),
            actual_sample_rate: 0,
            device_name: String::new(),
        };
        let (sample_rate, device_name) = init_rx
            .recv_timeout(Duration::from_secs(5))
            .map_err(|e| anyhow::anyhow!("Audio initialization did not complete: {}", e))??;
        stream.actual_sample_rate = sample_rate;
        stream.device_name = device_name;
        Ok(stream)
    }
}

struct WakerState {
    waker: Option<Waker>,
    has_data: bool,
    shutdown: bool,
}

pub struct SpeakerStream {
    sample_queue: Arc<Mutex<VecDeque<f32>>>,
    waker_state: Arc<Mutex<WakerState>>,
    capture_thread: Option<thread::JoinHandle<()>>,
    actual_sample_rate: u32,
    device_name: String,
}

impl SpeakerStream {
    pub fn sample_rate(&self) -> u32 {
        self.actual_sample_rate
    }

    pub fn device_name(&self) -> &str {
        &self.device_name
    }

    fn capture_audio_loop(
        sample_queue: Arc<Mutex<VecDeque<f32>>>,
        waker_state: Arc<Mutex<WakerState>>,
        init_tx: mpsc::Sender<Result<(u32, String)>>,
        device_id: Option<String>,
    ) -> Result<()> {
        wasapi::initialize_mta().ok()?;
        let _com = ComApartment;
        let init_result = (|| -> Result<_> {
            let device = match device_id {
                Some(ref id) => find_device_by_id(&Direction::Render, id)
                    .ok_or_else(|| anyhow::anyhow!("Selected output device is unavailable"))?,
                None => get_default_device(&Direction::Render)?,
            };

            let mut audio_client = device.get_iaudioclient()?;

            let device_format = audio_client.get_mixformat()?;
            let actual_rate = device_format.get_samplespersec();

            let desired_format =
                WaveFormat::new(32, 32, &SampleType::Float, actual_rate as usize, 1, None);

            let (_def_time, min_time) = audio_client.get_device_period()?;

            let mode = StreamMode::EventsShared {
                autoconvert: true,
                buffer_duration_hns: min_time,
            };

            audio_client.initialize_client(&desired_format, &Direction::Capture, &mode)?;

            let h_event = audio_client.set_get_eventhandle()?;
            let render_client = audio_client.get_audiocaptureclient()?;

            audio_client.start_stream()?;

            let device_name = device
                .get_friendlyname()
                .unwrap_or_else(|_| "System output".into());
            Ok((h_event, render_client, actual_rate, device_name))
        })();

        match init_result {
            Ok((h_event, render_client, sample_rate, device_name)) => {
                let _ = init_tx.send(Ok((sample_rate, device_name)));

                loop {
                    {
                        let state = waker_state.lock().unwrap();
                        if state.shutdown {
                            break;
                        }
                    }

                    match h_event.wait_for_event(100) {
                        Ok(()) => {}
                        // Loopback produces no packets while the output is idle.
                        // Keep waiting, and check shutdown at least every 100ms.
                        Err(WasapiError::EventTimeout) => continue,
                        Err(e) => return Err(e.into()),
                    }

                    let mut temp_queue = VecDeque::new();
                    if let Err(e) = render_client.read_from_device_to_deque(&mut temp_queue) {
                        error!("Pluely Failed to read audio data: {}", e);
                        return Err(e.into());
                    }

                    if temp_queue.is_empty() {
                        continue;
                    }

                    let mut samples = Vec::new();
                    while temp_queue.len() >= 4 {
                        let bytes = [
                            temp_queue.pop_front().unwrap(),
                            temp_queue.pop_front().unwrap(),
                            temp_queue.pop_front().unwrap(),
                            temp_queue.pop_front().unwrap(),
                        ];
                        let sample = f32::from_le_bytes(bytes);
                        samples.push(sample);
                    }

                    if !samples.is_empty() {
                        // Consistent buffer overflow handling
                        let dropped = {
                            let mut queue = sample_queue.lock().unwrap();
                            let max_buffer_size = 131072; // 128KB buffer (matching macOS)

                            queue.extend(samples.iter());

                            // If buffer exceeds maximum, drop oldest samples
                            let dropped_count = if queue.len() > max_buffer_size {
                                let to_drop = queue.len() - max_buffer_size;
                                queue.drain(0..to_drop);
                                to_drop
                            } else {
                                0
                            };

                            dropped_count
                        };

                        if dropped > 0 {
                            error!("Windows buffer overflow - dropped {} samples", dropped);
                        }

                        // Wake up consumer
                        {
                            let mut state = waker_state.lock().unwrap();
                            if !state.has_data {
                                state.has_data = true;
                                if let Some(waker) = state.waker.take() {
                                    drop(state);
                                    waker.wake();
                                }
                            }
                        }
                    }
                }
            }
            Err(e) => {
                let _ = init_tx.send(Err(e));
                return Ok(());
            }
        }

        Ok(())
    }
}

// Drops the audio stream
impl Drop for SpeakerStream {
    fn drop(&mut self) {
        {
            let mut state = self.waker_state.lock().unwrap();
            state.shutdown = true;
        }

        if let Some(thread) = self.capture_thread.take() {
            if let Err(e) = thread.join() {
                error!("Failed to join capture thread: {:?}", e);
            }
        }
    }
}

// Stream of f32 audio samples from the speaker
impl Stream for SpeakerStream {
    type Item = f32;

    // Polls the audio stream
    fn poll_next(
        self: std::pin::Pin<&mut Self>,
        cx: &mut std::task::Context<'_>,
    ) -> Poll<Option<Self::Item>> {
        {
            let state = self.waker_state.lock().unwrap();
            if state.shutdown {
                return Poll::Ready(None);
            }
        }

        {
            let mut queue = self.sample_queue.lock().unwrap();
            if let Some(sample) = queue.pop_front() {
                return Poll::Ready(Some(sample));
            }
        }

        {
            let mut state = self.waker_state.lock().unwrap();
            if state.shutdown {
                return Poll::Ready(None);
            }
            state.has_data = false;
            state.waker = Some(cx.waker().clone());
            drop(state);
        }

        {
            let mut queue = self.sample_queue.lock().unwrap();
            match queue.pop_front() {
                Some(sample) => Poll::Ready(Some(sample)),
                None => Poll::Pending,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::speaker::CaptureSession;
    use futures_util::StreamExt;

    #[tokio::test]
    #[ignore = "plays a quiet synthetic tone on MIRA_TEST_OUTPUT_NAME; only signal metrics are retained"]
    async fn selected_loopback_receives_test_tone() {
        wasapi::initialize_mta().ok().unwrap();
        let _com = ComApartment;
        let outputs = get_output_devices().unwrap();
        let name = std::env::var("MIRA_TEST_OUTPUT_NAME").unwrap_or_default();
        let matching: Vec<_> = outputs.iter().filter(|d| d.name == name).collect();
        assert_eq!(
            matching.len(),
            1,
            "Set MIRA_TEST_OUTPUT_NAME to one exact output name: {:?}",
            outputs.iter().map(|d| &d.name).collect::<Vec<_>>()
        );
        let device_id = matching[0].id.clone();
        let mut capture = SpeakerInput::new(Some(device_id.clone()))
            .unwrap()
            .stream()
            .unwrap();
        let sample_rate = capture.sample_rate();
        let playback = thread::spawn(move || -> Result<()> {
            wasapi::initialize_mta().ok()?;
            let _com = ComApartment;
            let device = find_device_by_id(&Direction::Render, &device_id).unwrap();
            let mut client = device.get_iaudioclient()?;
            let format = WaveFormat::new(32, 32, &SampleType::Float, sample_rate as usize, 1, None);
            let (period, _) = client.get_device_period()?;
            client.initialize_client(
                &format,
                &Direction::Render,
                &StreamMode::EventsShared {
                    autoconvert: true,
                    buffer_duration_hns: period,
                },
            )?;
            let event = client.set_get_eventhandle()?;
            let render = client.get_audiorenderclient()?;
            let started = std::time::Instant::now();
            let mut frame_index = 0_u64;
            client.start_stream()?;
            while started.elapsed() < Duration::from_secs(2) {
                let frames = client.get_available_space_in_frames()?;
                let mut bytes = Vec::with_capacity(frames as usize * 4);
                for _ in 0..frames {
                    let phase =
                        frame_index as f64 * std::f64::consts::TAU * 659.0 / sample_rate as f64;
                    bytes.extend_from_slice(&(0.03 * phase.sin() as f32).to_le_bytes());
                    frame_index += 1;
                }
                render.write_to_device(frames as usize, &bytes, None)?;
                event.wait_for_event(1000)?;
            }
            client.stop_stream()?;
            Ok(())
        });
        let deadline = tokio::time::sleep(Duration::from_secs(3));
        tokio::pin!(deadline);
        let mut count = 0_u64;
        let mut energy = 0.0_f64;
        let mut sine = 0.0_f64;
        let mut cosine = 0.0_f64;
        loop {
            tokio::select! {
                biased;
                _ = &mut deadline => break,
                sample = capture.next() => {
                    let Some(sample) = sample else { break; };
                    let phase = count as f64 * std::f64::consts::TAU * 659.0 / sample_rate as f64;
                    sine += sample as f64 * phase.sin();
                    cosine += sample as f64 * phase.cos();
                    energy += (sample as f64).powi(2);
                    count += 1;
                }
            }
        }
        drop(capture);
        playback.join().unwrap().unwrap();
        let rms = (energy / count.max(1) as f64).sqrt();
        let tone_amplitude = 2.0 * sine.hypot(cosine) / count.max(1) as f64;
        eprintln!("Output: {name}; rate: {sample_rate}; samples: {count}; RMS: {rms:.6}; test tone: {tone_amplitude:.6}");
        assert!(
            count > sample_rate as u64,
            "No sustained loopback packets received"
        );
        assert!(
            tone_amplitude > 0.0002,
            "Generated test tone is missing from captured audio"
        );
    }

    #[tokio::test]
    #[ignore = "requires a Windows audio output device; samples are discarded locally"]
    async fn loopback_can_wait_then_discard_and_restart() {
        for _ in 0..2 {
            let mut stream = SpeakerInput::new(None).unwrap().stream().unwrap();
            assert!((8000..=96000).contains(&stream.sample_rate()));
            let session = CaptureSession::spawn(
                async move { while stream.next().await.is_some() {} },
                None,
                || {},
            );
            tokio::time::sleep(Duration::from_millis(3500)).await;
            assert!(
                session.is_active(),
                "capture must survive an idle output device"
            );
            tokio::time::timeout(Duration::from_secs(2), session.discard())
                .await
                .unwrap();
        }
    }

    #[test]
    #[ignore = "enumerates Windows audio output devices"]
    fn missing_device_is_an_error_instead_of_a_fake_running_stream() {
        let input =
            SpeakerInput::new(Some("pluely-test-device-that-does-not-exist".into())).unwrap();
        assert!(input.stream().is_err());
    }
}
