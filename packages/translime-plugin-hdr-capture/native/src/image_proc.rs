//! 图像处理模块
//!
//! 提供裁剪、Tone Mapping、编码等功能

use crate::{Rect, ToneMappingOptions};
use image::{ImageFormat, RgbImage, RgbaImage, DynamicImage};
use std::io::Cursor;

/// 图像包装函数：将 Buffer 转换为 DynamicImage，支持 RGB 和 RGBA
fn get_image(buffer: &[u8], width: u32, height: u32) -> Result<DynamicImage, Box<dyn std::error::Error>> {
    let len = buffer.len();
    if len == (width * height * 4) as usize {
        let img = RgbaImage::from_raw(width, height, buffer.to_vec())
            .ok_or("Failed to create RgbaImage")?;
        Ok(DynamicImage::ImageRgba8(img))
    } else if len == (width * height * 3) as usize {
        let img = RgbImage::from_raw(width, height, buffer.to_vec())
            .ok_or("Failed to create RgbImage")?;
        Ok(DynamicImage::ImageRgb8(img))
    } else {
        Err(format!("Invalid buffer length: {}, expected {} (RGBA) or {} (RGB)", 
            len, width * height * 4, width * height * 3).into())
    }
}

/// 加密：裁剪并返回最终 RGBA 图像
pub fn crop_image(
    buffer: &[u8],
    width: u32,
    height: u32,
    rect: &Rect,
) -> Result<napi::bindgen_prelude::Buffer, Box<dyn std::error::Error>> {
    let img = get_image(buffer, width, height)?;
    
    // 确保裁剪区域在图像范围内
    let crop_x = rect.x.max(0) as u32;
    let crop_y = rect.y.max(0) as u32;
    let crop_width = (rect.width as u32).min(width.saturating_sub(crop_x));
    let crop_height = (rect.height as u32).min(height.saturating_sub(crop_y));

    // 裁剪并保留原始色彩深度 (RGBA 或 RGB)
    let cropped = img.crop_imm(crop_x, crop_y, crop_width, crop_height);

    Ok(cropped.to_rgba8().into_raw().into())
}

/// 裁剪 HDR F16 格式的原始数据
/// 
/// 输入格式: RGBA F16 (每像素 8 字节)
/// 输出格式: 裁剪后的 RGBA F16 数据
pub fn crop_hdr_f16(
    buffer: &[u8],
    width: u32,
    height: u32,
    rect: &Rect,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    let bytes_per_pixel = 8; // F16 RGBA = 4 channels * 2 bytes
    let expected_size = (width * height * bytes_per_pixel) as usize;
    
    if buffer.len() != expected_size {
        return Err(format!(
            "Invalid F16 buffer size: got {}, expected {} ({}x{} @ {} bytes/pixel)",
            buffer.len(), expected_size, width, height, bytes_per_pixel
        ).into());
    }
    
    // 确保裁剪区域在图像范围内
    let crop_x = rect.x.max(0) as u32;
    let crop_y = rect.y.max(0) as u32;
    let crop_width = (rect.width as u32).min(width.saturating_sub(crop_x));
    let crop_height = (rect.height as u32).min(height.saturating_sub(crop_y));
    
    let mut result = Vec::with_capacity((crop_width * crop_height * bytes_per_pixel) as usize);
    
    let src_row_stride = (width * bytes_per_pixel) as usize;
    let crop_row_bytes = (crop_width * bytes_per_pixel) as usize;
    
    for row in 0..crop_height {
        let src_y = crop_y + row;
        let src_start = (src_y as usize * src_row_stride) + (crop_x as usize * bytes_per_pixel as usize);
        let src_end = src_start + crop_row_bytes;
        
        result.extend_from_slice(&buffer[src_start..src_end]);
    }
    
    Ok(result)
}

