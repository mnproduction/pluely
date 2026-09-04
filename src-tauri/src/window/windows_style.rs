use std::io;
use tauri::{Runtime, WebviewWindow};
use windows_sys::Win32::{
    Foundation::{GetLastError, SetLastError, HWND},
    UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, SetWindowPos, GWL_EXSTYLE, SWP_FRAMECHANGED,
        SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
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

    // Do not hide/show a capture-protected window while changing this style.
    // On Windows 10 and 11 that transition can make WDA_EXCLUDEFROMCAPTURE
    // regress to a black rectangle for an already-running capture session.
    // SetWindowPos refreshes Alt+Tab-related styles, while Tauri's separate
    // set_skip_taskbar call updates the taskbar through ITaskbarList.
    let result = write_style(hwnd, next);
    if result.is_err() {
        let _ = write_style(hwnd, previous);
    }
    result.map_err(Into::into)
}
