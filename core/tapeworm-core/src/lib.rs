//! Tapeworm core — CNC RS-232 transfer primitives.
//!
//! This crate is intentionally headless: no CLI, no Node bindings, no MCP. It
//! defines the wire-level types (settings, framing, flow control) and offers
//! send/receive operations against a [`serialport`] backend.
//!
//! Higher layers wrap this:
//! - the VS Code extension talks to it via `napi-rs` once we extract from Node
//! - the MCP server talks to it the same way
//! - the future Tauri desktop app uses it natively
//! - tests hit it directly with the mock backend
//!
//! Status: skeleton. Public types are stable enough to start; implementations
//! are stubs until Phase 2 of the roadmap lands.

#![warn(missing_docs)]
#![warn(clippy::pedantic)]
#![allow(clippy::module_name_repetitions)]

use std::time::Duration;

pub use serialport::{DataBits, FlowControl, Parity, StopBits};

/// Errors produced by the core layer.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// Underlying serial backend failure.
    #[error("serial: {0}")]
    Serial(#[from] serialport::Error),

    /// I/O error from the OS.
    #[error("io: {0}")]
    Io(#[from] std::io::Error),

    /// User cancelled the transfer.
    #[error("cancelled by caller")]
    Cancelled,

    /// Idle timeout fired during a receive.
    #[error("idle timeout after {0:?}")]
    IdleTimeout(Duration),
}

/// Result alias used throughout the crate.
pub type Result<T> = std::result::Result<T, Error>;

/// Settings for opening a serial port to a CNC control.
///
/// Defaults match a permissive starting point (9600 8N1, no flow control).
/// Real machines almost always need adjustment — pick a [`MachineProfile`]
/// rather than relying on defaults.
#[derive(Debug, Clone)]
pub struct PortSettings {
    /// OS-specific port name, e.g. `"COM3"` or `"/dev/ttyUSB0"`.
    pub path: String,
    /// Baud rate. Common: 1200, 2400, 4800, 9600, 19200, 38400, 115200.
    pub baud: u32,
    /// 5–8 data bits.
    pub data_bits: DataBits,
    /// Parity (None / Even / Odd).
    pub parity: Parity,
    /// 1 or 2 stop bits.
    pub stop_bits: StopBits,
    /// Hardware (RTS/CTS) or software (XON/XOFF) flow control.
    pub flow_control: FlowControl,
    /// Inter-byte read timeout. Receive ends after this much silence.
    pub timeout: Duration,
}

impl Default for PortSettings {
    fn default() -> Self {
        Self {
            path: String::new(),
            baud: 9600,
            data_bits: DataBits::Eight,
            parity: Parity::None,
            stop_bits: StopBits::One,
            flow_control: FlowControl::None,
            timeout: Duration::from_secs(3),
        }
    }
}

/// Framing applied to outgoing programs and stripped from incoming ones.
#[derive(Debug, Clone)]
pub struct Framing {
    /// Optional leading character — usually `'%'` for Fanuc-style controls.
    pub start: Option<char>,
    /// Optional trailing character — usually `'%'`.
    pub end: Option<char>,
    /// Number of leading null bytes (some Fanuc paper-tape configs want 50–100).
    pub null_padding: usize,
    /// Line ending to emit.
    pub line_ending: LineEnding,
}

impl Default for Framing {
    fn default() -> Self {
        Self {
            start: Some('%'),
            end: Some('%'),
            null_padding: 0,
            line_ending: LineEnding::CrLf,
        }
    }
}

/// Line ending convention.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LineEnding {
    /// Carriage return + line feed (`\r\n`). Common for Fanuc.
    CrLf,
    /// Line feed only (`\n`). Some modern controls.
    Lf,
    /// Carriage return only (`\r`). Old-school.
    Cr,
}

/// A built-in or user-supplied machine profile.
///
/// Profiles bundle [`PortSettings`] (minus `path`) with [`Framing`] so the
/// caller can pick "Haas-VF2" rather than wiring nine knobs themselves.
#[derive(Debug, Clone)]
pub struct MachineProfile {
    /// Human-readable identifier, e.g. `"haas-vf2"`.
    pub id: String,
    /// Display label, e.g. `"Haas VF-2"`.
    pub label: String,
    /// Port options minus the path (which is per-host).
    pub settings_template: PortSettingsTemplate,
    /// Wire framing (start/end chars, null padding, line ending).
    pub framing: Framing,
}

/// Port options minus the OS-specific path.
#[derive(Debug, Clone)]
pub struct PortSettingsTemplate {
    /// Baud rate.
    pub baud: u32,
    /// Data bits.
    pub data_bits: DataBits,
    /// Parity.
    pub parity: Parity,
    /// Stop bits.
    pub stop_bits: StopBits,
    /// Flow control.
    pub flow_control: FlowControl,
}

