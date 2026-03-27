//! 窗口探测模块
//!
//! 利用 Windows API 获取顶层窗口的位置、大小及属性信息。

use crate::{UiElementInfo, WindowInfo};
use std::collections::HashSet;
use std::ffi::c_void;
use std::time::Instant;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT};
use windows::Win32::Graphics::Dwm::{
    DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS, DwmGetWindowAttribute,
};
use windows::Win32::Graphics::Gdi::{
    CombineRgn, CreateRectRgn, DeleteObject, GDI_REGION_TYPE, HRGN, RGN_DIFF, RGN_OR,
};
use windows::Win32::System::Com::{
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx, CoUninitialize,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation8, IUIAutomation, IUIAutomationElement, IUIAutomationTreeWalker,
    UIA_CONTROLTYPE_ID,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GW_HWNDNEXT, GWL_EXSTYLE, GetClassNameW, GetTopWindow, GetWindow, GetWindowLongW,
    GetWindowRect, GetWindowTextLengthW, GetWindowTextW, IsWindowVisible, WS_EX_TRANSPARENT,
    WindowFromPoint,
};
use windows::core::HRESULT;

const NULLREGION: GDI_REGION_TYPE = GDI_REGION_TYPE(1);
const ERROR: GDI_REGION_TYPE = GDI_REGION_TYPE(0);
const MIN_UI_ELEMENT_SIZE: i32 = 3;
const MAX_UI_TREE_SCAN: usize = 4096;
const RPC_E_CHANGED_MODE_HRESULT: HRESULT = HRESULT(0x80010106u32 as i32);

/// 窗口枚举上下文，用于存储枚举结果和累计的遮挡区域
struct WindowEnumContext {
    windows: Vec<WindowInfo>,
    covered_region: HRGN,
}

struct ComGuard {
    should_uninitialize: bool,
}

impl Drop for ComGuard {
    fn drop(&mut self) {
        if self.should_uninitialize {
            unsafe {
                CoUninitialize();
            }
        }
    }
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

fn init_com() -> Option<ComGuard> {
    unsafe {
        match CoInitializeEx(None, COINIT_MULTITHREADED) {
            hr if hr.is_ok() => Some(ComGuard {
                should_uninitialize: true,
            }),
            hr if hr == RPC_E_CHANGED_MODE_HRESULT => Some(ComGuard {
                should_uninitialize: false,
            }),
            _ => None,
        }
    }
}

fn create_automation() -> Option<IUIAutomation> {
    unsafe { CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER).ok() }
}

fn to_hwnd(handle: i64) -> HWND {
    HWND(handle as isize as *mut c_void)
}

fn rect_width(rect: &RECT) -> i32 {
    rect.right - rect.left
}

fn rect_height(rect: &RECT) -> i32 {
    rect.bottom - rect.top
}

fn rect_is_reasonable(rect: &RECT) -> bool {
    rect_width(rect) >= MIN_UI_ELEMENT_SIZE && rect_height(rect) >= MIN_UI_ELEMENT_SIZE
}

fn rect_contains_point(rect: &RECT, x: i32, y: i32) -> bool {
    x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom
}

fn rect_intersection(a: &RECT, b: &RECT) -> Option<RECT> {
    let rect = RECT {
        left: a.left.max(b.left),
        top: a.top.max(b.top),
        right: a.right.min(b.right),
        bottom: a.bottom.min(b.bottom),
    };

    if rect_is_reasonable(&rect) {
        Some(rect)
    } else {
        None
    }
}

fn rect_area(rect: &RECT) -> i64 {
    i64::from(rect_width(rect).max(0)) * i64::from(rect_height(rect).max(0))
}

fn window_info_rect(window: &WindowInfo) -> RECT {
    RECT {
        left: window.left,
        top: window.top,
        right: window.right,
        bottom: window.bottom,
    }
}

fn control_type_name(control_type: i32) -> String {
    match control_type {
        50000 => "Button",
        50001 => "Calendar",
        50002 => "CheckBox",
        50003 => "ComboBox",
        50004 => "Edit",
        50005 => "Hyperlink",
        50006 => "Image",
        50007 => "ListItem",
        50008 => "List",
        50009 => "Menu",
        50010 => "MenuBar",
        50011 => "MenuItem",
        50012 => "ProgressBar",
        50013 => "RadioButton",
        50014 => "ScrollBar",
        50015 => "Slider",
        50016 => "Spinner",
        50017 => "StatusBar",
        50018 => "Tab",
        50019 => "TabItem",
        50020 => "Text",
        50021 => "ToolBar",
        50022 => "ToolTip",
        50023 => "Tree",
        50024 => "TreeItem",
        50025 => "Custom",
        50026 => "Group",
        50027 => "Thumb",
        50028 => "DataGrid",
        50029 => "DataItem",
        50030 => "Document",
        50031 => "SplitButton",
        50032 => "Window",
        50033 => "Pane",
        50034 => "Header",
        50035 => "HeaderItem",
        50036 => "Table",
        50037 => "TitleBar",
        50038 => "Separator",
        50039 => "SemanticZoom",
        50040 => "AppBar",
        _ => return format!("ControlType_{}", control_type),
    }
    .to_string()
}

