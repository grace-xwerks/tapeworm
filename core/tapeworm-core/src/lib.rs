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
//! Status: the protocol logic — framing ([`Framing::encode`] /
//! [`Framing::decode`]) and the transport pump ([`send_over`] /
//! [`receive_over`]) — is implemented and unit-tested against in-memory
//! transports. The only unbuilt piece is the hardware serial open
//! (`open_port`), which needs a physical control to verify.

#![warn(missing_docs)]
#![warn(clippy::pedantic)]
#![allow(clippy::module_name_repetitions)]

use std::io::{self, Read, Write};
use std::time::{Duration, Instant};

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

impl Framing {
    /// Encode program text into the exact byte stream to put on the wire.
    ///
    /// Layout: `null_padding` leading `NUL` bytes (paper-tape leader), the
    /// optional start character on its own line, the program body with its line
    /// endings normalized to [`Self::line_ending`], then the optional end
    /// character on its own line. Start/end are omitted when `None`.
    #[must_use]
    pub fn encode(&self, program: &str) -> Vec<u8> {
        let eol: &str = match self.line_ending {
            LineEnding::CrLf => "\r\n",
            LineEnding::Lf => "\n",
            LineEnding::Cr => "\r",
        };
        // Collapse every line ending to `\n`, then re-emit as the target ending.
        let normalized = program.replace("\r\n", "\n").replace('\r', "\n");
        let body = normalized.replace('\n', eol);

        let mut out = vec![0u8; self.null_padding];
        let mut cbuf = [0u8; 4];
        if let Some(start) = self.start {
            out.extend_from_slice(start.encode_utf8(&mut cbuf).as_bytes());
            out.extend_from_slice(eol.as_bytes());
        }
        out.extend_from_slice(body.as_bytes());
        if let Some(end) = self.end {
            out.extend_from_slice(eol.as_bytes());
            out.extend_from_slice(end.encode_utf8(&mut cbuf).as_bytes());
            out.extend_from_slice(eol.as_bytes());
        }
        out
    }

    /// Decode a received byte stream back into program text, stripping framing.
    ///
    /// Leading `NUL` bytes are dropped, everything up to and including the first
    /// start character (and one following newline) is removed, the stream is
    /// truncated at the end character, and line endings are normalized to `\n`
    /// for the repo-internal representation.
    #[must_use]
    pub fn decode(&self, bytes: &[u8]) -> String {
        let lossy = String::from_utf8_lossy(bytes);
        let mut text = lossy
            .trim_start_matches('\0')
            .replace("\r\n", "\n")
            .replace('\r', "\n");

        if let Some(start) = self.start {
            if let Some(pos) = text.find(start) {
                let mut rest = text[pos + start.len_utf8()..].to_string();
                if let Some(stripped) = rest.strip_prefix('\n') {
                    rest = stripped.to_string();
                }
                text = rest;
            }
        }

        if let Some(end) = self.end {
            if let Some(pos) = text.find(end) {
                text.truncate(pos);
                if text.ends_with('\n') {
                    text.pop();
                }
            }
        }

        text
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

/// Send a framed program to any byte sink.
///
/// Encodes `program` with `framing` and writes every byte, then flushes. This
/// is the hardware-agnostic core of [`send_program`]: pass a real serial port
/// or, in tests, any [`std::io::Write`] such as a `Vec<u8>`.
///
/// # Errors
///
/// Returns [`Error::Io`] if the underlying write or flush fails.
pub fn send_over<W: Write>(port: &mut W, framing: &Framing, program: &str) -> Result<usize> {
    let bytes = framing.encode(program);
    port.write_all(&bytes)?;
    port.flush()?;
    Ok(bytes.len())
}

/// Receive a framed program from any byte source, stripping framing.
///
/// Reads until the framing end marker has been seen, the source reaches EOF, or
/// the source goes idle — a [`std::io::ErrorKind::TimedOut`] read after some
/// data has already arrived. This is the hardware-agnostic core of
/// [`receive_program`]: pass a real serial port or, in tests, any
/// [`std::io::Read`] such as a `std::io::Cursor`.
///
/// # Errors
///
/// Returns [`Error::IdleTimeout`] if no data arrives within `idle_timeout`, or
/// [`Error::Io`] on any other read failure.
pub fn receive_over<R: Read>(
    port: &mut R,
    framing: &Framing,
    idle_timeout: Duration,
) -> Result<String> {
    // Framing characters are ASCII by convention; ignore any that aren't.
    let end_byte = framing.end.and_then(|c| u8::try_from(c).ok());
    // When start and end are the same character (e.g. '%'), the terminator is
    // the second occurrence, not the first.
    let end_needed = if framing.start.is_some() && framing.start == framing.end {
        2
    } else {
        1
    };

    let mut buf = Vec::new();
    let mut chunk = [0u8; 256];
    let mut end_seen = 0usize;
    let mut last_data = Instant::now();

    loop {
        match port.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                let slice = &chunk[..n];
                buf.extend_from_slice(slice);
                last_data = Instant::now();
                if let Some(eb) = end_byte {
                    for &b in slice {
                        if b == eb {
                            end_seen += 1;
                        }
                    }
                    if end_seen >= end_needed {
                        break;
                    }
                }
            }
            Err(e) if e.kind() == io::ErrorKind::TimedOut => {
                if !buf.is_empty() {
                    break;
                }
                if last_data.elapsed() >= idle_timeout {
                    return Err(Error::IdleTimeout(idle_timeout));
                }
            }
            Err(e) => return Err(Error::Io(e)),
        }
    }