impl PortSettingsTemplate {
    /// Combine a template with a host-specific path into a complete [`PortSettings`].
    #[must_use]
    pub fn with_path(self, path: impl Into<String>) -> PortSettings {
        PortSettings {
            path: path.into(),
            baud: self.baud,
            data_bits: self.data_bits,
            parity: self.parity,
            stop_bits: self.stop_bits,
            flow_control: self.flow_control,
            timeout: Duration::from_secs(3),
        }
    }
}

/// Built-in profiles. Replaceable by the user via configuration.
pub mod profiles {
    use super::{
        DataBits, FlowControl, Framing, LineEnding, MachineProfile, Parity, PortSettingsTemplate,
        StopBits,
    };

    /// Haas VF-class mills with the default RS-232 firmware.
    #[must_use]
    pub fn haas_vf() -> MachineProfile {
        MachineProfile {
            id: "haas-vf".into(),
            label: "Haas VF (default)".into(),
            settings_template: PortSettingsTemplate {
                baud: 9600,
                data_bits: DataBits::Seven,
                parity: Parity::Even,
                stop_bits: StopBits::One,
                flow_control: FlowControl::Software,
            },
            framing: Framing {
                start: Some('%'),
                end: Some('%'),
                null_padding: 0,
                line_ending: LineEnding::CrLf,
            },
        }
    }

    /// Fanuc 0i and 0i-MF style controls.
    #[must_use]
    pub fn fanuc_0i() -> MachineProfile {
        MachineProfile {
            id: "fanuc-0i".into(),
            label: "Fanuc 0i / 0i-MF".into(),
            settings_template: PortSettingsTemplate {
                baud: 4800,
                data_bits: DataBits::Seven,
                parity: Parity::Even,
                stop_bits: StopBits::Two,
                flow_control: FlowControl::Software,
            },
            framing: Framing {
                start: Some('%'),
                end: Some('%'),
                null_padding: 32,
                line_ending: LineEnding::CrLf,
            },
        }
    }
}

/// Enumerate serial ports visible to the OS.
pub fn list_ports() -> Result<Vec<PortInfo>> {
    let ports = serialport::available_ports()?;
    Ok(ports
        .into_iter()
        .map(|p| PortInfo {
            name: p.port_name,
            kind: format!("{:?}", p.port_type),
        })
        .collect())
}

/// Brief information about a discovered serial port.
#[derive(Debug, Clone)]
pub struct PortInfo {
    /// OS port name (e.g. `"COM3"`).
    pub name: String,
    /// Best-effort port-type description from the OS.
    pub kind: String,
}

/// Send a program to the configured port.
///
/// Currently a stub. Real implementation lands in Phase 2.
///
/// # Errors
///
/// Returns [`Error::Serial`] if the port can't be opened, [`Error::Io`] on
/// transient write failures, or [`Error::Cancelled`] if a future cancel
/// channel fires.
pub fn send_program(_settings: &PortSettings, _framing: &Framing, _program: &str) -> Result<usize> {
    // TODO(phase-2): open port, write framed program, honor flow control,
    // return bytes-written count.
    unimplemented!("send_program — wire up against serialport in Phase 2")
}

/// Receive a program from the configured port.
///
/// Currently a stub. Real implementation lands in Phase 5.
///
/// # Errors
///
/// Returns [`Error::Serial`] if the port can't be opened, [`Error::IdleTimeout`]
/// if no data arrives within `settings.timeout`, or [`Error::Cancelled`] if
/// a future cancel channel fires.
pub fn receive_program(_settings: &PortSettings, _framing: &Framing) -> Result<String> {
    // TODO(phase-5): open port, accumulate bytes until end-of-transmission
    // or idle timeout, strip framing, return stripped program.
    unimplemented!("receive_program — wire up against serialport in Phase 5")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_settings_are_permissive() {
        let s = PortSettings::default();
        assert_eq!(s.baud, 9600);
        assert!(matches!(s.data_bits, DataBits::Eight));
        assert!(matches!(s.parity, Parity::None));
    }

    #[test]
    fn haas_profile_has_seven_data_bits_even_parity() {
        let p = profiles::haas_vf();
        assert!(matches!(p.settings_template.data_bits, DataBits::Seven));
        assert!(matches!(p.settings_template.parity, Parity::Even));
    }

    #[test]
    fn fanuc_profile_has_two_stop_bits() {
        let p = profiles::fanuc_0i();
        assert!(matches!(p.settings_template.stop_bits, StopBits::Two));
        assert_eq!(p.framing.null_padding, 32);
    }

    #[test]
    fn template_combines_with_path() {
        let p = profiles::haas_vf();
        let settings = p.settings_template.with_path("COM3");
        assert_eq!(settings.path, "COM3");
        assert_eq!(settings.baud, 9600);
    }
}
