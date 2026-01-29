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
    DXGI_SAMPLE_DESC,
};
use windows::Win32::Graphics::Dxgi::{
    CreateDXGIFactory1, IDXGIAdapter, IDXGIFactory1, IDXGIOutput, IDXGIOutput1, IDXGIResource,
    DXGI_OUTDUPL_FRAME_INFO,
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
pub fn capture_display(display_id: u32) -> Result<napi::bindgen_prelude::Buffer, Box<dyn std::error::Error>> {
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

        // 获取 Output Duplication
        let output1: IDXGIOutput1 = output.cast()?;
        let duplication = output1.DuplicateOutput(&device)?;

        // 获取输出描述
        let output_desc = output.GetDesc()?;
        let dupl_desc = duplication.GetDesc();
        let pixel_format = dupl_desc.ModeDesc.Format;
        let width = (output_desc.DesktopCoordinates.right - output_desc.DesktopCoordinates.left) as u32;
        let height = (output_desc.DesktopCoordinates.bottom - output_desc.DesktopCoordinates.top) as u32;

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
        
        while retry_count < 10 {
            let mut frame_info = DXGI_OUTDUPL_FRAME_INFO::default();
            let mut desktop_resource: Option<IDXGIResource> = None;
            
            // AcquireNextFrame (适度的轮询间隔)
            match duplication.AcquireNextFrame(40, &mut frame_info, &mut desktop_resource) {
                Ok(_) => {
                    if let Some(resource) = desktop_resource {
                        let desktop_texture: ID3D11Texture2D = resource.cast()?;
                        context.CopyResource(&staging_resource, &desktop_texture.cast::<ID3D11Resource>()?);
                        
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
                        
                        context.Unmap(&staging_resource, 0);
                        let _ = duplication.ReleaseFrame();

                        // 核心修正：只检查 RGB 分量是否全为 0，跳过 Alpha (每 4 字节的最后一个)
                        let is_black = !temp_buffer.chunks(4).take(2000).any(|p| p[0] != 0 || p[1] != 0 || p[2] != 0);
                        
                        if !is_black || retry_count == 7 {
                            final_buffer = temp_buffer;
                            break;
                        }
                    } else {
                        let _ = duplication.ReleaseFrame();
                    }
                }
                Err(_) => {
                    // Timeout, continue retrying
                }
            }
            retry_count += 1;
        }



        if final_buffer.is_empty() {
            return Err("Failed to capture a valid frame (all black or timeout)".into());
        }

        Ok(final_buffer.into())
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

    // 映射到 0-255，并进行简单的伽马校正
    (f.max(0.0).min(1.0).powf(1.0 / 2.2) * 255.0) as u8
}
