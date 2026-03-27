use windows::Win32::Devices::Display::{
    DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO,
    DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL, DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
    DISPLAYCONFIG_DEVICE_INFO_HEADER, DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO,
    DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_0, DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO,
    DISPLAYCONFIG_SDR_WHITE_LEVEL, DISPLAYCONFIG_SOURCE_DEVICE_NAME, DisplayConfigGetDeviceInfo,
    GetDisplayConfigBufferSizes, QDC_ONLY_ACTIVE_PATHS, QueryDisplayConfig,
};
use windows::Win32::Graphics::Gdi::DISPLAYCONFIG_COLOR_ENCODING;

#[derive(Debug, Clone, Copy)]
pub struct DisplayColorInfo {
    pub sdr_white_level: u32,
    pub sdr_white_nits: f64,
    pub hdr_enabled: bool,
}

fn utf16z_to_string(buf: &[u16]) -> String {
    let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    String::from_utf16_lossy(&buf[..len])
}

fn get_source_name(path: &DISPLAYCONFIG_PATH_INFO) -> Result<String, String> {
    let mut source = DISPLAYCONFIG_SOURCE_DEVICE_NAME {
        header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
            r#type: DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
            size: u32::try_from(std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>()).unwrap(),
            adapterId: path.sourceInfo.adapterId,
            id: path.sourceInfo.id,
        },
        viewGdiDeviceName: [0; 32],
    };

    if unsafe { DisplayConfigGetDeviceInfo(&mut source.header) } == 0 {
        Ok(utf16z_to_string(&source.viewGdiDeviceName))
    } else {
        Err("failed to query source device name".to_string())
    }
}

fn get_hdr_enabled(path: &DISPLAYCONFIG_PATH_INFO) -> bool {
    let mut info = DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO {
        header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
            r#type: DISPLAYCONFIG_DEVICE_INFO_GET_ADVANCED_COLOR_INFO,
            size: u32::try_from(std::mem::size_of::<DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO>())
                .unwrap(),
            adapterId: path.targetInfo.adapterId,
            id: path.targetInfo.id,
        },
        Anonymous: DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO_0 { value: 0 },
        colorEncoding: DISPLAYCONFIG_COLOR_ENCODING::default(),
        bitsPerColorChannel: 0,
    };

    if unsafe { DisplayConfigGetDeviceInfo(&mut info.header) } == 0 {
        let value = unsafe { info.Anonymous.value };
        (value & 0x2) != 0
    } else {
        false
    }
}

fn get_sdr_white_level(path: &DISPLAYCONFIG_PATH_INFO) -> Result<u32, String> {
    let mut info = DISPLAYCONFIG_SDR_WHITE_LEVEL {
        header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
            r#type: DISPLAYCONFIG_DEVICE_INFO_GET_SDR_WHITE_LEVEL,
            size: u32::try_from(std::mem::size_of::<DISPLAYCONFIG_SDR_WHITE_LEVEL>()).unwrap(),
            adapterId: path.targetInfo.adapterId,
            id: path.targetInfo.id,
        },
        SDRWhiteLevel: 0,
    };

    if unsafe { DisplayConfigGetDeviceInfo(&mut info.header) } == 0 {
        Ok(info.SDRWhiteLevel)
    } else {
        Err("failed to query SDR white level".to_string())
    }
}

fn sdr_white_level_to_nits(level: u32) -> f64 {
    (level as f64 / 1000.0) * 80.0
}

pub fn get_display_color_info(display_name: &str) -> Result<DisplayColorInfo, String> {
    let mut number_of_paths = 0;
    let mut number_of_modes = 0;

    unsafe {
        GetDisplayConfigBufferSizes(
            QDC_ONLY_ACTIVE_PATHS,
            &mut number_of_paths,
            &mut number_of_modes,
        )
    }
    .ok()
    .map_err(|e| format!("failed to get display config buffer sizes: {e}"))?;

    if number_of_paths == 0 {
        return Err("no active display paths".to_string());
    }

    let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); number_of_paths as usize];
    let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); number_of_modes as usize];

    unsafe {
        QueryDisplayConfig(
            QDC_ONLY_ACTIVE_PATHS,
            &mut number_of_paths,
            paths.as_mut_ptr(),
            &mut number_of_modes,
            modes.as_mut_ptr(),
            None,
        )
    }
    .ok()
    .map_err(|e| format!("failed to query display config: {e}"))?;

    for path in paths.into_iter().take(number_of_paths as usize) {
        let source_name = match get_source_name(&path) {
            Ok(name) => name,
            Err(_) => continue,
        };
        if !source_name.eq_ignore_ascii_case(display_name) {
            continue;
        }

        let sdr_white_level = get_sdr_white_level(&path)?;
        return Ok(DisplayColorInfo {
            sdr_white_level,
            sdr_white_nits: sdr_white_level_to_nits(sdr_white_level),
            hdr_enabled: get_hdr_enabled(&path),
        });
    }

    Err(format!("display path not found for {display_name}"))
}
