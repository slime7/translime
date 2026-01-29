//! HDR 截图工具 - Rust Native Addon
//!
//! 提供以下功能：
//! - HDR 屏幕捕获 (Desktop Duplication API)
//! - 窗口检测 (EnumWindows / GetWindowRect)
//! - 图像处理 (裁剪、Tone Mapping)

#![deny(clippy::all)]

mod capture;
mod image_proc;
mod window;

use napi_derive::napi;

/// 窗口信息结构
#[napi(object)]
pub struct WindowInfo {
    /// 窗口句柄 (HWND)
    pub handle: i64,
    /// 窗口标题
    pub title: String,
    /// 窗口类名
    pub class_name: String,
    /// 左边界
    pub left: i32,
    /// 上边界
    pub top: i32,
    /// 右边界
    pub right: i32,
    /// 下边界
    pub bottom: i32,
    /// 窗口宽度
    pub width: i32,
    /// 窗口高度
    pub height: i32,
}

/// 矩形区域
#[napi(object)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// Tone Mapping 选项
#[napi(object)]
pub struct ToneMappingOptions {
    /// 曝光值调整
    pub exposure: Option<f64>,
    /// 是否保留 HDR 元数据
    pub preserve_hdr_metadata: Option<bool>,
}

// ==================== 窗口检测 API ====================

/// 获取所有顶层窗口
#[napi]
pub fn get_top_level_windows() -> Vec<WindowInfo> {
    window::get_top_level_windows()
}

/// 获取指定坐标处的窗口
#[napi]
pub fn get_window_at_point(x: i32, y: i32) -> Option<WindowInfo> {
    window::get_window_at_point(x, y)
}

// ==================== 屏幕捕获 API ====================

/// 捕获指定显示器的屏幕 (返回 RGBA Buffer)
#[napi]
pub async fn capture_display(display_id: u32) -> napi::Result<napi::bindgen_prelude::Buffer> {
    capture::capture_display(display_id).map_err(|e| napi::Error::from_reason(e.to_string()))
}

/// 获取显示器列表
#[napi]
pub fn get_displays() -> Vec<capture::DisplayInfo> {
    capture::get_displays()
}

// ==================== 图像处理 API ====================

/// 裁剪图像
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

/// HDR 到 SDR 的 Tone Mapping
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

/// 编码图像为指定格式
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