    Ok(framing.decode(&buf))
}

/// Open a real serial port from [`PortSettings`].
///
/// This is the single seam that still requires physical hardware to exercise;
/// the surrounding send/receive logic is fully covered by unit tests against
/// in-memory transports. Wiring this to [`serialport::new`] and validating it
/// against a machine (or a serial loopback) is the remaining step.
fn open_port(_settings: &PortSettings) -> Result<Box<dyn serialport::SerialPort>> {
    unimplemented!("hardware serial open — needs a physical control to verify")
}

/// Send a program to the configured port.
///
/// Opens the port via `open_port` and delegates to [`send_over`]. The framing
/// and byte-pump logic is unit-tested; only the port open awaits hardware.
///
/// # Errors
///
/// Returns [`Error::Serial`] if the port can't be opened or [`Error::Io`] on
/// write failures.
pub fn send_program(settings: &PortSettings, framing: &Framing, program: &str) -> Result<usize> {
    let mut port = open_port(settings)?;
    send_over(&mut port, framing, program)
}

/// Receive a program from the configured port.
///
/// Opens the port via `open_port` and delegates to [`receive_over`], using
/// [`PortSettings::timeout`] as the idle timeout. The accumulate-and-strip
/// logic is unit-tested; only the port open awaits hardware.
///
/// # Errors
///
/// Returns [`Error::Serial`] if the port can't be opened, [`Error::IdleTimeout`]
/// if no data arrives within `settings.timeout`, or [`Error::Io`] on read
/// failures.
pub fn receive_program(settings: &PortSettings, framing: &Framing) -> Result<String> {
    let mut port = open_port(settings)?;
    receive_over(&mut port, framing, settings.timeout)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    /// A reader that always reports an idle timeout — models a silent port.
    struct AlwaysTimeout;

    impl Read for AlwaysTimeout {
        fn read(&mut self, _buf: &mut [u8]) -> io::Result<usize> {
            Err(io::Error::from(io::ErrorKind::TimedOut))
        }
    }

    #[test]
    fn encode_applies_padding_framing_and_line_endings() {
        let f = Framing {
            start: Some('%'),
            end: Some('%'),
            null_padding: 3,
            line_ending: LineEnding::CrLf,
        };
        let bytes = f.encode("O1000\nM30");
        assert_eq!(&bytes[..3], &[0u8, 0, 0]);
        assert_eq!(&bytes[3..], b"%\r\nO1000\r\nM30\r\n%\r\n");
    }

    #[test]
    fn encode_without_framing_chars_omits_them() {
        let f = Framing {
            start: None,
            end: None,
            null_padding: 0,
            line_ending: LineEnding::Lf,
        };
        assert_eq!(f.encode("A\r\nB"), b"A\nB");
    }

    #[test]
    fn decode_strips_nulls_and_framing() {
        let f = Framing::default();
        let raw = b"\0\0%\r\nO1000\r\nM30\r\n%\r\n";
        assert_eq!(f.decode(raw), "O1000\nM30");
    }

    #[test]
    fn round_trip_preserves_normalized_text() {
        let f = Framing::default();
        assert_eq!(
            f.decode(&f.encode("O1000\r\nG90\nM30\n")),
            "O1000\nG90\nM30\n"
        );
    }

    #[test]
    fn send_over_writes_framed_bytes() {
        let f = Framing {
            start: None,
            end: None,
            null_padding: 0,
            line_ending: LineEnding::Lf,
        };
        let mut sink: Vec<u8> = Vec::new();
        let n = send_over(&mut sink, &f, "O1\nM30").unwrap();
        assert_eq!(sink, b"O1\nM30");
        assert_eq!(n, sink.len());
    }

    #[test]
    fn receive_over_reads_stream_and_strips_framing() {
        let f = Framing::default();
        let mut wire = Cursor::new(f.encode("O1000\nM30"));
        let got = receive_over(&mut wire, &f, Duration::from_secs(1)).unwrap();
        assert_eq!(got, "O1000\nM30");
    }

    #[test]
    fn receive_over_idle_timeout_with_no_data() {
        let f = Framing::default();
        let err = receive_over(&mut AlwaysTimeout, &f, Duration::ZERO).unwrap_err();
        assert!(matches!(err, Error::IdleTimeout(_)));
    }

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
