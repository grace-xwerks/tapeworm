// ─────────────────────────────────────────────────────────────────────────────
// Tapeworm — shared TypeScript types
// Used by: apps/web, apps/agent, packages/vscode
// ─────────────────────────────────────────────────────────────────────────────

// ── Enums ────────────────────────────────────────────────────────────────────

export type ProgramStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'in_production'
  | 'archived';

export type TransferStatus =
  | 'queued'
  | 'sending'
  | 'complete'
  | 'failed';

export type ControlFamily =
  | 'mitsubishi'     // Citizens (L20, L20 VIII, K16), Mazak Integrex, Super Quadrex, Variaxis
  | 'fanuc'          // Tsugami, Star SR-32J, Citizen K16
  | 'haas_serial'    // Haas Sigma 1, Sigma 5 without Ethernet
  | 'haas_net_share' // Haas Sigma 5 with Ethernet card, Haas Mini Lathe (if networked)
  | 'brother'        // Speedio U500X (879, 880) — native Ethernet
  | 'usb_gadget';    // Pi Zero acting as USB mass storage device

export type TransferMode =
  | 'rs232_serial'   // via Moxa NPort TCP socket → RS-232
  | 'net_share'      // SMB/network share directly to controller
  | 'usb_gadget';    // via Pi Zero presenting as USB drive

export type DocumentType =
  | 'setup_sheet'
  | 'tool_list'
  | 'inspection_sheet'
  | 'photo'
  | 'other';

// ── Connection configs (stored as JSONB in machines.connection_config) ────────

export interface MoxaConnectionConfig {
  type: 'moxa';
  host: string;                   // Moxa NPort IP (e.g. 192.168.10.10)
  port: number;                   // TCP port for this machine's RS-232 channel
  baud_rate: 1200 | 2400 | 4800 | 9600 | 19200 | 38400 | 57600 | 115200;
  data_bits: 5 | 6 | 7 | 8;
  stop_bits: 1 | 2;
  parity: 'none' | 'odd' | 'even';
  flow_control: 'none' | 'xon_xoff' | 'rts_cts';
  program_start_char: string;     // e.g. "%" for Fanuc/Haas, "\x02" for some Mitsubishi
  program_end_char: string;       // e.g. "%"
  eor_char: string;               // end-of-record, e.g. "\r\n" or "\n"
}

export interface NetShareConfig {
  type: 'net_share';
  share_path: string;             // UNC path or mount point (e.g. \\192.168.10.51\programs)
  username?: string;
  password?: string;              // stored encrypted, never logged
}

export interface UsbGadgetConfig {
  type: 'usb_gadget';
  pi_host: string;                // Pi Zero IP on floor network
  ssh_user: string;               // default: tapeworm
  mount_path: string;             // path on Pi where the gadget storage is mounted
}

export type ConnectionConfig =
  | MoxaConnectionConfig
  | NetShareConfig
  | UsbGadgetConfig;

// ── Database entities ─────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Machine {
  id: string;
  machine_number: string;         // e.g. "851", "886"
  description: string;            // e.g. "Haas VF-4SS"
  make?: string;
  model?: string;
  control_family: ControlFamily;
  transfer_mode: TransferMode;
  connection_config: ConnectionConfig;
  location?: string;              // e.g. "lathe area", "mill area"
  active: boolean;
  created_at: string;
}

export interface Program {
  id: string;
  customer_id: string;
  part_number: string;
  operation_number?: string;      // null for Swiss lathe programs (single-op machines)
  description?: string;
  created_at: string;
  updated_at: string;
  // Joined
  customer?: Customer;
}

export interface ProgramRevision {
  id: string;
  program_id: string;
  revision: number;
  status: ProgramStatus;
  file_path: string;              // Supabase Storage path
  file_size?: number;
  file_hash?: string;             // SHA-256 for integrity checks
  channel_count: number;          // 1 for mills, 2 for Citizens ($1/$2 channels)
  has_parameter_block: boolean;   // Citizens $0 barfeed parameter block
  notes?: string;
  submitted_by?: string;
  approved_by?: string;
  approved_at?: string;
  created_at: string;
  // Joined
  program?: Program;
}

export interface ProgramDependency {
  parent_revision_id: string;
  child_revision_id: string;
}

export interface MachineProgramAssignment {
  id: string;
  machine_id: string;
  program_id: string;
  o_number: number;               // 1–9999, unique per machine namespace
  assigned_at: string;
}

export interface Transfer {
  id: string;
  machine_id: string;
  revision_id: string;
  status: TransferStatus;
  initiated_by?: string;
  substitution_map?: SubstitutionMap;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  // Joined
  machine?: Machine;
  revision?: ProgramRevision;
}

export interface ProgramDocument {
  id: string;
  program_id: string;
  type: DocumentType;
  name: string;
  storage_path: string;
  uploaded_by?: string;
  created_at: string;
}

// ── Transfer / O-number rewriting ─────────────────────────────────────────────

export interface SubstitutionEntry {
  program_id: string;
  revision_id: string;
  original_o_number: number;
  assigned_o_number: number;
}

export interface SubstitutionMap {
  entries: SubstitutionEntry[];
  created_at: string;
}

// ── G-code parser types ────────────────────────────────────────────────────────

export type ChannelType = 'main_spindle' | 'sub_spindle' | 'parameters';

export interface ProgramChannel {
  type: ChannelType;
  delimiter: string;              // "$1", "$2", "$0"
  content: string;
  line_start: number;
  line_end: number;
}

export interface ParsedProgram {
  o_number: number | null;        // extracted from O____ header
  channels: ProgramChannel[];     // [$1, $2, $0] for Citizens; single channel for mills
  subprogram_refs: SubprogramRef[];
  machine_resident_refs: MachineResidentRef[];
  sync_labels: string[];          // Citizen !L___ synchronization labels
}

export interface SubprogramRef {
  call_type: 'M98P' | 'M98H' | 'G65P';
  ref_number: number;
  line_number: number;
  is_optional: boolean;           // true if prefixed with /
}

export interface MachineResidentRef {
  ref_number: number;             // e.g. 8000 for P8000 on Citizens
  reason: string;                 // why it's flagged as machine-resident
}

// ── Realtime payloads (Supabase channel events) ────────────────────────────────

export interface TransferQueuedPayload {
  type: 'transfer_queued';
  transfer: Transfer;
}

export interface TransferStatusChangedPayload {
  type: 'transfer_status_changed';
  transfer_id: string;
  old_status: TransferStatus;
  new_status: TransferStatus;
  error_message?: string;
}

export type RealtimePayload =
  | TransferQueuedPayload
  | TransferStatusChangedPayload;
