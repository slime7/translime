//! 图像处理模块
//!
//! 提供图像裁剪、色彩空间转换 (Tone Mapping)、格式编码及缩放等核心功能。

use crate::{Rect, ToneMappingOptions};
use image::{ImageFormat, RgbImage, RgbaImage, DynamicImage};
use std::io::Cursor;
use rayon::prelude::*;

/// 将原始字节缓冲区转换为 DynamicImage 对象
/// 支持自动识别和校验 RGB8 与 RGBA8 格式
fn get_image(buffer: &[u8], width: u32, height: u32) -> Result<DynamicImage, Box<dyn std::error::Error>> {
    let len = buffer.len();
    if len == (width * height * 4) as usize {
        let img = RgbaImage::from_raw(width, height, buffer.to_vec())
            .ok_or("创建 RgbaImage 失败：数据长度不匹配")?;
        Ok(DynamicImage::ImageRgba8(img))
    } else if len == (width * height * 3) as usize {
        let img = RgbImage::from_raw(width, height, buffer.to_vec())
            .ok_or("创建 RgbImage 失败：数据长度不匹配")?;
        Ok(DynamicImage::ImageRgb8(img))
    } else {
        Err(format!(
            "无效的缓冲区长度：收到 {} 字节，期望 {} (RGBA) 或 {} (RGB)", 
            len, width * height * 4, width * height * 3
        ).into())
    }
}

/// 裁剪 RGBA 或 RGB 图像并返回 NAPI 缓冲区
pub fn crop_image(
    buffer: &[u8],
    width: u32,
    height: u32,
    rect: &Rect,
) -> Result<napi::bindgen_prelude::Buffer, Box<dyn std::error::Error>> {
    let img = get_image(buffer, width, height)?;
    
    // 限制裁剪范围，防止超出图像边界
    let crop_x = rect.x.max(0) as u32;
    let crop_y = rect.y.max(0) as u32;
    let crop_width = (rect.width as u32).min(width.saturating_sub(crop_x));
    let crop_height = (rect.height as u32).min(height.saturating_sub(crop_y));

    let cropped = img.crop_imm(crop_x, crop_y, crop_width, crop_height);
    Ok(cropped.to_rgba8().into_raw().into())
}

/// 裁剪 HDR F16 (RGBA) 格式的原始数据
pub fn crop_hdr_f16(
    buffer: &[u8],
    width: u32,
    height: u32,
    rect: &Rect,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    const BYTES_PER_PIXEL: usize = 8; // F16 RGBA = 4 通道 * 2 字节
    let expected_size = (width * height) as usize * BYTES_PER_PIXEL;
    
    if buffer.len() != expected_size {
        return Err(format!("F16 缓冲区大小不正确：got {}, expected {}", buffer.len(), expected_size).into());
    }
    
    let crop_x = rect.x.max(0) as u32;
    let crop_y = rect.y.max(0) as u32;
    let crop_width = (rect.width as u32).min(width.saturating_sub(crop_x));
    let crop_height = (rect.height as u32).min(height.saturating_sub(crop_y));
    
    let mut result = Vec::with_capacity((crop_width * crop_height) as usize * BYTES_PER_PIXEL);
    let src_stride = width as usize * BYTES_PER_PIXEL;
    let row_bytes = crop_width as usize * BYTES_PER_PIXEL;
    
    for row in 0..crop_height {
        let src_y = crop_y + row;
        let start = (src_y as usize * src_stride) + (crop_x as usize * BYTES_PER_PIXEL);
        result.extend_from_slice(&buffer[start..start + row_bytes]);
    }
    
    Ok(result)
}

/// 执行简单的 Reinhard 色调映射 (Tone Mapping)
pub fn tone_map(
    hdr_buffer: &[u8],
    width: u32,
    height: u32,
    options: Option<&ToneMappingOptions>,
) -> Result<napi::bindgen_prelude::Buffer, Box<dyn std::error::Error>> {
    let exposure = options.and_then(|o| o.exposure).unwrap_or(1.0);
    let mut img = get_image(hdr_buffer, width, height)?.to_rgba8();

    for pixel in img.pixels_mut() {
        pixel[0] = (apply_tone_curve(pixel[0] as f32 / 255.0, exposure) * 255.0).clamp(0.0, 255.0) as u8;
        pixel[1] = (apply_tone_curve(pixel[1] as f32 / 255.0, exposure) * 255.0).clamp(0.0, 255.0) as u8;
        pixel[2] = (apply_tone_curve(pixel[2] as f32 / 255.0, exposure) * 255.0).clamp(0.0, 255.0) as u8;
    }

    Ok(img.into_raw().into())
}

