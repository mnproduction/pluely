use std::io;
use tauri::{Runtime, WebviewWindow};
use windows_sys::Win32::{
    Foundation::{GetLastError, SetLastError, HWND},
    UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, ShowWindow, GWL_EXSTYLE,
        SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_SHOWNA,
        WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
    },
};

fn read_style(hwnd: HWND) -> io::Result<isize> {
    // A zero style is valid, so distinguish it from an API failure.
    unsafe {
        SetLastError(0);
        let style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as isize;
        if style == 0 && GetLastError() != 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(style)
    }
}

fn write_style(hwnd: HWND, style: isize) -> io::Result<()> {
    unsafe {
        SetLastError(0);
        if SetWindowLongPtrW(hwnd, GWL_EXSTYLE, style as _) == 0 && GetLastError() != 0 {
            return Err(io::Error::last_os_error());
        }
        // Windows caches frame attributes until SetWindowPos refreshes them.
        if SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
        ) == 0
        {
            return Err(io::Error::last_os_error());
        }
    }
    Ok(())
}

pub(super) fn set_tool_window<R: Runtime>(
    window: &WebviewWindow<R>,
    enabled: bool,
) -> tauri::Result<()> {
    let hwnd = window.hwnd()?.0 as HWND;
    let previous = read_style(hwnd)?;
    // Preserve every unrelated style, including transparency and topmost state.
    let next = if enabled {
        (previous | WS_EX_TOOLWINDOW as isize) & !(WS_EX_APPWINDOW as isize)
    } else {
        (previous | WS_EX_APPWINDOW as isize) & !(WS_EX_TOOLWINDOW as isize)
    };
    if next == previous {
        return Ok(());
    }

    let was_visible = window.is_visible()?;
    let was_focused = window.is_focused()?;
    // The shell requires hide/change/show when changing taskbar-related styles.
    // This is a native window change; the WebView and its session stay alive.
    // Use ShowWindow for this temporary cycle: Tao's hide/show methods rebuild
    // the extended style from their cache and would discard WS_EX_TOOLWINDOW.
    if was_visible {
        unsafe { ShowWindow(hwnd, SW_HIDE) };
    }
    let result = write_style(hwnd, next);
    if result.is_err() {
        let _ = write_style(hwnd, previous);
    }
    // Restore visibility even when the style update fails. Never open a hidden
    // Dashboard as a side effect of changing the preference in another window.
    if was_visible {
        unsafe { ShowWindow(hwnd, SW_SHOWNA) };
        if was_focused {
            window.set_focus()?;
        }
    }
    result.map_err(Into::into)
}
