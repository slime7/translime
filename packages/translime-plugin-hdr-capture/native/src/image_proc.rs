//! 图像处理模块
//!
//! 提供裁剪、Tone Mapping、编码等功能

use crate::{Rect, ToneMappingOptions};
use image::{ImageBuffer, ImageFormat, RgbImage, RgbaImage, DynamicImage};
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
    let v = value * exposure as f32;
    v / (1.0 + v) // Reinhard operator
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