/// HDR 到 SDR 的 Tone Mapping (RGBA 支持)
pub fn tone_map(
    hdr_buffer: &[u8],
    width: u32,
    height: u32,
    options: Option<&ToneMappingOptions>,
) -> Result<napi::bindgen_prelude::Buffer, Box<dyn std::error::Error>> {
    let exposure = options.and_then(|o| o.exposure).unwrap_or(1.0);
    
    // 转换为 RGBA8 处理
    let mut img = get_image(hdr_buffer, width, height)?.to_rgba8();

    for pixel in img.pixels_mut() {
        pixel[0] = (apply_tone_curve(pixel[0] as f32 / 255.0, exposure) * 255.0).clamp(0.0, 255.0) as u8;
        pixel[1] = (apply_tone_curve(pixel[1] as f32 / 255.0, exposure) * 255.0).clamp(0.0, 255.0) as u8;
        pixel[2] = (apply_tone_curve(pixel[2] as f32 / 255.0, exposure) * 255.0).clamp(0.0, 255.0) as u8;
        // Alpha 不变
    }

    Ok(img.into_raw().into())
}

/// 应用 Reinhard Tone Curve
fn apply_tone_curve(value: f32, exposure: f64) -> f32 {
    let x = value * exposure as f32;
    // 使用更高白点的 Reinhard，使 1.0 映射到约 0.8 以上
    (x * (1.0 + x / 16.0)) / (1.0 + x)
}

/// 编码图像为指定格式
pub fn encode_image(
    buffer: &[u8],
    width: u32,
    height: u32,
    format: &str,
) -> Result<napi::bindgen_prelude::Buffer, Box<dyn std::error::Error>> {
    let img = get_image(buffer, width, height)?;
    let mut output = Cursor::new(Vec::new());

    match format.to_lowercase().as_str() {
        "png" => {
            img.to_rgba8().write_to(&mut output, ImageFormat::Png)?;
        }
        "jpg" | "jpeg" => {
            // JPEG 不支持 Alpha 通道，转换为 Rgb8
            img.to_rgb8().write_to(&mut output, ImageFormat::Jpeg)?;
        }
        "webp" => {
            img.to_rgba8().write_to(&mut output, ImageFormat::WebP)?;
        }
        _ => return Err(format!("Unsupported format: {}", format).into()),
    };

    Ok(output.into_inner().into())
}



/// 调整图像大小
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

/// 处理 F16 格式的一行数据 (根据配置决定使用 Tone Mapping 或简单 Clip)
pub fn process_f16_row(src: &[u16], dest: &mut Vec<u8>, hdr_options: Option<&crate::HdrMappingOptions>) {
    // 从配置中提取 nits 参数，使用默认值作为回退
    let mapping_enabled = hdr_options
        .and_then(|o| o.enabled)
        .unwrap_or(true);
    let sdr_white_nits = hdr_options
        .and_then(|o| o.sdr_white_nits)
        .unwrap_or(203.0) as f32;
    let hdr_max_nits = hdr_options
        .and_then(|o| o.hdr_max_nits)
        .unwrap_or(1000.0) as f32;
    
    for pixel in src.chunks(4) {
        // 将 F16 转换为线性 scRGB 浮点值
        let r_linear = f16_to_linear(pixel[0]);
        let g_linear = f16_to_linear(pixel[1]);
        let b_linear = f16_to_linear(pixel[2]);
        
        let (r_sdr, g_sdr, b_sdr) = if mapping_enabled {
            // 使用 OBS 风格的 maxRGB Tone Mapping
            hdr_to_sdr_maxrgb_with_params(r_linear, g_linear, b_linear, sdr_white_nits, hdr_max_nits)
        } else {
            // 不进行 Tone Mapping，仅根据 SDR 白点进行简单的裁剪
            hdr_to_sdr_simple_clamp(r_linear, g_linear, b_linear, sdr_white_nits)
        };
        
        dest.push(r_sdr);
        dest.push(g_sdr);
        dest.push(b_sdr);
        dest.push(255);
    }
}

