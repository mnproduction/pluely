//! Provider settings encrypted for the current Windows account with DPAPI.
//! Keys still exist in process memory while requests are made.
use std::{collections::BTreeMap, fs, path::Path, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};

type Values = BTreeMap<String, String>;
#[derive(Default)]
pub struct PrivateStore(Mutex<()>);
const MAX_BYTES: usize = 8 * 1024 * 1024;

fn allowed_key(key: &str) -> bool {
    matches!(
        key,
        "curl_custom_ai_providers"
            | "curl_custom_speech_providers"
            | "curl_selected_ai_provider"
            | "curl_selected_stt_provider"
    )
}

fn check_window(window: &WebviewWindow) -> Result<(), String> {
    if matches!(window.label(), "main" | "dashboard") {
        Ok(())
    } else {
        Err("Provider storage is unavailable in this window".into())
    }
}

#[cfg(windows)]
pub(crate) fn protect(input: &[u8], encrypt: bool) -> Result<Vec<u8>, String> {
    use std::ptr::{null, null_mut};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };
    // DPAPI adds a header and authentication data to the plaintext size.
    let limit = if encrypt { MAX_BYTES } else { MAX_BYTES + 4096 };
    if input.len() > limit {
        return Err("Provider settings are too large".into());
    }
    let source = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: null_mut(),
    };
    // SAFETY: input remains alive during this call. DPAPI allocates output, which
    // is copied and released with LocalFree on every successful call.
    unsafe {
        let ok = if encrypt {
            CryptProtectData(
                &source,
                null(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &source,
                null_mut(),
                null(),
                null(),
                null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        };
        if ok == 0 {
            return Err("Windows could not encrypt or decrypt provider settings".into());
        }
        let bytes = std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec();
        if !encrypt {
            std::ptr::write_bytes(output.pbData, 0, output.cbData as usize);
        }
        LocalFree(output.pbData.cast());
        Ok(bytes)
    }
}

#[cfg(not(windows))]
pub(crate) fn protect(_: &[u8], _: bool) -> Result<Vec<u8>, String> {
    Err(
        "This build uses Windows DPAPI. Provider storage on other platforms is not implemented."
            .into(),
    )
}

fn read_values(path: &Path) -> Result<Values, String> {
    let encrypted = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Values::new()),
        Err(_) => return Err("Cannot read encrypted provider settings".into()),
    };
    let plaintext = protect(&encrypted, false)?;
    serde_json::from_slice(&plaintext).map_err(|_| "Invalid encrypted provider settings".into())
}

#[cfg(windows)]
fn replace_file(temp: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source: Vec<u16> = temp.as_os_str().encode_wide().chain(Some(0)).collect();
    let target: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    // SAFETY: both paths are valid, NUL-terminated UTF-16 buffers for this call.
    if unsafe {
        MoveFileExW(
            source.as_ptr(),
            target.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    } == 0
    {
        Err("Cannot replace encrypted provider settings".into())
    } else {
        Ok(())
    }
}

#[cfg(not(windows))]
fn replace_file(temp: &Path, destination: &Path) -> Result<(), String> {
    fs::rename(temp, destination).map_err(|_| "Cannot replace provider settings".into())
}

fn write_values(path: &Path, values: &Values) -> Result<(), String> {
    use std::io::Write;
    let plaintext = serde_json::to_vec(values).map_err(|_| "Cannot encode provider settings")?;
    let encrypted = protect(&plaintext, true)?;
    let parent = path.parent().ok_or("Missing provider storage directory")?;
    fs::create_dir_all(parent).map_err(|_| "Cannot create provider storage directory")?;
    let temp = path.with_extension("dpapi.tmp");
    let mut file =
        fs::File::create(&temp).map_err(|_| "Cannot save encrypted provider settings")?;
    file.write_all(&encrypted)
        .and_then(|_| file.sync_all())
        .map_err(|_| "Cannot flush encrypted provider settings")?;
    drop(file);
    replace_file(&temp, path)
}

#[tauri::command]
pub fn private_store_load(
    app: AppHandle,
    window: WebviewWindow,
    state: State<PrivateStore>,
) -> Result<Values, String> {
    check_window(&window)?;
    let _guard = state
        .0
        .lock()
        .map_err(|_| "Provider storage is unavailable")?;
    let path = app
        .path()
        .app_config_dir()
        .map_err(|_| "Missing app data directory")?
        .join("providers.dpapi");
    read_values(&path)
}

#[tauri::command]
pub fn private_store_set(
    app: AppHandle,
    window: WebviewWindow,
    state: State<PrivateStore>,
    key: String,
    value: Option<String>,
) -> Result<(), String> {
    check_window(&window)?;
    if !allowed_key(&key) {
        return Err("Unsupported provider setting".into());
    }
    let _guard = state
        .0
        .lock()
        .map_err(|_| "Provider storage is unavailable")?;
    let path = app
        .path()
        .app_config_dir()
        .map_err(|_| "Missing app data directory")?
        .join("providers.dpapi");
    let mut values = read_values(&path)?;
    if let Some(value) = value {
        values.insert(key.clone(), value);
    } else {
        values.remove(&key);
    }
    write_values(&path, &values)?;
    // Only the setting name crosses the event bus, never its value.
    for label in ["main", "dashboard"] {
        let _ = app.emit_to(label, "private-store-changed", &key);
    }
    Ok(())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    #[test]
    fn dpapi_roundtrip_rejects_tampering_and_keeps_plaintext_off_disk() {
        let dir = std::env::temp_dir().join(format!("pluely-vault-test-{}", uuid::Uuid::new_v4()));
        let path = dir.join("providers.dpapi");
        let mut values = Values::new();
        values.insert(
            "curl_selected_ai_provider".into(),
            "fake-test-api-key-123456".into(),
        );
        write_values(&path, &values).unwrap();
        assert_eq!(read_values(&path).unwrap(), values);
        let mut bytes = fs::read(&path).unwrap();
        assert!(!bytes.windows(22).any(|w| w == b"fake-test-api-key-123456"));
        let last = bytes.len() - 1;
        bytes[last] ^= 0x80;
        fs::write(&path, bytes).unwrap();
        assert!(read_values(&path).is_err());
        fs::remove_file(&path).unwrap();
        fs::remove_dir(&dir).unwrap();
    }
    #[test]
    fn only_provider_keys_are_accepted() {
        assert!(allowed_key("curl_selected_ai_provider"));
        assert!(!allowed_key("../../arbitrary-file"));
        assert!(!allowed_key("license_key"));
    }

    #[test]
    fn largest_accepted_plaintext_is_still_readable_after_encryption() {
        let plaintext = vec![b'x'; MAX_BYTES];
        let ciphertext = protect(&plaintext, true).unwrap();
        assert!(ciphertext.len() > plaintext.len());
        assert_eq!(protect(&ciphertext, false).unwrap(), plaintext);
        assert!(protect(&vec![b'x'; MAX_BYTES + 1], true).is_err());
    }
}
