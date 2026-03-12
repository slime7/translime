//! 窗口探测模块
//!
//! 利用 Windows API 获取顶层窗口的位置、大小及属性信息。

use crate::WindowInfo;
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

/// 窗口枚举上下文，用于存储枚举结果和累计的遮挡区域
struct WindowEnumContext {
    windows: Vec<WindowInfo>,
    covered_region: HRGN,
}

/// 检查指定窗口是否被“隐藏”（Cloaked，如 UWP 应用的挂起状态）
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

/// 获取窗口的实际渲染边界（通过 DWM 排除阴影区域）
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
            // DWM 获取失败时回退到普通矩形
            let mut fallback = RECT::default();
            if GetWindowRect(hwnd, &mut fallback).is_ok() {
                Some(fallback)
            } else {
                None
            }
        }
    }
}

/// 获取当前桌面上所有顶层且可见的窗口列表
pub fn get_top_level_windows() -> Vec<WindowInfo> {
    unsafe {
        let covered_rgn = CreateRectRgn(0, 0, 0, 0);
        let mut context = WindowEnumContext {
            windows: Vec::new(),
            covered_region: covered_rgn,
        };

        let _ = EnumWindows(
            Some(enum_windows_callback),
            LPARAM(&mut context as *mut WindowEnumContext as isize),
        );

        // 释放 GDI 区域对象
        let _ = DeleteObject(covered_rgn);
        context.windows
    }
}

/// EnumWindows 的系统回调函数
unsafe extern "system" fn enum_windows_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    unsafe {
        let context = &mut *(lparam.0 as *mut WindowEnumContext);

        // 基础过滤：排除不可见、被挂起或设为透明穿透的窗口
        if !IsWindowVisible(hwnd).as_bool() || is_cloaked(hwnd) {
            return BOOL(1);
        }

        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
        if (ex_style as u32 & WS_EX_TRANSPARENT.0) != 0 {
            return BOOL(1);
        }

        // 获取窗口实际边界
        let rect = match get_extended_frame_bounds(hwnd) {
            Some(r) => r,
            None => return BOOL(1),
        };
        
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return BOOL(1);
        }

        // 遮挡检测：利用 GDI RGN 排除完全被上方窗口覆盖的窗口
        let win_rgn = CreateRectRgn(rect.left, rect.top, rect.right, rect.bottom);
        let visible_part = CreateRectRgn(0, 0, 0, 0);
        let rgn_type = CombineRgn(visible_part, win_rgn, context.covered_region, RGN_DIFF);

        if rgn_type != NULLREGION && rgn_type != ERROR {
            // 获取窗口类名与标题
            let mut class_buf = [0u16; 256];
            let class_len = GetClassNameW(hwnd, &mut class_buf);
            let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);

            let title_len = GetWindowTextLengthW(hwnd);
            let mut title_buf = vec![0u16; (title_len + 1).max(1) as usize];
            let _ = GetWindowTextW(hwnd, &mut title_buf);
            let title = String::from_utf16_lossy(&title_buf[..title_len.max(0) as usize]);

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

            // 将当前窗口区域合并到已遮挡区域中
            let _ = CombineRgn(context.covered_region, context.covered_region, win_rgn, RGN_OR);
        }

        let _ = DeleteObject(win_rgn);
        let _ = DeleteObject(visible_part);

        BOOL(1)
    }
}

/// 获取指定坐标位置下的最上层窗口信息
pub fn get_window_at_point(x: i32, y: i32, ignore_handle: Option<i64>) -> Option<WindowInfo> {
    unsafe {
        if let Some(ignore) = ignore_handle {
            // 手动遍历窗口链，以支持忽略特定窗口（如 Overlay 窗口本身）
            let mut current = GetTopWindow(None).unwrap_or_default();

            while !current.is_invalid() {
                let val = current.0 as i64;
                if IsWindowVisible(current).as_bool() && val != ignore && !is_cloaked(current) {
                    if let Some(rect) = get_extended_frame_bounds(current) {
                        if x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom {
                            let ex_style = GetWindowLongW(current, GWL_EXSTYLE) as u32;
                            if (ex_style & WS_EX_TRANSPARENT.0) == 0 {
                                return get_window_info(current);
                            }
                        }
                    }
                }
                current = GetWindow(current, GW_HWNDNEXT).unwrap_or_default();
            }
            None
        } else {
            let hwnd = WindowFromPoint(POINT { x, y });
            if hwnd.0.is_null() || is_cloaked(hwnd) {
                return None;
            }
            get_window_info(hwnd)
        }
    }
}

/// 内部辅助函数：构造 WindowInfo 结构
unsafe fn get_window_info(hwnd: HWND) -> Option<WindowInfo> {
    unsafe {
        let title_len = GetWindowTextLengthW(hwnd);
        let mut title_buf = vec![0u16; (title_len + 1).max(1) as usize];
        let _ = GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..title_len.max(0) as usize]);

        let mut class_buf = [0u16; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);

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
