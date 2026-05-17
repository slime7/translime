//! HDR 截图工具 - Rust 原生扩展
//!
//! 该模块通过 N-API 暴露核心功能：
//! - HDR 屏幕捕获 (Windows Graphics Capture)
//! - 窗口探测 (枚举与遮挡检测)
//! - 图像处理 (裁剪、色调映射、编码)

#![deny(clippy::all)]

mod capture;
mod display_config;
mod image_proc;
mod sdr_proc;
mod window;

use napi_derive::napi;

/// 暴露给 JavaScript 的窗口信息结构
#[napi(object)]
pub struct WindowInfo {
    /// 窗口句柄 (HWND)
    pub handle: i64,
    /// 窗口标题
    pub title: String,
    /// 窗口类名
    pub class_name: String,
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
    pub width: i32,
    pub height: i32,
}

/// 暴露给 JavaScript 的界面元素信息结构
#[napi(object)]
pub struct UiElementInfo {
    /// 元素稳定标识
    pub id: String,
    /// 元素运行时 ID
    pub runtime_id: String,
    /// 元素名称
    pub name: String,
    /// 控件类型
    pub control_type: String,
    /// 类名
    pub class_name: String,
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
    pub width: i32,
    pub height: i32,
    /// 进程 ID
    pub process_id: u32,
    /// 所属窗口句柄
    pub window_handle: i64,
}

/// 矩形区域
#[napi(object)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// 色调映射 (Tone Mapping) 选项
#[napi(object)]
pub struct ToneMappingOptions {
    /// 曝光度调整值
    pub exposure: Option<f64>,
    /// 是否保留 HDR 元数据（某些格式支持）
    pub preserve_hdr_metadata: Option<bool>,
}

/// HDR 映射专用配置
#[napi(object)]
#[derive(Clone)]
pub struct HdrMappingOptions {
    /// 是否开启色彩映射
    pub enabled: Option<bool>,
    /// SDR 白点参考亮度 (nits)，默认为 203
    pub sdr_white_nits: Option<f64>,
    /// HDR 峰值亮度 (nits)，默认为 1000
    pub hdr_max_nits: Option<f64>,
    /// 是否导出原始 HDR 字节流（供后续保存为 EXR 等格式）
    pub preserve_raw: Option<bool>,
}

#[napi(object)]
pub struct DisplayColorInfo {
    pub sdr_white_level: u32,
    pub sdr_white_nits: f64,
    pub hdr_enabled: bool,
}

/// 屏幕捕获返回的综合结果
#[napi(object)]
pub struct CaptureResult {
    /// 处理后的图像数据 (RGBA8 缓冲区)
    pub buffer: napi::bindgen_prelude::Buffer,
    /// 图像物理宽度 (像素)
    pub width: u32,
    /// 图像物理高度 (像素)
    pub height: u32,
    /// 是否来源于 HDR 屏幕
    pub is_hdr: bool,
    /// 原始 HDR 数据 (F16 格式，仅在 preserve_raw 为开启时存在)
    pub raw_hdr_buffer: Option<napi::bindgen_prelude::Buffer>,
}

// --- 窗口探测相关 API ---

/// 获取所有的顶层可见窗口
#[napi]
pub fn get_top_level_windows() -> Vec<WindowInfo> {
    window::get_top_level_windows()
}

/// 获取指定屏幕坐标下的最前端窗口
#[napi]
pub fn get_window_at_point(x: i32, y: i32, ignore_handle: Option<i64>) -> Option<WindowInfo> {
    window::get_window_at_point(x, y, ignore_handle)
}

/// 获取指定屏幕坐标下的界面元素候选链（从内到外）
#[napi]
pub fn get_ui_element_candidates_at_point(
    x: i32,
    y: i32,
    ignore_handle: Option<i64>,
) -> Vec<UiElementInfo> {
    window::get_ui_element_candidates_at_point(x, y, ignore_handle)
}

/// 获取指定窗口下的全部界面元素
#[napi]
pub fn get_ui_elements_for_window(window_handle: i64) -> Vec<UiElementInfo> {
    window::get_ui_elements_for_window(window_handle)
}