/// 处理 10bit (R10G10B10A2) 格式的一行数据
pub fn process_10bit_row(src: &[u32], dest: &mut Vec<u8>, is_hdr: bool, hdr_options: Option<&crate::HdrMappingOptions>) {
    // 从配置中提取 nits 参数
    let mapping_enabled = hdr_options
        .and_then(|o| o.enabled)
        .unwrap_or(true);
    let sdr_white_nits = hdr_options
        .and_then(|o| o.sdr_white_nits)
        .unwrap_or(203.0) as f32;
    let hdr_max_nits = hdr_options
        .and_then(|o| o.hdr_max_nits)
        .unwrap_or(1000.0) as f32;
    
    for &pixel in src {
        // 10 bits R, G, B, 2 bits A
        let r_raw = (pixel & 0x3FF) as f32 / 1023.0;
        let g_raw = ((pixel >> 10) & 0x3FF) as f32 / 1023.0;
        let b_raw = ((pixel >> 20) & 0x3FF) as f32 / 1023.0;
        
        if is_hdr {
            // HDR 模式
            let (r_sdr, g_sdr, b_sdr) = if mapping_enabled {
                hdr_to_sdr_maxrgb_with_params(r_raw, g_raw, b_raw, sdr_white_nits, hdr_max_nits)
            } else {
                hdr_to_sdr_simple_clamp(r_raw, g_raw, b_raw, sdr_white_nits)
            };
            dest.push(r_sdr);
            dest.push(g_sdr);
            dest.push(b_sdr);
        } else {
            // SDR 模式：直接线性映射到 8bit
            dest.push((r_raw * 255.0).clamp(0.0, 255.0) as u8);
            dest.push((g_raw * 255.0).clamp(0.0, 255.0) as u8);
            dest.push((b_raw * 255.0).clamp(0.0, 255.0) as u8);
        }
        dest.push(255);
    }
}

/// 简单的 HDR 到 SDR 裁剪转换 (不使用 Tone Mapping)
/// 仅根据 SDR 白点缩放并截断超过部分
fn hdr_to_sdr_simple_clamp(r: f32, g: f32, b: f32, sdr_white_nits: f32) -> (u8, u8, u8) {
    let sdr_white = sdr_white_nits / 80.0;
    
    let r_mapped = (r / sdr_white).clamp(0.0, 1.0);
    let g_mapped = (g / sdr_white).clamp(0.0, 1.0);
    let b_mapped = (b / sdr_white).clamp(0.0, 1.0);
    
    let r_srgb = linear_to_srgb(r_mapped);
    let g_srgb = linear_to_srgb(g_mapped);
    let b_srgb = linear_to_srgb(b_mapped);
    
    ((r_srgb * 255.0) as u8, (g_srgb * 255.0) as u8, (b_srgb * 255.0) as u8)
}

/// OBS 风格的 maxRGB HDR 到 SDR 色调映射 (使用可配置的 nits 参数)
/// 
/// 参数说明:
/// - `sdr_white_nits`: SDR 白点亮度，Windows 默认约 203 nits
/// - `hdr_max_nits`: HDR 内容的峰值亮度，通常 1000 nits
/// 
/// scRGB 换算: nits / 80 = scRGB 值
fn hdr_to_sdr_maxrgb_with_params(r: f32, g: f32, b: f32, sdr_white_nits: f32, hdr_max_nits: f32) -> (u8, u8, u8) {
    // 转换为 scRGB 单位
    let sdr_white = sdr_white_nits / 80.0;
    let hdr_max = hdr_max_nits / 80.0;
    
    // 找到最大通道值 (maxRGB 算法的核心)
    let max_channel = r.max(g).max(b);
    
    if max_channel <= 0.0001 {
        return (0, 0, 0);
    }
    
    // 使用 Reinhard 全局色调映射
    // 公式: L_out = L_in / (1 + L_in / L_white)
    // 
    // 计算相对于 SDR 白点的亮度
    let luma_in = max_channel / sdr_white;
    
    // Reinhard 压缩，使用 HDR_MAX/SDR_WHITE 作为白点参数
    let white_point = hdr_max / sdr_white;
    let luma_out = luma_in * (1.0 + luma_in / (white_point * white_point)) / (1.0 + luma_in);
    
    // 计算缩放比例 (保持色彩比例)
    let scale = if luma_in > 0.0001 { luma_out / luma_in } else { 1.0 };
    
    // 应用缩放并归一化到 0-1
    let r_mapped = (r / sdr_white * scale).clamp(0.0, 1.0);
    let g_mapped = (g / sdr_white * scale).clamp(0.0, 1.0);
    let b_mapped = (b / sdr_white * scale).clamp(0.0, 1.0);
    
    // 应用 sRGB gamma
    let r_srgb = linear_to_srgb(r_mapped);
    let g_srgb = linear_to_srgb(g_mapped);
    let b_srgb = linear_to_srgb(b_mapped);
    
    (
        (r_srgb * 255.0) as u8,
        (g_srgb * 255.0) as u8,
        (b_srgb * 255.0) as u8,
    )
}

