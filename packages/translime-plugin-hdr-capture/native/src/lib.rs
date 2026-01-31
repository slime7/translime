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

/// HDR 映射配置选项
#[napi(object)]
#[derive(Clone)]
pub struct HdrMappingOptions {
    /// 是否启用自定义 HDR 映射
    pub enabled: Option<bool>,
    /// SDR 白点亮度 (nits)，默认 203
    pub sdr_white_nits: Option<f64>,
    /// HDR 峰值亮度 (nits)，默认 1000
    pub hdr_max_nits: Option<f64>,
    /// 是否同时保留原始 HDR 数据（用于后续保存 HDR 原始文件）
    pub preserve_raw: Option<bool>,
}

/// 屏幕捕获结果
#[napi(object)]
pub struct CaptureResult {
    /// 图像数据 (RGBA，经过 Tone Mapping)
    pub buffer: napi::bindgen_prelude::Buffer,
    /// 实际图像宽度 (物理像素)
    pub width: u32,
    /// 实际图像高度 (物理像素)
    pub height: u32,
    /// 是否为 HDR 源数据（经过 Tonemap）
    pub is_hdr: bool,
    /// 原始 HDR 数据 (可选，仅当 preserve_raw 为 true 且为 HDR 屏幕时存在)
    /// 保存为 RGBA Float16 或 10bit 原始格式的字节流
    pub raw_hdr_buffer: Option<napi::bindgen_prelude::Buffer>,
}

// ==================== 窗口检测 API ====================

/// 获取所有顶层窗口
#[napi]
pub fn get_top_level_windows() -> Vec<WindowInfo> {
    window::get_top_level_windows()
}

/// 获取指定坐标处的窗口
#[napi]
pub fn get_window_at_point(x: i32, y: i32, ignore_handle: Option<i64>) -> Option<WindowInfo> {
    window::get_window_at_point(x, y, ignore_handle)
}

// ==================== 屏幕捕获 API ====================

/// 捕获指定显示器的屏幕 (返回 RGBA 结果对象)
/// 
/// `hdr_options` - 可选的 HDR 映射配置，用于自定义色调映射参数
#[napi]
pub async fn capture_display(display_id: u32, hdr_options: Option<HdrMappingOptions>) -> napi::Result<CaptureResult> {
    capture::capture_display(display_id, hdr_options).map_err(|e| napi::Error::from_reason(e.to_string()))
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

/// 调整图像大小
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

/// 将原始 HDR F16 数据编码为 EXR 格式
/// 
/// 输入: RGBA F16 格式的原始 HDR 数据 (每像素 8 字节)
/// 输出: OpenEXR 文件字节流
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

/// 裁剪 HDR F16 格式的原始数据
/// 
/// 输入: RGBA F16 格式的原始 HDR 数据 (每像素 8 字节)
/// 输出: 裁剪后的 RGBA F16 数据
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