/// 获取当前系统前台窗口句柄
#[napi]
pub fn get_foreground_window_handle() -> i64 {
    window::get_foreground_window_handle()
}

/// 将指定窗口恢复为系统前台窗口
#[napi]
pub fn set_foreground_window(handle: i64) -> bool {
    window::set_foreground_window(handle)
}

/// 将指定窗口提升到系统 topmost z-order
#[napi]
pub fn set_window_top_most(handle: i64) -> bool {
    window::set_window_top_most(handle)
}

// --- 屏幕捕获相关 API ---

/// 捕获指定显示器的当前画面
///
/// 返回包含图像数据及元数据的结果对象。
#[napi]
pub async fn capture_display(
    display_id: u32,
    hdr_options: Option<HdrMappingOptions>,
    capture_cursor: Option<bool>,
) -> napi::Result<CaptureResult> {
    capture::capture_display(display_id, hdr_options, capture_cursor)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 获取当前连接的所有显示器列表
#[napi]
pub fn get_displays() -> Vec<capture::DisplayInfo> {
    capture::get_displays()
}

#[napi]
pub fn get_display_color_info(display_id: u32) -> Option<DisplayColorInfo> {
    let display_name = capture::get_displays()
        .into_iter()
        .find(|display| display.id == display_id)
        .map(|display| display.name)?;
    let info = display_config::get_display_color_info(&display_name).ok()?;

    Some(DisplayColorInfo {
        sdr_white_level: info.sdr_white_level,
        sdr_white_nits: info.sdr_white_nits,
        hdr_enabled: info.hdr_enabled,
    })
}

// --- 图像处理相关 API ---

/// 根据给定矩形裁剪图像缓冲区
#[napi]
pub async fn crop_image(
    buffer: napi::bindgen_prelude::Buffer,
    width: u32,
    height: u32,
    rect: Rect,
) -> napi::Result<napi::bindgen_prelude::Buffer> {
    image_proc::crop_image(&buffer, width, height, &rect)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 对捕获的 HDR 数据执行后处理色调映射
#[napi]
pub async fn tone_map(
    hdr_buffer: napi::bindgen_prelude::Buffer,
    width: u32,
    height: u32,
    options: Option<ToneMappingOptions>,
) -> napi::Result<napi::bindgen_prelude::Buffer> {
    image_proc::tone_map(&hdr_buffer, width, height, options.as_ref())
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 将像素数据编码为特定格式（png, jpg, webp）
#[napi]
pub async fn encode_image(
    buffer: napi::bindgen_prelude::Buffer,
    width: u32,
    height: u32,
    format: String,
) -> napi::Result<napi::bindgen_prelude::Buffer> {
    image_proc::encode_image(&buffer, width, height, &format)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 调整图像大小到指定的分辨率
#[napi]
pub async fn resize_image(
    buffer: napi::bindgen_prelude::Buffer,
    width: u32,
    height: u32,
    new_width: u32,
    new_height: u32,
) -> napi::Result<napi::bindgen_prelude::Buffer> {
    image_proc::resize_image(&buffer, width, height, new_width, new_height)
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 将 F16 格式的原始 HDR 数据编码为高性能的 OpenEXR 文件
#[napi]
pub async fn encode_hdr_to_exr(
    raw_buffer: napi::bindgen_prelude::Buffer,
    width: u32,
    height: u32,
) -> napi::Result<napi::bindgen_prelude::Buffer> {
    image_proc::encode_hdr_to_exr(&raw_buffer, width, height)
        .map(|v| v.into())
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 在 F16 原始数据层级执行裁剪
#[napi]
pub async fn crop_hdr_f16(
    raw_buffer: napi::bindgen_prelude::Buffer,
    width: u32,
    height: u32,
    rect: Rect,
) -> napi::Result<napi::bindgen_prelude::Buffer> {
    image_proc::crop_hdr_f16(&raw_buffer, width, height, &rect)
        .map(|v| v.into())
        .map_err(|e| napi::Error::from_reason(e.to_string()))
}