fn build_ui_element_info(
    element: &IUIAutomationElement,
    fallback_window_handle: i64,
    clip_rect: Option<&RECT>,
) -> Option<UiElementInfo> {
    let raw_rect = unsafe { element.CurrentBoundingRectangle().ok()? };
    let rect = if let Some(clip_rect) = clip_rect {
        rect_intersection(&raw_rect, clip_rect)?
    } else {
        raw_rect
    };
    if !rect_is_reasonable(&rect) {
        return None;
    }

    let is_offscreen = unsafe { element.CurrentIsOffscreen().unwrap_or(BOOL(0)).as_bool() };
    if is_offscreen {
        return None;
    }

    let name = unsafe { element.CurrentName().ok() }
        .map(|value| value.to_string())
        .unwrap_or_default();
    let class_name = unsafe { element.CurrentClassName().ok() }
        .map(|value| value.to_string())
        .unwrap_or_default();
    let automation_id = unsafe { element.CurrentAutomationId().ok() }
        .map(|value| value.to_string())
        .unwrap_or_default();
    let control_type_value = unsafe {
        element
            .CurrentControlType()
            .unwrap_or(UIA_CONTROLTYPE_ID(0))
            .0
    };
    let process_id = unsafe { element.CurrentProcessId().unwrap_or(0) as u32 };
    let native_window_handle = unsafe {
        element
            .CurrentNativeWindowHandle()
            .unwrap_or(HWND(std::ptr::null_mut()))
            .0 as i64
    };
    let runtime_id = format!(
        "{}:{}:{}:{}:{}:{}",
        native_window_handle, rect.left, rect.top, rect.right, rect.bottom, control_type_value
    );
    let window_handle = if native_window_handle != 0 {
        native_window_handle
    } else {
        fallback_window_handle
    };

    let id = if !automation_id.is_empty() {
        format!("{}:{}", window_handle, automation_id)
    } else {
        format!("{}:{}", window_handle, runtime_id)
    };

    Some(UiElementInfo {
        id,
        runtime_id,
        name,
        control_type: control_type_name(control_type_value),
        class_name,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect_width(&rect),
        height: rect_height(&rect),
        process_id,
        window_handle,
    })
}

fn element_contains_point(
    element: &IUIAutomationElement,
    x: i32,
    y: i32,
    fallback_window_handle: i64,
    clip_rect: Option<&RECT>,
) -> Option<UiElementInfo> {
    let info = build_ui_element_info(element, fallback_window_handle, clip_rect)?;
    let rect = RECT {
        left: info.left,
        top: info.top,
        right: info.right,
        bottom: info.bottom,
    };
    if rect_contains_point(&rect, x, y) {
        Some(info)
    } else {
        None
    }
}

fn collect_ui_elements_recursive(
    element: &IUIAutomationElement,
    walker: &IUIAutomationTreeWalker,
    fallback_window_handle: i64,
    clip_rect: Option<&RECT>,
    visited: &mut HashSet<String>,
    output: &mut Vec<UiElementInfo>,
) {
    if output.len() >= MAX_UI_TREE_SCAN {
        return;
    }

    if let Some(info) = build_ui_element_info(element, fallback_window_handle, clip_rect)
        && visited.insert(info.id.clone())
    {
        output.push(info);
    }

    let mut child = unsafe { walker.GetFirstChildElement(element).ok() };
    while let Some(child_element) = child {
        collect_ui_elements_recursive(
            &child_element,
            walker,
            fallback_window_handle,
            clip_rect,
            visited,
            output,
        );
        if output.len() >= MAX_UI_TREE_SCAN {
            break;
        }
        child = unsafe { walker.GetNextSiblingElement(&child_element).ok() };
    }
}

fn ui_element_area(info: &UiElementInfo) -> i64 {
    i64::from(info.width.max(0)) * i64::from(info.height.max(0))
}

fn collect_ancestor_path(
    element: &IUIAutomationElement,
    walker: &IUIAutomationTreeWalker,
    x: i32,
    y: i32,
    fallback_window_handle: i64,
    clip_rect: Option<&RECT>,
) -> Vec<UiElementInfo> {
    let mut path = Vec::new();
    let mut seen = HashSet::new();
    let mut current = Some(element.clone());

    while let Some(current_element) = current {
        if let Some(info) =
            element_contains_point(&current_element, x, y, fallback_window_handle, clip_rect)
        {
            let same_window =
                info.window_handle == 0 || info.window_handle == fallback_window_handle;
            if same_window && seen.insert(info.id.clone()) {
                path.push(info);
            }
        }

        current = unsafe { walker.GetParentElement(&current_element).ok() };
    }

    path
}

