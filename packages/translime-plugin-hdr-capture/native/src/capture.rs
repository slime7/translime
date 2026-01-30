//! HDR 屏幕捕获模块
//!
//! 使用 Windows Desktop Duplication API 捕获屏幕

use napi_derive::napi;
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D,
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
    D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
use windows::Win32::Graphics::Dxgi::Common::{
    DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_FORMAT_B8G8R8A8_UNORM_SRGB, DXGI_FORMAT_R16G16B16A16_FLOAT,
    DXGI_FORMAT_R10G10B10A2_UNORM, DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter, IDXGIFactory1, IDXGIOutput, IDXGIOutput1, IDXGIOutput6,
    IDXGIResource, DXGI_OUTDUPL_FRAME_INFO,
};
use windows::core::Interface;

/// 显示器信息
#[napi(object)]
pub struct DisplayInfo {
    /// 显示器索引
    pub id: u32,
    /// 显示器名称
    pub name: String,
    /// 左边界
    pub x: i32,
    /// 上边界
    pub y: i32,
    /// 宽度
    pub width: u32,
    /// 高度
    pub height: u32,
    /// 是否主显示器
    pub is_primary: bool,
}

/// 获取所有显示器信息
pub fn get_displays() -> Vec<DisplayInfo> {
    let mut displays = Vec::new();

    unsafe {
        let factory: IDXGIFactory1 = match CreateDXGIFactory1() {
            Ok(f) => f,
            Err(_) => return displays,
        };

        let mut adapter_idx = 0u32;
        while let Ok(adapter) = factory.EnumAdapters(adapter_idx) {
            let mut output_idx = 0u32;
            while let Ok(output) = adapter.EnumOutputs(output_idx) {
                if let Ok(desc) = output.GetDesc() {
                    let name_len = desc.DeviceName.iter().position(|&c| c == 0).unwrap_or(desc.DeviceName.len());
                    let name = String::from_utf16_lossy(&desc.DeviceName[..name_len]);

                    let x = desc.DesktopCoordinates.left;
                    let y = desc.DesktopCoordinates.top;
                    let width = (desc.DesktopCoordinates.right - desc.DesktopCoordinates.left) as u32;
                    let height = (desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top) as u32;

                    displays.push(DisplayInfo {
                        id: displays.len() as u32,
                        name,
                        x,
                        y,
                        width,
                        height,
                        is_primary: adapter_idx == 0 && output_idx == 0,
                    });
                }
                output_idx += 1;
            }
            adapter_idx += 1;
        }
    }

    displays
}

