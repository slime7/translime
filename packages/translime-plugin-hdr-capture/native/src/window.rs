//! 窗口检测模块
//!
//! 使用 Windows API 获取窗口信息

use crate::WindowInfo;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
    IsWindowVisible, WindowFromPoint,
};

/// 获取所有顶层可见窗口
pub fn get_top_level_windows() -> Vec<WindowInfo> {
    let mut windows: Vec<WindowInfo> = Vec::new();

    unsafe {
        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut windows as *mut Vec<WindowInfo> as isize),
        );
    }

    windows
}

/// EnumWindows 回调函数
unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let windows = unsafe { &mut *(lparam.0 as *mut Vec<WindowInfo>) };

    // 仅处理可见窗口
    if unsafe { !IsWindowVisible(hwnd).as_bool() } {
        return BOOL(1); // 继续枚举
    }

    // 获取窗口标题
    let title_len = unsafe { GetWindowTextLengthW(hwnd) };
    if title_len == 0 {
        return BOOL(1); // 跳过无标题窗口
    }

    let mut title_buf: Vec<u16> = vec![0; (title_len + 1) as usize];
    unsafe { GetWindowTextW(hwnd, &mut title_buf) };
    let title = OsString::from_wide(&title_buf[..title_len as usize])
        .to_string_lossy()
        .to_string();

    // 获取窗口类名
    let mut class_buf: Vec<u16> = vec![0; 256];
    let class_len = unsafe { GetClassNameW(hwnd, &mut class_buf) };
    let class_name = OsString::from_wide(&class_buf[..class_len as usize])
        .to_string_lossy()
        .to_string();

    // 获取窗口矩形
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(hwnd, &mut rect).is_ok() } {
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        // 过滤掉过小的窗口
        if width > 10 && height > 10 {
            windows.push(WindowInfo {
                handle: hwnd.0 as i64,
                title,
                class_name,
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width,
                height,
            });
        }
    }

    BOOL(1) // 继续枚举
}

/// 获取指定坐标处的窗口
pub fn get_window_at_point(x: i32, y: i32) -> Option<WindowInfo> {
    unsafe {
        let point = POINT { x, y };
        let hwnd = WindowFromPoint(point);

        if hwnd.0.is_null() {
            return None;
        }

        // 获取窗口信息
        let title_len = GetWindowTextLengthW(hwnd);
        let mut title_buf: Vec<u16> = vec![0; (title_len + 1).max(1) as usize];
        GetWindowTextW(hwnd, &mut title_buf);
        let title = OsString::from_wide(&title_buf[..title_len.max(0) as usize])
            .to_string_lossy()
            .to_string();

        let mut class_buf: Vec<u16> = vec![0; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        let class_name = OsString::from_wide(&class_buf[..class_len as usize])
            .to_string_lossy()
            .to_string();

        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return None;
        }

        Some(WindowInfo {
            handle: hwnd.0 as i64,
            title,
            class_name,
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
        })
    }
}