fn pick_smallest_child_at_point(
    parent: &IUIAutomationElement,
    walker: &IUIAutomationTreeWalker,
    x: i32,
    y: i32,
    fallback_window_handle: i64,
    clip_rect: Option<&RECT>,
) -> Option<(IUIAutomationElement, UiElementInfo)> {
    let mut child = unsafe { walker.GetFirstChildElement(parent).ok() };
    let mut best: Option<(IUIAutomationElement, UiElementInfo)> = None;

    while let Some(child_element) = child {
        if let Some(info) =
            element_contains_point(&child_element, x, y, fallback_window_handle, clip_rect)
        {
            let same_window =
                info.window_handle == 0 || info.window_handle == fallback_window_handle;
            if same_window {
                let should_replace = match &best {
                    Some((_, best_info)) => ui_element_area(&info) < ui_element_area(best_info),
                    None => true,
                };
                if should_replace {
                    best = Some((child_element.clone(), info));
                }
            }
        }

        child = unsafe { walker.GetNextSiblingElement(&child_element).ok() };
    }

    best
}

fn collect_descendant_path_at_point(
    root: &IUIAutomationElement,
    walker: &IUIAutomationTreeWalker,
    x: i32,
    y: i32,
    fallback_window_handle: i64,
    clip_rect: Option<&RECT>,
) -> Vec<UiElementInfo> {
    let mut outer_to_inner = Vec::new();
    let mut seen = HashSet::new();

    if let Some(root_info) = element_contains_point(root, x, y, fallback_window_handle, clip_rect)
        && seen.insert(root_info.id.clone())
    {
        outer_to_inner.push(root_info);
    }

    let mut current = root.clone();
    while let Some((next_element, next_info)) =
        pick_smallest_child_at_point(&current, walker, x, y, fallback_window_handle, clip_rect)
    {
        if seen.insert(next_info.id.clone()) {
            outer_to_inner.push(next_info);
        }
        current = next_element;
    }

    outer_to_inner.reverse();
    outer_to_inner
}

fn choose_better_path(
    current_best: Vec<UiElementInfo>,
    challenger: Vec<UiElementInfo>,
) -> Vec<UiElementInfo> {
    if challenger.is_empty() {
        return current_best;
    }
    if current_best.is_empty() {
        return challenger;
    }

    if challenger.len() > current_best.len() {
        return challenger;
    }

    if challenger.len() == current_best.len() {
        let challenger_area = challenger.first().map(ui_element_area).unwrap_or(i64::MAX);
        let current_area = current_best
            .first()
            .map(ui_element_area)
            .unwrap_or(i64::MAX);
        if challenger_area < current_area {
            return challenger;
        }
    }

    current_best
}

fn prune_redundant_outer_window(path: &mut Vec<UiElementInfo>) {
    if path.len() < 2 {
        return;
    }

    let outer = match path.last() {
        Some(value) => value,
        None => return,
    };
    let inner = &path[path.len() - 2];

    if outer.control_type != "Window" || inner.window_handle != outer.window_handle {
        return;
    }

    let inset_left = inner.left - outer.left;
    let inset_top = inner.top - outer.top;
    let inset_right = outer.right - inner.right;
    let inset_bottom = outer.bottom - inner.bottom;

    let looks_like_outer_frame = inset_left >= 0
        && inset_top >= 0
        && inset_right >= 0
        && inset_bottom >= 0
        && inset_left <= 16
        && inset_top <= 16
        && inset_right <= 16
        && inset_bottom <= 16
        && rect_area(&RECT {
            left: inner.left,
            top: inner.top,
            right: inner.right,
            bottom: inner.bottom,
        }) < rect_area(&RECT {
            left: outer.left,
            top: outer.top,
            right: outer.right,
            bottom: outer.bottom,
        });

    if looks_like_outer_frame {
        path.pop();
    }
}