/// 捕获指定显示器的屏幕
pub fn capture_display(display_id: u32) -> Result<crate::CaptureResult, Box<dyn std::error::Error>> {
    unsafe {
        // 创建 DXGI Factory
        let factory: IDXGIFactory1 = CreateDXGIFactory1()?;

        // 查找目标显示器
        let mut current_id = 0u32;
        let mut target_output: Option<IDXGIOutput> = None;
        let mut target_adapter: Option<IDXGIAdapter> = None;

        let mut adapter_idx = 0u32;
        'outer: while let Ok(adapter) = factory.EnumAdapters(adapter_idx) {
            let mut output_idx = 0u32;
            while let Ok(output) = adapter.EnumOutputs(output_idx) {
                if current_id == display_id {
                    target_output = Some(output);
                    target_adapter = Some(adapter);
                    break 'outer;
                }
                current_id += 1;
                output_idx += 1;
            }
            adapter_idx += 1;
        }

        let output = target_output.ok_or("Display not found")?;
        let adapter = target_adapter.ok_or("Adapter not found")?;

        // 创建 D3D11 设备
        let mut device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;

        D3D11CreateDevice(
            &adapter,
            D3D_DRIVER_TYPE_UNKNOWN,
            None,
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;

        let device = device.ok_or("Failed to create D3D11 device")?;
        let context = context.ok_or("Failed to get device context")?;

        // 获取描述（由于后续 cast 可能移动，先执行）
        let output_desc = output.GetDesc()?;
        
        let (duplication, is_output6) = {
            // 尝试 IDXGIOutput6
            if let Ok(output6) = output.clone().cast::<IDXGIOutput6>() {
                let formats = [
                    DXGI_FORMAT_R16G16B16A16_FLOAT,
                    DXGI_FORMAT_B8G8R8A8_UNORM,
                    DXGI_FORMAT_R10G10B10A2_UNORM,
                ];
                match output6.DuplicateOutput1(&device, 0, &formats) {
                    Ok(dupl) => (dupl, true),
                    Err(_) => {
                        let output1: IDXGIOutput1 = output.clone().cast()?;
                        (output1.DuplicateOutput(&device)?, false)
                    }
                }
            } else {
                let output1: IDXGIOutput1 = output.clone().cast()?;
                (output1.DuplicateOutput(&device)?, false)
            }
        };

        println!("[HDR-Native] Display {} using Output6 (scRGB supported): {}", display_id, is_output6);
        let mut duplication = duplication;

        let dupl_desc = duplication.GetDesc();
        let pixel_format = dupl_desc.ModeDesc.Format;
        
        // 优先使用 duplication desc 的物理尺寸，如果为 0 则通过 DesktopCoordinates 兜底
        let mut width = dupl_desc.ModeDesc.Width;
        let mut height = dupl_desc.ModeDesc.Height;
        
        if width == 0 || height == 0 {
            width = (output_desc.DesktopCoordinates.right - output_desc.DesktopCoordinates.left).abs() as u32;
            height = (output_desc.DesktopCoordinates.bottom - output_desc.DesktopCoordinates.top).abs() as u32;
        }

        println!("[HDR-Native] Display {} Format: {:?}, Buffer Size: {}x{}", display_id, pixel_format, width, height);

        // 判断是否为 HDR 格式
        let is_hdr_format = pixel_format == DXGI_FORMAT_R16G16B16A16_FLOAT || pixel_format == DXGI_FORMAT_R10G10B10A2_UNORM;
        println!("[HDR-Native] Display {} is HDR: {}", display_id, is_hdr_format);

        // 创建 staging texture
        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: pixel_format,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };

        let mut staging_texture = None;
        device.CreateTexture2D(&staging_desc, None, Some(&mut staging_texture))?;
        let staging_texture = staging_texture.ok_or("Failed to create staging texture")?;
        let staging_resource: ID3D11Resource = staging_texture.cast()?;

        // 捕获循环：尝试获取一个非空帧
        let mut final_buffer = Vec::new();
        let mut retry_count = 0;
        
        while retry_count < 30 {
            let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
            let mut desktop_resource: Option<IDXGIResource> = None;
            
            // 阶梯式轮询：前 15 次快速 (10ms)，后 10 次深度 (100ms)
            let timeout = if retry_count < 15 { 10 } else { 100 };
            
            match duplication.AcquireNextFrame(timeout, &mut frame_info, &mut desktop_resource) {
                Ok(_) => {
                    if let Some(resource) = desktop_resource {
                        let desktop_texture: ID3D11Texture2D = resource.cast()?;
                        context.CopyResource(&staging_resource, &desktop_texture.cast::<ID3D11Resource>()?);
                        
                        // 强制刷新指令流，确保数据从 GPU 写入 Staging Texture
                        context.Flush();
                        
                        // 映射并读取
                        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
                        context.Map(&staging_resource, 0, D3D11_MAP_READ, 0, Some(&mut mapped))?;
                        
                        let row_pitch = mapped.RowPitch as usize;
                        let mut temp_buffer = Vec::with_capacity((width * height * 4) as usize);

                        for row in 0..height {
                            let src = (mapped.pData as *const u8).add(row as usize * row_pitch);
                            
                            if pixel_format == DXGI_FORMAT_R16G16B16A16_FLOAT {
                                let row_data = std::slice::from_raw_parts(src as *const u16, (width * 4) as usize);
                                for pixel in row_data.chunks(4) {
                                    temp_buffer.push(f16_to_u8(pixel[0])); // R
                                    temp_buffer.push(f16_to_u8(pixel[1])); // G
                                    temp_buffer.push(f16_to_u8(pixel[2])); // B
                                    temp_buffer.push(255);
                                }
                            } else if pixel_format == DXGI_FORMAT_R10G10B10A2_UNORM {
                                let row_data = std::slice::from_raw_parts(src as *const u32, width as usize);
                                for &pixel in row_data {
                                    // 10 bits R, G, B, 2 bits A
                                    let r_raw = (pixel & 0x3FF) as f32;
                                    let g_raw = ((pixel >> 10) & 0x3FF) as f32;
                                    let b_raw = ((pixel >> 20) & 0x3FF) as f32;
                                    
                                    // 简单修复: 如果是 HDR 模式下的 10bit，通常不能直接线性映射
                                    // 这里简单地做 2 倍增益以提升亮度 (防止发灰)，并转换到 8bit
                                    let nm = 255.0 / 1023.0 * if is_hdr_format { 2.5 } else { 1.0 };
                                    
                                    let r = (r_raw * nm).min(255.0) as u8;
                                    let g = (g_raw * nm).min(255.0) as u8;
                                    let b = (b_raw * nm).min(255.0) as u8;
                                    
                                    temp_buffer.push(r);
                                    temp_buffer.push(g);
                                    temp_buffer.push(b);
                                    temp_buffer.push(255);
                                }
                            } else if pixel_format == DXGI_FORMAT_B8G8R8A8_UNORM || pixel_format == DXGI_FORMAT_B8G8R8A8_UNORM_SRGB {
                                let row_data = std::slice::from_raw_parts(src, (width * 4) as usize);
                                for pixel in row_data.chunks(4) {
                                    temp_buffer.push(pixel[2]); // R
                                    temp_buffer.push(pixel[1]); // G
                                    temp_buffer.push(pixel[0]); // B
                                    temp_buffer.push(255);
                                }
                            } else {
                                // 默认 RGBA8 (如 R8G8B8A8)
                                let row_data = std::slice::from_raw_parts(src, (width * 4) as usize);
                                for pixel in row_data.chunks(4) {
                                    temp_buffer.push(pixel[0]);
                                    temp_buffer.push(pixel[1]);
                                    temp_buffer.push(pixel[2]);
                                    temp_buffer.push(255);
                                }
                            }
                        }
                        
                        }
                        context.Unmap(&staging_resource, 0);
                        let _ = duplication.ReleaseFrame();

                        // 增强判定：全屏均匀采样 100 个点，防止因为局部黑边导致误判
                        let total_pixels = temp_buffer.len() / 4;
                        let sample_step = (total_pixels / 100).max(1);
                        let has_content = (0..100).any(|i| {
                            let idx = i * sample_step * 4;
                            if idx + 2 < temp_buffer.len() {
                                temp_buffer[idx] > 0 || temp_buffer[idx+1] > 0 || temp_buffer[idx+2] > 0
                            } else {
                                false
                            }
                        });
                        
                        if has_content || retry_count >= 25 {
                            if retry_count > 0 {
                                println!("[HDR-Native] Display {} recovered at retry {}", display_id, retry_count);
                            }
                            final_buffer = temp_buffer;
                            break;
                        } else {
                            // 如果重试次数过多依然全黑，尝试重置下 duplication
                            // 此时不进行复杂的重新 API 获取，仅执行 ReleaseFrame 并等待
                            // 下一次循环会自动进行 AcquireNextFrame
                        }
                    } else {
                        let _ = duplication.ReleaseFrame();
                    }
                }
                Err(e) => {
                    let err_code = e.code();
                    // 仅在关键错误（访问丢失）时重新初始化
                    if err_code == windows::Win32::Graphics::Dxgi::DXGI_ERROR_ACCESS_LOST {
                         if let Ok(new_dupl) = output.clone().cast::<IDXGIOutput1>().and_then(|o| o.DuplicateOutput(&device)) {
                             duplication = new_dupl;
                         }
                    }
                }
            }
            retry_count += 1;
        }



        if final_buffer.is_empty() {
            return Err("Failed to capture a valid frame (all black or timeout)".into());
        }

        Ok(crate::CaptureResult {
            buffer: final_buffer.into(),
            width,
            height,
            is_hdr: is_hdr_format,
        })
    }
}

