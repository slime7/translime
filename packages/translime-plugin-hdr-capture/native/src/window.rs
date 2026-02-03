//! 窗口检测模块
//!
//! 使用 Windows API 获取窗口信息

use crate::WindowInfo;
use std::ffi::OsString;
use std::os::windows::ffi::OsStringExt;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::Graphics::Gdi::{
    CombineRgn, CreateRectRgn, DeleteObject, GDI_REGION_TYPE, HRGN, RGN_DIFF, RGN_OR,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetTopWindow, GetWindow, GetWindowLongW, GetWindowRect,
    GetWindowTextLengthW, GetWindowTextW, IsWindowVisible, WindowFromPoint, GWL_EXSTYLE,
    GW_HWNDNEXT, WS_EX_TRANSPARENT,
};

const NULLREGION: GDI_REGION_TYPE = GDI_REGION_TYPE(1);
const ERROR: GDI_REGION_TYPE = GDI_REGION_TYPE(0);

/// 窗口枚举上下文
struct WindowEnumContext {
    windows: Vec<WindowInfo>,
    covered_region: HRGN,
}

/// 检查窗口是否被“Cloaked”
fn is_cloaked(hwnd: HWND) -> bool {
    let mut cloaked: u32 = 0;
    unsafe {
        let _ = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut _ as *mut _,
            std::mem::size_of::<u32>() as u32,
        );
    }
    cloaked != 0
}

/// 获取窗口的实际渲染边界 (排除阴影)
fn get_extended_frame_bounds(hwnd: HWND) -> Option<RECT> {
    let mut rect = RECT::default();
    unsafe {
        let hr = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut rect as *mut _ as *mut _,
            std::mem::size_of::<RECT>() as u32,
        );
        if hr.is_ok() {
            Some(rect)
        } else {
            // 如果 DWM 获取失败，退回到普通 Rect
            let mut fallback_rect = RECT::default();
            if GetWindowRect(hwnd, &mut fallback_rect).is_ok() {
                Some(fallback_rect)
            } else {
                None
            }
        }
    }
}

/// 获取所有顶层可见窗口 (过滤掉完全被遮挡的窗口)
pub fn get_top_level_windows() -> Vec<WindowInfo> {
    unsafe {
        let covered_region = CreateRectRgn(0, 0, 0, 0);
        let mut context = WindowEnumContext {
            windows: Vec::new(),
            covered_region,
        };

        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut context as *mut WindowEnumContext as isize),
        );

        // 清理 GDI 资源
        let _ = DeleteObject(covered_region);

        context.windows
    }
}

/// EnumWindows 回调函数
unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    unsafe {
        // 获取上下文
        let context = &mut *(lparam.0 as *mut WindowEnumContext);

        // 基础可见性检查
        if !IsWindowVisible(hwnd).as_bool() {
            return BOOL(1);
        }

        // 检查 DWM Cloaked 属性
        if is_cloaked(hwnd) {
            return BOOL(1);
        }

        // 过滤器：仅排除明确的透明穿透窗口（如 Overlay 自身）
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        if (ex_style as u32 & WS_EX_TRANSPARENT.0) != 0 {
            return BOOL(1);
        }

        // 获取窗口类名
        let mut class_buf: Vec<u16> = vec![0; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        let class_name = OsString::from_wide(&class_buf[..class_len as usize])
            .to_string_lossy()
            .to_string();

        // 获取窗口实际矩形 (尝试排除阴影)
        let rect = match get_extended_frame_bounds(hwnd) {
            Some(r) => r,
            None => return BOOL(1),
        };
        
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        if width <= 0 || height <= 0 {
            return BOOL(1);
        }

        // 遮挡检测
        let win_rgn = CreateRectRgn(rect.left, rect.top, rect.right, rect.bottom);
        let visible_part = CreateRectRgn(0, 0, 0, 0);

        let rgn_type = CombineRgn(visible_part, win_rgn, context.covered_region, RGN_DIFF);

        if rgn_type != NULLREGION && rgn_type != ERROR {
            // 获取标题
            let title_len = GetWindowTextLengthW(hwnd);
            let mut title_buf: Vec<u16> = vec![0; (title_len + 1).max(1) as usize];
            let _ = GetWindowTextW(hwnd, &mut title_buf);
            let title = OsString::from_wide(&title_buf[..title_len.max(0) as usize])
                .to_string_lossy()
                .to_string();

            context.windows.push(WindowInfo {
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

            // 更新已遮挡区域
            let _ = CombineRgn(
                context.covered_region,
                context.covered_region,
                win_rgn,
                RGN_OR,
            );
        }

        let _ = DeleteObject(win_rgn);
        let _ = DeleteObject(visible_part);

        BOOL(1) // 继续枚举
    }
}

/// 获取指定坐标处的窗口
pub fn get_window_at_point(x: i32, y: i32, ignore_handle: Option<i64>) -> Option<WindowInfo> {
    unsafe {
        if let Some(ignore) = ignore_handle {
            let mut current_hwnd = GetTopWindow(None).unwrap_or_default();

            while !current_hwnd.is_invalid() {
                let hwnd_val = current_hwnd.0 as i64;
                if IsWindowVisible(current_hwnd).as_bool() && hwnd_val != ignore && !is_cloaked(current_hwnd) {
                    if let Some(rect) = get_extended_frame_bounds(current_hwnd) {
                        if x >= rect.left && x < rect.right 
                            && y >= rect.top && y < rect.bottom 
                            && (GetWindowLongW(current_hwnd, GWL_EXSTYLE) as u32 & WS_EX_TRANSPARENT.0) == 0 {
                            return get_window_info(current_hwnd);
                        }
                    }
                }
                current_hwnd = GetWindow(current_hwnd, GW_HWNDNEXT).unwrap_or_default();
            }
            None
        } else {
            let point = POINT { x, y };
            let hwnd = WindowFromPoint(point);
            if hwnd.0.is_null() || is_cloaked(hwnd) {
                return None;
            }
            get_window_info(hwnd)
        }
    }
}

/// 辅助函数
unsafe fn get_window_info(hwnd: HWND) -> Option<WindowInfo> {
    unsafe {
        let title_len = GetWindowTextLengthW(hwnd);
        let mut title_buf: Vec<u16> = vec![0; (title_len + 1).max(1) as usize];
        let _ = GetWindowTextW(hwnd, &mut title_buf);
        let title = OsString::from_wide(&title_buf[..title_len.max(0) as usize])
            .to_string_lossy()
            .to_string();

        let mut class_buf: Vec<u16> = vec![0; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        let class_name = OsString::from_wide(&class_buf[..class_len as usize])
            .to_string_lossy()
            .to_string();

        get_extended_frame_bounds(hwnd).map(|rect| WindowInfo {
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