fn should_try_descendant_walkers(target_window: &WindowInfo, raw_path: &[UiElementInfo]) -> bool {
    if raw_path.len() > 1 {
        return false;
    }

    let class_name = target_window.class_name.to_ascii_lowercase();
    class_name.starts_with("windowsforms10.")
        || class_name.starts_with("hwndwrapper")
        || class_name.contains("xaml")
        || class_name == "applicationframewindow"
        || class_name == "windows.ui.core.corewindow"
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

/// 获取指定屏幕坐标下的界面元素候选链（从内到外）
pub fn get_ui_element_candidates_at_point(
    x: i32,
    y: i32,
    ignore_handle: Option<i64>,
) -> Vec<UiElementInfo> {
    let started_at = Instant::now();
    let _com = match init_com() {
        Some(guard) => guard,
        None => {
            eprintln!(
                "[hdr-capture-native][uia] init_com failed at ({}, {}), ignore={:?}",
                x, y, ignore_handle
            );
            return Vec::new();
        }
    };
    let automation = match create_automation() {
        Some(value) => value,
        None => {
            eprintln!(
                "[hdr-capture-native][uia] create_automation failed at ({}, {}), ignore={:?}",
                x, y, ignore_handle
            );
            return Vec::new();
        }
    };
    let target_window = match get_window_at_point(x, y, ignore_handle) {
        Some(value) => value,
        None => {
            eprintln!(
                "[hdr-capture-native][uia] get_window_at_point returned none at ({}, {}), ignore={:?}",
                x, y, ignore_handle
            );
            return Vec::new();
        }
    };
    let target_rect = window_info_rect(&target_window);
    let root = unsafe {
        automation
            .ElementFromHandle(to_hwnd(target_window.handle))
            .ok()
    };
    let raw_element = unsafe { automation.ElementFromPoint(POINT { x, y }).ok() };
    let raw_walker = unsafe { automation.RawViewWalker().ok() };
    let content_walker = unsafe { automation.ContentViewWalker().ok() };
    let control_walker = unsafe { automation.ControlViewWalker().ok() };

    let mut best_path = match (raw_element.as_ref(), raw_walker.as_ref()) {
        (Some(element), Some(walker)) => collect_ancestor_path(
            element,
            walker,
            x,
            y,
            target_window.handle,
            Some(&target_rect),
        ),
        _ => Vec::new(),
    };

    if should_try_descendant_walkers(&target_window, &best_path) {
        if let (Some(root), Some(walker)) = (root.as_ref(), content_walker.as_ref()) {
            best_path = choose_better_path(
                best_path,
                collect_descendant_path_at_point(
                    root,
                    walker,
                    x,
                    y,
                    target_window.handle,
                    Some(&target_rect),
                ),
            );
        }

        if let (Some(root), Some(walker)) = (root.as_ref(), control_walker.as_ref()) {
            best_path = choose_better_path(
                best_path,
                collect_descendant_path_at_point(
                    root,
                    walker,
                    x,
                    y,
                    target_window.handle,
                    Some(&target_rect),
                ),
            );
        }
    }

    prune_redundant_outer_window(&mut best_path);

    let preview = best_path
        .iter()
        .take(3)
        .map(|item| {
            format!(
                "{}|{}|{}|{}",
                item.window_handle, item.control_type, item.class_name, item.name
            )
        })
        .collect::<Vec<String>>()
        .join(" -> ");
    eprintln!(
        "[hdr-capture-native][uia] point=({}, {}), ignore={:?}, target_window={} '{}', candidates={}, elapsed={}ms, preview={}",
        x,
        y,
        ignore_handle,
        target_window.handle,
        target_window.title,
        best_path.len(),
        started_at.elapsed().as_millis(),
        preview
    );
    best_path
}

/// 获取指定窗口下的全部界面元素
pub fn get_ui_elements_for_window(window_handle: i64) -> Vec<UiElementInfo> {
    let _com = match init_com() {
        Some(guard) => guard,
        None => return Vec::new(),
    };
    let automation = match create_automation() {
        Some(value) => value,
        None => return Vec::new(),
    };
    let root = match unsafe { automation.ElementFromHandle(to_hwnd(window_handle)).ok() } {
        Some(value) => value,
        None => return Vec::new(),
    };
    let walker = match unsafe { automation.ControlViewWalker().ok() } {
        Some(value) => value,
        None => return Vec::new(),
    };

    let mut output = Vec::new();
    let mut visited = HashSet::new();
    collect_ui_elements_recursive(
        &root,
        &walker,
        window_handle,
        None,
        &mut visited,
        &mut output,
    );
    output
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
            let _ = CombineRgn(
                context.covered_region,
                context.covered_region,
                win_rgn,
                RGN_OR,
            );
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
                if IsWindowVisible(current).as_bool()
                    && val != ignore
                    && !is_cloaked(current)
                    && let Some(rect) = get_extended_frame_bounds(current)
                    && x >= rect.left
                    && x < rect.right
                    && y >= rect.top
                    && y < rect.bottom
                {
                    let ex_style = GetWindowLongW(current, GWL_EXSTYLE) as u32;
                    if (ex_style & WS_EX_TRANSPARENT.0) == 0 {
                        return get_window_info(current);
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