/// 极简的 F16 到 U8 转换逻辑 (用于 HDR 预览)
fn f16_to_u8(val: u16) -> u8 {
    // 提取符号、指数、尾数 (IEEE 754 binary16)
    let sign = (val >> 15) & 0x1;
    let exp = (val >> 10) & 0x1F;
    let frac = val & 0x3FF;

    let f = if exp == 0 {
        if frac == 0 { 0.0 } else { (frac as f32) * 2.0f32.powi(-14 - 10) }
    } else if exp == 0x1F {
        if frac == 0 { if sign == 0 { 1.0 } else { 0.0 } } else { 1.0 }
    } else {
        (1.0 + (frac as f32) / 1024.0) * 2.0f32.powi(exp as i32 - 15)
    };

    let val_f = f.max(0.0);
    if val_f < 0.0001 { return 0; }
    
    // 修复 scRGB 映射:
    // scRGB 1.0 = 80 nits.
    // SDR White (Windows) 通常在此之上 (e.g. 200 nits = 2.5).
    // 为了让截图看起来正常（不发灰也不过曝），我们需要一个合适的 Tone Map。
    // 简单的 Reinhard 曲线: x / (x + 1) 会压暗中间调。
    // 我们采用 Extended Reinhard 或简单归一化。
    // 假设 SDR White Level 为 200 nits (2.5), 我们希望 2.5 -> 1.0 (255).
    // 同时为了保留 80 nits (1.0) 不至于太暗，我们允许一点 clipping。
    
    // 这里设置 Reference White 为 200 nits (2.5 scRGB units)
    // 凡是大于 2.5 的都会被压缩或 Clip。小于 2.5 的线性映射。
    // 80 nits (1.0) -> 1.0/2.5 = 0.4. Gamma(0.4) = 0.66 (168). 有点暗。
    // 也许折中一下，Reference White = 120 nits (1.5).
    // 1.0/1.5 = 0.66. Gamma(0.66) = 0.83 (211). 比较接近白色。
    // 2.5/1.5 = 1.66. Clip -> 255.
    
    let max_white = 1.5; 
    let mapped = (val_f / max_white).min(1.0);
    
    // 应用 Gamma 2.2
    (mapped.powf(0.4545) * 255.0) as u8
}