/// Reinhard 色调曲线应用函数
fn apply_tone_curve(value: f32, exposure: f64) -> f32 {
    let x = value * exposure as f32;
    // 带有高白点修正的 Reinhard 公式，使整体亮度更通透
    (x * (1.0 + x / 16.0)) / (1.0 + x)
}

/// 将图像编码为 PNG、JPG 或 WebP 格式
pub fn encode_image(
    buffer: &[u8],
    width: u32,
    height: u32,
    format: &str,
) -> Result<napi::bindgen_prelude::Buffer, Box<dyn std::error::Error>> {
    let img = get_image(buffer, width, height)?;
    let mut output = Cursor::new(Vec::new());

    match format.to_lowercase().as_str() {
        "png" => img.to_rgba8().write_to(&mut output, ImageFormat::Png)?,
        "jpg" | "jpeg" => img.to_rgb8().write_to(&mut output, ImageFormat::Jpeg)?,
        "webp" => img.to_rgba8().write_to(&mut output, ImageFormat::WebP)?,
        _ => return Err(format!("不支持的图像格式: {}", format).into()),
    };

    Ok(output.into_inner().into())
}

/// 调整图像分辨率，使用 Lanczos3 滤波保证缩放质量
pub fn resize_image(
    buffer: &[u8],
    width: u32,
    height: u32,
    new_width: u32,
    new_height: u32,
) -> Result<napi::bindgen_prelude::Buffer, Box<dyn std::error::Error>> {
    let img = get_image(buffer, width, height)?;
    let resized = img.resize_exact(new_width, new_height, image::imageops::FilterType::Lanczos3);
    Ok(resized.to_rgba8().into_raw().into())
}

/// 并行处理 F16 (scRGB) 缓冲区，转换为可显示的 SDR (sRGB) 数据
pub fn process_f16_buffer_parallel(
    src: &[u8], 
    width: u32, 
    height: u32, 
    hdr_options: Option<&crate::HdrMappingOptions>
) -> Vec<u8> {
    let mapping_enabled = hdr_options.and_then(|o| o.enabled).unwrap_or(true);
    let sdr_white_nits = hdr_options.and_then(|o| o.sdr_white_nits).unwrap_or(203.0) as f32;
    let hdr_max_nits = hdr_options.and_then(|o| o.hdr_max_nits).unwrap_or(1000.0) as f32;

    let width_usize = width as usize;
    let height_usize = height as usize;
    let mut dest = vec![0u8; width_usize * height_usize * 4];
    
    let src_stride = width_usize * 8;
    let dest_stride = width_usize * 4;

    // 按行并行处理，减少调度开销并提高缓存亲和性
    dest.par_chunks_mut(dest_stride)
        .enumerate()
        .for_each(|(y, row_dest)| {
            let src_row_offset = y * src_stride;
            if src_row_offset + src_stride <= src.len() {
                let src_row = &src[src_row_offset..src_row_offset + src_stride];
                
                for x in 0..width_usize {
                    let s_off = x * 8;
                    // 从小端字节序还原 FP16 原始数据
                    let r_f16 = u16::from_ne_bytes([src_row[s_off], src_row[s_off+1]]);
                    let g_f16 = u16::from_ne_bytes([src_row[s_off+2], src_row[s_off+3]]);
                    let b_f16 = u16::from_ne_bytes([src_row[s_off+4], src_row[s_off+5]]);
                    
                    let r_lin = f16_to_linear(r_f16);
                    let g_lin = f16_to_linear(g_f16);
                    let b_lin = f16_to_linear(b_f16);

                    let (r, g, b) = if mapping_enabled {
                        hdr_to_sdr_maxrgb(r_lin, g_lin, b_lin, sdr_white_nits, hdr_max_nits)
                    } else {
                        hdr_to_sdr_simple_clamp(r_lin, g_lin, b_lin, sdr_white_nits)
                    };

                    let d_off = x * 4;
                    row_dest[d_off] = r;
                    row_dest[d_off+1] = g;
                    row_dest[d_off+2] = b;
                    row_dest[d_off+3] = 255;
                }
            }
        });

    dest
}