/// 线性到 sRGB gamma 转换
#[inline]
fn linear_to_srgb(linear: f32) -> f32 {
    if linear <= 0.0031308 {
        linear * 12.92
    } else {
        1.055 * linear.powf(1.0 / 2.4) - 0.055
    }
}

/// 将 IEEE 754 binary16 (FP16) 转换为线性浮点值
/// 
/// 注意：此函数仅做格式转换，不进行任何 Tone Mapping
#[inline]
fn f16_to_linear(val: u16) -> f32 {
    // 提取符号、指数、尾数 (IEEE 754 binary16)
    let sign = (val >> 15) & 0x1;
    let exp = (val >> 10) & 0x1F;
    let frac = val & 0x3FF;

    let f = if exp == 0 {
        // 次正规数 (Subnormal)
        if frac == 0 { 0.0 } else { (frac as f32) * 2.0f32.powi(-14 - 10) }
    } else if exp == 0x1F {
        // 无穷大或 NaN，将其限制为 1.0
        if frac == 0 { if sign == 0 { 100.0 } else { 0.0 } } else { 1.0 }
    } else {
        // 正规数
        (1.0 + (frac as f32) / 1024.0) * 2.0f32.powi(exp as i32 - 15)
    };

    // 返回正数值 (scRGB 可以有负值，但我们这里只处理正值)
    if sign == 1 { 0.0 } else { f.max(0.0) }
}

/// 将原始 HDR F16 数据编码为 EXR 格式
/// 
/// 输入格式: RGBA F16 (每像素 8 字节)
/// 输出格式: OpenEXR 文件字节流
pub fn encode_hdr_to_exr(
    raw_buffer: &[u8],
    width: u32,
    height: u32,
) -> Result<Vec<u8>, Box<dyn std::error::Error>> {
    use exr::prelude::*;
    
    let width = width as usize;
    let height = height as usize;
    
    // 验证缓冲区大小 (F16 格式: 每像素 8 字节 = 2 bytes * 4 channels)
    let expected_size = width * height * 8;
    if raw_buffer.len() != expected_size {
        return Err(format!(
            "Invalid buffer size: got {}, expected {} ({}x{} @ 8 bytes/pixel)",
            raw_buffer.len(), expected_size, width, height
        ).into());
    }
    
    // 将 F16 字节转换为 f32 RGB 像素数据 (EXR 使用 f32)
    // scRGB 参考: 1.0 = 80 nits, 所以不需要额外的亮度调整
    let mut pixels: Vec<(f32, f32, f32)> = Vec::with_capacity(width * height);
    
    for y in 0..height {
        for x in 0..width {
            let pixel_offset = (y * width + x) * 8; // 8 bytes per pixel
            
            // 读取 F16 值 (little-endian)
            let r_f16 = u16::from_le_bytes([raw_buffer[pixel_offset], raw_buffer[pixel_offset + 1]]);
            let g_f16 = u16::from_le_bytes([raw_buffer[pixel_offset + 2], raw_buffer[pixel_offset + 3]]);
            let b_f16 = u16::from_le_bytes([raw_buffer[pixel_offset + 4], raw_buffer[pixel_offset + 5]]);
            // Alpha 通道忽略，EXR 只保存 RGB
            
            // 转换为 f32
            let r = f16_to_linear(r_f16);
            let g = f16_to_linear(g_f16);
            let b = f16_to_linear(b_f16);
            
            pixels.push((r, g, b));
        }
    }
    
    // 创建 EXR 图像并编码到内存
    let mut output_bytes: Vec<u8> = Vec::new();
    
    // 使用 exr crate 创建 EXR 文件
    let layer = Layer::new(
        (width, height),
        LayerAttributes::named("HDR Capture"),
        Encoding::SMALL_LOSSLESS,
        SpecificChannels::rgb(|pos: Vec2<usize>| {
            let idx = pos.y() * width + pos.x();
            pixels[idx]
        }),
    );
    
    let image = Image::from_layer(layer);
    image.write().to_buffered(&mut std::io::Cursor::new(&mut output_bytes))?;
    
    Ok(output_bytes)
}