/// 基础的 HDR 到 SDR 裁剪（仅缩放并截断）
fn hdr_to_sdr_simple_clamp(r: f32, g: f32, b: f32, sdr_white_nits: f32) -> (u8, u8, u8) {
    let sdr_white = sdr_white_nits / 80.0;
    
    let r_srgb = linear_to_srgb((r / sdr_white).clamp(0.0, 1.0));
    let g_srgb = linear_to_srgb((g / sdr_white).clamp(0.0, 1.0));
    let b_srgb = linear_to_srgb((b / sdr_white).clamp(0.0, 1.0));
    
    ((r_srgb * 255.0) as u8, (g_srgb * 255.0) as u8, (b_srgb * 255.0) as u8)
}

/// 基于 maxRGB 算法的 HDR 到 SDR 色调映射 (OBS 风格)
/// 
/// scRGB 换算规则: nits / 80 = scRGB 亮度单位
fn hdr_to_sdr_maxrgb(r: f32, g: f32, b: f32, sdr_white_nits: f32, hdr_max_nits: f32) -> (u8, u8, u8) {
    let sdr_white = sdr_white_nits / 80.0;
    let hdr_max = hdr_max_nits / 80.0;
    
    let max_ch = r.max(g).max(b);
    if max_ch <= 0.0001 { return (0, 0, 0); }
    
    // 计算输入亮度相对于 SDR 白点的比例
    let luma_in = max_ch / sdr_white;
    let white_pt = hdr_max / sdr_white;
    
    // Reinhard 映射公式：保持色彩比例的同时压缩高亮区域
    let luma_out = luma_in * (1.0 + luma_in / (white_pt * white_pt)) / (1.0 + luma_in);
    let scale = luma_out / luma_in;
    
    let r_srgb = linear_to_srgb((r / sdr_white * scale).clamp(0.0, 1.0));
    let g_srgb = linear_to_srgb((g / sdr_white * scale).clamp(0.0, 1.0));
    let b_srgb = linear_to_srgb((b / sdr_white * scale).clamp(0.0, 1.0));
    
    ((r_srgb * 255.0) as u8, (g_srgb * 255.0) as u8, (b_srgb * 255.0) as u8)
}

/// 线性色彩值到 sRGB Gamma 空间的转换
#[inline]
fn linear_to_srgb(linear: f32) -> f32 {
    if linear <= 0.0031308 {
        linear * 12.92
    } else {
        1.055 * linear.powf(1.0 / 2.4) - 0.055
    }
}

/// 将 IEEE 754 binary16 (FP16) 编码的字节转换为 f32 线性值
#[inline]
fn f16_to_linear(val: u16) -> f32 {
    let sign = (val >> 15) & 0x1;
    let exp = (val >> 10) & 0x1F;
    let frac = val & 0x3FF;

    let f = if exp == 0 {
        if frac == 0 { 0.0 } else { (frac as f32) * 2.0f32.powi(-24) }
    } else if exp == 0x1F {
        if frac == 0 { if sign == 0 { 100.0 } else { 0.0 } } else { 1.0 }
    } else {
        (1.0 + (frac as f32) / 1024.0) * 2.0f32.powi(exp as i32 - 15)
    };

    if sign == 1 { 0.0 } else { f.max(0.0) }
}

/// 将原始 HDR F16 数据编码为 OpenEXR 格式
pub fn encode_hdr_to_exr(
    raw_buffer: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    use exr::prelude::*;
    
    let width = width as usize;
    let height = height as usize;
    
    let expected_size = width * height * 8;
    if raw_buffer.len() != expected_size {
        return Err(format!("EXR 编码失败：缓冲区大小不匹配").into());
    }
    
    // 预分配像素数组，EXR crate 通常期望 f32 的 RGB 三元组
    let mut pixels: Vec<(f32, f32, f32)> = Vec::with_capacity(width * height);
    
    for y in 0..height {
        for x in 0..width {
            let off = (y * width + x) * 8;
            let r_f16 = u16::from_le_bytes([raw_buffer[off], raw_buffer[off + 1]]);
            let g_f16 = u16::from_le_bytes([raw_buffer[off + 2], raw_buffer[off + 3]]);
            let b_f16 = u16::from_le_bytes([raw_buffer[off + 4], raw_buffer[off + 5]]);
            pixels.push((f16_to_linear(r_f16), f16_to_linear(g_f16), f16_to_linear(b_f16)));
        }
    }
    
    let mut out: Vec<u8> = Vec::new();
    let layer = Layer::new(
        (width, height),
        LayerAttributes::named("HDR Capture"),
        Encoding::SMALL_LOSSLESS,
        SpecificChannels::rgb(|pos: Vec2<usize>| {
            pixels[pos.y() * width + pos.x()]
        }),
    );
    
    Image::from_layer(layer).write().to_buffered(&mut Cursor::new(&mut out))?;
    Ok(out)
}
