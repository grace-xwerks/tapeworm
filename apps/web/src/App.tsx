import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import type { 
  Machine, 
  Program, 
  ProgramRevision, 
  Transfer, 
  ParsedProgram
} from '@tapeworm/shared';
import { 
  Activity, 
  Cpu, 
  FileCode, 
  RefreshCw, 
  CheckCircle, 
  AlertTriangle, 
  UploadCloud, 
  Settings, 
  Search, 
  User, 
  Clock, 
  Check, 
  Database,
  ArrowRight,
  Sparkles,
  ChevronRight
} from 'lucide-react';

// Setup Supabase Client
const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
const supabaseKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || '';
const isSupabaseConfigured = supabaseUrl && supabaseKey;
const supabase = isSupabaseConfigured ? createClient(supabaseUrl, supabaseKey) : null;

// Initial mockup data parsed from Grace Engineering inventory
const mockMachines: Machine[] = [
  {
    id: 'm1',
    machine_number: '886',
    description: 'Citizen L20 VIII (Mitsubishi) - Citizen CAV 20L-IS',
    make: 'Citizen',
    model: 'L20 VIII',
    control_family: 'mitsubishi',
    transfer_mode: 'rs232_serial',
    connection_config: {
      type: 'moxa',
      host: '192.168.10.186',
      port: 4006,
      baud_rate: 9600,
      data_bits: 7,
      stop_bits: 1,
      parity: 'even',
      flow_control: 'xon_xoff',
      program_start_char: '%',
      program_end_char: '%',
      eor_char: '\r\n'
    },
    location: 'lathe area',
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'm2',
    machine_number: '858',
    description: 'Tsugami S206 (Fanuc) - Edge Minute Man 320 SE',
    make: 'Tsugami',
    model: 'S206',
    control_family: 'fanuc',
    transfer_mode: 'rs232_serial',
    connection_config: {
      type: 'moxa',
      host: '192.168.10.158',
      port: 4008,
      baud_rate: 9600,
      data_bits: 7,
      stop_bits: 1,
      parity: 'even',
      flow_control: 'xon_xoff',
      program_start_char: '%',
      program_end_char: '%',
      eor_char: '\r\n'
    },
    location: 'lathe area',
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'm3',
    machine_number: '851',
    description: 'VF-4SS - Haas/Sigma 5 (S/N: 1125269)',
    make: 'Haas',
    model: 'VF-4SS',
    control_family: 'haas_net_share',
    transfer_mode: 'net_share',
    connection_config: {
      type: 'net_share',
      share_path: '\\\\192.168.10.51\\programs\\machine_851'
    },
    location: 'mill area',
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: 'm4',
    machine_number: '879',
    description: 'Brother Speedio U500X/1-SAX - Brother',
    make: 'Brother',
    model: 'Speedio U500X',
    control_family: 'brother',
    transfer_mode: 'net_share',
    connection_config: {
      type: 'net_share',
      share_path: '\\\\192.168.10.879\\programs'
    },
    location: 'mill area',
    active: true,
    created_at: new Date().toISOString()
  }
];

const mockPrograms: Program[] = [
  {
    id: 'p1',
    customer_id: 'c1',
    part_number: 'GR-88602-SHAFT',
    operation_number: '',
    description: 'Monolithic Swiss lathe drive shaft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'p2',
    customer_id: 'c1',
    part_number: 'GR-44501-BRACKET',
    operation_number: 'OP10',
    description: 'Mounting bracket OP10',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: 'p3',
    customer_id: 'c1',
    part_number: 'GR-44501-BRACKET',
    operation_number: 'OP20',
    description: 'Mounting bracket OP20',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const mockRevisions: ProgramRevision[] = [
  {
    id: 'r1',
    program_id: 'p1',
    revision: 1,
    status: 'in_production',
    file_path: 'grace/GR-88602-SHAFT.cnc',
    file_size: 4096,
    file_hash: 'abc123hash',
    channel_count: 2,
    has_parameter_block: true,
    notes: 'Initial production revision, verified on machine 886',
    submitted_by: 'Programmer John',
    approved_by: 'Lead Supervisor',
    approved_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  },
  {
    id: 'r2',
    program_id: 'p2',
    revision: 2,
    status: 'approved',
    file_path: 'grace/GR-44501-BRACKET-OP10.cnc',
    file_size: 2048,
    file_hash: 'def456hash',
    channel_count: 1,
    has_parameter_block: false,
    notes: 'Optimized toolpaths for drilling op',
    submitted_by: 'Programmer John',
    approved_by: 'Lead Supervisor',
    approved_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  },
  {
    id: 'r3',
    program_id: 'p3',
    revision: 1,
    status: 'draft',
    file_path: 'grace/GR-44501-BRACKET-OP20.cnc',
    file_size: 1512,
    file_hash: 'ghi789hash',
    channel_count: 1,
    has_parameter_block: false,
    notes: 'Draft setup ready for dry run',
    submitted_by: 'Programmer John',
    created_at: new Date().toISOString()
  }
];

export default function App() {
  const [dbMode, setDbMode] = useState<string>(isSupabaseConfigured ? 'supabase' : 'local');
  const [machines, setMachines] = useState<Machine[]>(mockMachines);
  const [programs, setPrograms] = useState<Program[]>(mockPrograms);
  const [revisions, setRevisions] = useState<ProgramRevision[]>(mockRevisions);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  
  // App states
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(mockMachines[0]);
  const [selectedProgram, setSelectedProgram] = useState<Program | null>(mockPrograms[0]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form states
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [newPartNumber, setNewPartNumber] = useState('');
  const [newOpNumber, setNewOpNumber] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newGCode, setNewGCode] = useState('');
  const [newNotes, setNewNotes] = useState('');
  
  // Parsed G-code preview state
  const [parsedPreview, setParsedPreview] = useState<ParsedProgram | null>(null);

  // Parse G-code instantly on edit
  useEffect(() => {
    if (!newGCode) {
      setParsedPreview(null);
      return;
    }
    
    // Client-side quick parser
    const lines = newGCode.split('\n');
    let o_number: number | null = null;
    const subprogram_refs: any[] = [];
    const channels: any[] = [];
    let currentChannel: any = null;
    
    lines.forEach((line, idx) => {
      const lineNum = idx + 1;
      const cleanLine = line.replace(/\([^)]*\)/g, '').replace(/;.*$/, '');
      
      const channelMatch = line.match(/^(\$[0-2])\b/);
      if (channelMatch) {
        if (currentChannel) {
          channels.push(currentChannel);
        }
        currentChannel = {
          type: channelMatch[1] === '$1' ? 'main_spindle' : channelMatch[1] === '$2' ? 'sub_spindle' : 'parameters',
          delimiter: channelMatch[1],
          line_start: lineNum
        };
      }
      
      if (o_number === null) {
        const headerMatch = cleanLine.match(/^[O:]\s*(\d{1,4})\b/i);
        if (headerMatch) {
          o_number = parseInt(headerMatch[1], 10);
        }
      }
      
      const callMatch = cleanLine.match(/\b(M98|G65)\s*P\s*(\d{1,4})\b/i);
      if (callMatch) {
        subprogram_refs.push({
          call_type: callMatch[1].toUpperCase(),
          ref_number: parseInt(callMatch[2], 10),
          line_number: lineNum
        });
      }
    });
    
    if (currentChannel) {
      channels.push(currentChannel);
    }
    
    setParsedPreview({
      o_number,
      channels,
      subprogram_refs,
      machine_resident_refs: subprogram_refs.filter(r => r.ref_number >= 8000),
      sync_labels: []
    });
    
  }, [newGCode]);

  // Load from Supabase if configured
  const loadDataFromDb = async () => {
    if (!supabase) return;
    try {
      const { data: dbMach } = await supabase.from('machines').select('*').order('machine_number');
      const { data: dbProg } = await supabase.from('programs').select('*');
      const { data: dbRev } = await supabase.from('program_revisions').select('*');
      const { data: dbTransfers } = await supabase.from('transfers').select('*, machine:machines(*), revision:program_revisions(*)').order('created_at', { ascending: false });

      if (dbMach) setMachines(dbMach);
      if (dbProg) setPrograms(dbProg);
      if (dbRev) setRevisions(dbRev);
      if (dbTransfers) setTransfers(dbTransfers);
    } catch (err) {
      console.error("Supabase load error:", err);
    }
  };

  useEffect(() => {
    let channel: any = null;
    if (dbMode === 'supabase' && supabase) {
      loadDataFromDb();
      
      // Subscribe to Realtime Transfers
      channel = supabase
        .channel('db-transfers')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transfers' }, () => {
          loadDataFromDb();
        })
        .subscribe();
    }

    return () => {
      if (channel) {
        channel.unsubscribe();
      }
    };
  }, [dbMode]);

  // Handle local state simulation for transfers
  const runLocalTransferSimulation = (transferId: string) => {
    setTimeout(() => {
      setTransfers(prev => prev.map(t => {
        if (t.id === transferId) {
          return { ...t, status: 'sending', started_at: new Date().toISOString() };
        }
        return t;
      }));
      
      setTimeout(() => {
        setTransfers(prev => prev.map(t => {
          if (t.id === transferId) {
            return { ...t, status: 'complete', completed_at: new Date().toISOString() };
          }
          return t;
        }));
      }, 2000);
    }, 1000);
  };

  // Queue a new transfer
  const handleQueueTransfer = async (revId: string, machId: string) => {
    if (dbMode === 'supabase' && supabase) {
      const { error } = await supabase
        .from('transfers')
        .insert({
          machine_id: machId,
          revision_id: revId,
          status: 'queued'
        });
      if (error) {
        alert("Failed to queue transfer: " + error.message);
      }
    } else {
      // Local simulation
      const newT: Transfer = {
        id: 't-' + Math.random().toString(36).substr(2, 9),
        machine_id: machId,
        revision_id: revId,
        status: 'queued',
        created_at: new Date().toISOString(),
        initiated_by: 'Programmer John',
        machine: machines.find(m => m.id === machId),
        revision: revisions.find(r => r.id === revId),
        substitution_map: {
          entries: [
            {
              program_id: selectedProgram?.id || '',
              revision_id: revId,
              original_o_number: parsedPreview?.o_number || 1001,
              assigned_o_number: 1000 + Math.floor(Math.random() * 5000)
            }
          ],
          created_at: new Date().toISOString()
        }
      };
      setTransfers(prev => [newT, ...prev]);
      runLocalTransferSimulation(newT.id);
    }
  };

  // Upload program handler
  const handleUploadProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartNumber || !newGCode) return;

    const progId = 'p-' + Math.random().toString(36).substr(2, 9);
    const revId = 'r-' + Math.random().toString(36).substr(2, 9);

    const newProg: Program = {
      id: progId,
      customer_id: 'c1',
      part_number: newPartNumber,
      operation_number: newOpNumber,
      description: newDescription,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const newRev: ProgramRevision = {
      id: revId,
      program_id: progId,
      revision: 1,
      status: 'draft',
      file_path: `grace/${newPartNumber}${newOpNumber ? '-' + newOpNumber : ''}.cnc`,
      file_size: newGCode.length,
      file_hash: 'sha256-' + Math.random().toString(36).substr(2, 12),
      channel_count: parsedPreview?.channels.length || 1,
      has_parameter_block: parsedPreview?.channels.some(c => c.delimiter === '$0') || false,
      notes: newNotes || 'Initial ingest via upload',
      submitted_by: 'Programmer John',
      created_at: new Date().toISOString(),
      program: newProg
    };

    if (dbMode === 'supabase' && supabase) {
      // In a real flow, we'd also upload to Storage. We'll insert DB rows here.
      const { error: pErr } = await supabase.from('programs').insert(newProg);
      if (!pErr) {
        await supabase.from('program_revisions').insert(newRev);
        loadDataFromDb();
      }
    } else {
      setPrograms(prev => [newProg, ...prev]);
      setRevisions(prev => [newRev, ...prev]);
      setSelectedProgram(newProg);
    }

    // Reset forms
    setShowUploadModal(false);
    setNewPartNumber('');
    setNewOpNumber('');
    setNewDescription('');
    setNewGCode('');
    setNewNotes('');
  };

  const handleApproveRevision = async (revId: string) => {
    if (dbMode === 'supabase' && supabase) {
      await supabase
        .from('program_revisions')
        .update({ status: 'approved', approved_by: '00000000-0000-0000-0000-000000000000', approved_at: new Date().toISOString() })
        .eq('id', revId);
      loadDataFromDb();
    } else {
      setRevisions(prev => prev.map(r => {
        if (r.id === revId) {
          return { ...r, status: 'approved', approved_at: new Date().toISOString(), approved_by: 'Lead Supervisor' };
        }
        return r;
      }));
    }
  };

  const filteredPrograms = programs.filter(p => 
    p.part_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedRevisions = revisions.filter(r => r.program_id === selectedProgram?.id);

  return (
    <div className="flex flex-col min-height-screen">
      
      {/* ── Top Bar ──────────────────────────────────────────────────────── */}
      <header className="glass-card" style={{ borderRadius: '0', borderLeft: 'none', borderRight: 'none', borderTop: 'none', padding: '1rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          
          <div className="logo-container">
            <span className="logo-icon">⬡</span>
            <span className="logo-text">tapeworm</span>
            <span className="logo-tag">NC-Base v0.0.1</span>
          </div>

          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {/* Database mode toggle button */}
            <button 
              onClick={() => setDbMode(dbMode === 'supabase' ? 'local' : 'supabase')}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', background: 'rgba(30, 41, 59, 0.4)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border-color)', cursor: 'pointer', color: 'inherit' }}
            >
              <Database size={14} style={{ color: dbMode === 'supabase' ? 'var(--color-success)' : 'var(--color-primary)' }} />
              <span style={{ color: 'var(--text-muted)' }}>Mode:</span>
              <span style={{ fontWeight: 600, color: dbMode === 'supabase' ? 'var(--color-success)' : 'var(--color-primary)' }}>
                {dbMode === 'supabase' ? 'Supabase Live' : 'Local Sandbox'}
              </span>
            </button>

            <button className="btn btn-primary" onClick={() => setShowUploadModal(true)}>
              <UploadCloud size={16} />
              <span>Ingest Program</span>
            </button>
          </div>

        </div>
      </header>

      {/* ── Stats Summary Row ────────────────────────────────────────────── */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', padding: '20px 2rem 0 2rem' }}>
        <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fleet size</div>
            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{machines.length} Machines</div>
          </div>
          <Cpu size={32} style={{ color: 'var(--color-info)', opacity: 0.8 }} />
        </div>

        <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Programs</div>
            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>{programs.length} Parts</div>
          </div>
          <FileCode size={32} style={{ color: 'var(--color-primary)', opacity: 0.8 }} />
        </div>

        <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Transfers</div>
            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>
              {transfers.filter(t => t.status === 'queued' || t.status === 'sending').length} Active
            </div>
          </div>
          <RefreshCw size={32} className="spin" style={{ color: 'var(--color-success)', opacity: 0.8 }} />
        </div>

        <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Approved Rate</div>
            <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px' }}>
              {Math.round((revisions.filter(r => r.status === 'approved' || r.status === 'in_production').length / Math.max(1, revisions.length)) * 100)}%
            </div>
          </div>
          <CheckCircle size={32} style={{ color: 'var(--color-success)', opacity: 0.8 }} />
        </div>
      </section>

      {/* ── Main Layout Workspace Grid ───────────────────────────────────── */}
      <main style={{ display: 'grid', gridTemplateColumns: '280px 1fr 340px', gap: '20px', padding: '20px 2rem', flex: 1 }}>
        
        {/* Left Side: Fleet List */}
        <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary)' }}>Machine Fleet</h2>
            <span style={{ fontSize: '11px', background: 'rgba(30, 41, 59, 0.4)', padding: '2px 8px', borderRadius: '10px', color: 'var(--text-muted)' }}>
              Online
            </span>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {machines.map(m => (
              <div 
                key={m.id}
                onClick={() => setSelectedMachine(m)}
                style={{ 
                  padding: '12px', 
                  borderRadius: '6px', 
                  background: selectedMachine?.id === m.id ? 'rgba(245, 158, 11, 0.08)' : 'rgba(30, 41, 59, 0.2)',
                  border: selectedMachine?.id === m.id ? '1px solid var(--color-primary)' : '1px solid var(--border-color)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>#{m.machine_number}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {m.transfer_mode === 'rs232_serial' ? 'RS-232' : 'NET'}
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {m.make} {m.model}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '10px' }}>
                  <span style={{ color: 'var(--text-dark)' }}>{m.location}</span>
                  <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-success)' }}></span> Ready
                  </span>
                </div>
              </div>
            ))}
          </div>

          {selectedMachine && (
            <div style={{ background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px', padding: '12px', border: '1px solid var(--border-color)', fontSize: '12px' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                <Settings size={12} /> CONFIGURATION
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                {selectedMachine.connection_config.type === 'moxa' && (
                  <>
                    <div>Host: {selectedMachine.connection_config.host}</div>
                    <div>Port: {selectedMachine.connection_config.port}</div>
                    <div>Baud: {selectedMachine.connection_config.baud_rate}</div>
                    <div>Format: {selectedMachine.connection_config.data_bits}{selectedMachine.connection_config.parity.toUpperCase()[0]}{selectedMachine.connection_config.stop_bits}</div>
                    <div>Handshake: {selectedMachine.connection_config.flow_control}</div>
                  </>
                )}
                {selectedMachine.connection_config.type === 'net_share' && (
                  <>
                    <div>Type: Network Share</div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Path: {selectedMachine.connection_config.share_path}</div>
                  </>
                )}
                {selectedMachine.connection_config.type === 'usb_gadget' && (
                  <>
                    <div>Type: USB Gadget</div>
                    <div>Host IP: {selectedMachine.connection_config.pi_host}</div>
                    <div>Mount: {selectedMachine.connection_config.mount_path}</div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Middle Area: Program Browser & Details */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Program list */}
          <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary)' }}>CNC Programs</h2>
              
              {/* Search Bar */}
              <div style={{ position: 'relative', width: '220px' }}>
                <input 
                  type="text" 
                  placeholder="Search parts..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ padding: '4px 8px 4px 28px', fontSize: '12px' }}
                />
                <Search size={12} style={{ position: 'absolute', left: '8px', top: '10px', color: 'var(--text-muted)' }} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px', overflowY: 'auto', flex: 1 }}>
              {filteredPrograms.map(p => (
                <div 
                  key={p.id}
                  onClick={() => setSelectedProgram(p)}
                  className="glass-card"
                  style={{ 
                    padding: '12px',
                    background: selectedProgram?.id === p.id ? 'rgba(245, 158, 11, 0.05)' : 'rgba(15, 22, 36, 0.4)',
                    borderColor: selectedProgram?.id === p.id ? 'var(--color-primary)' : 'var(--border-color)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileCode size={16} style={{ color: 'var(--color-primary)' }} />
                    <span style={{ fontWeight: 600, fontSize: '13px' }}>{p.part_number}</span>
                  </div>
                  {p.operation_number && (
                    <div style={{ fontSize: '10px', color: 'var(--color-info)', fontWeight: 600, marginTop: '4px', fontFamily: 'var(--font-mono)' }}>
                      {p.operation_number}
                    </div>
                  )}
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {p.description}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Program Revision & Action Box */}
          {selectedProgram && (
            <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>{selectedProgram.part_number}</h3>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{selectedProgram.description}</div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <h4 style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revision Log</h4>
                
                {selectedRevisions.map(rev => (
                  <div 
                    key={rev.id}
                    style={{ 
                      padding: '12px', 
                      background: 'rgba(30, 41, 59, 0.2)', 
                      borderRadius: '6px', 
                      border: '1px solid var(--border-color)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>Rev {rev.revision}</span>
                        <span className={`status-pill ${rev.status}`}>
                          {rev.status.replace('_', ' ')}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={10} /> {rev.submitted_by}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {rev.notes}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', borderTop: '0.5px solid var(--border-color)', paddingTop: '8px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--text-dark)', fontFamily: 'var(--font-mono)' }}>
                        File: {rev.file_path}
                      </span>
                      
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {rev.status === 'draft' && (
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => handleApproveRevision(rev.id)}
                          >
                            <Check size={12} /> Approve
                          </button>
                        )}
                        
                        {selectedMachine && (
                          <button 
                            className="btn btn-success" 
                            style={{ padding: '4px 12px', fontSize: '11px' }}
                            disabled={rev.status === 'draft'}
                            title={rev.status === 'draft' ? 'Requires approval before transfer' : `Send to machine #${selectedMachine.machine_number}`}
                            onClick={() => handleQueueTransfer(rev.id, selectedMachine.id)}
                          >
                            <span>Send to #{selectedMachine.machine_number}</span>
                            <ArrowRight size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </section>

        {/* Right Side: Live Transfer Queue */}
        <section className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', overflow: 'hidden' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ fontSize: '14px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-primary)' }}>Transfer Queue</h2>
            <Activity size={16} className="spin" style={{ color: 'var(--color-success)' }} />
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {transfers.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '12px', padding: '40px 0' }}>
                <Clock size={32} style={{ margin: '0 auto 12px auto', opacity: 0.5 }} />
                Queue is empty.<br />Send a program to get started.
              </div>
            ) : (
              transfers.map(t => (
                <div 
                  key={t.id} 
                  className={`glass-card ${t.status === 'sending' ? 'transfer-sending' : ''}`}
                  style={{ 
                    padding: '12px', 
                    background: 'rgba(15, 22, 36, 0.5)',
                    borderWidth: '1px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-main)' }}>
                      #{t.machine?.machine_number} ({t.machine?.make})
                    </span>
                    <span style={{ 
                      fontSize: '10px', 
                      fontWeight: 700, 
                      textTransform: 'uppercase', 
                      color: t.status === 'complete' ? 'var(--color-success)' : t.status === 'sending' ? 'var(--color-primary)' : t.status === 'failed' ? 'var(--color-error)' : 'var(--text-muted)'
                    }}>
                      {t.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Part: {t.revision?.program?.part_number} (Rev {t.revision?.revision})
                  </div>

                  {t.substitution_map && t.substitution_map.entries && t.substitution_map.entries.length > 0 && (
                    <div style={{ marginTop: '8px', padding: '6px', background: 'rgba(7, 11, 20, 0.4)', borderRadius: '4px', border: '0.5px solid var(--border-color)', fontSize: '10px', fontFamily: 'var(--font-mono)' }}>
                      <div style={{ color: 'var(--color-primary)', fontWeight: 600, fontSize: '9px', textTransform: 'uppercase', marginBottom: '2px' }}>O-Number mapping</div>
                      {t.substitution_map.entries.map((entry, index) => (
                        <div key={index} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <span>O{entry.original_o_number}</span>
                          <ChevronRight size={8} />
                          <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>O{entry.assigned_o_number}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {t.error_message && (
                    <div style={{ color: 'var(--color-error)', fontSize: '10px', marginTop: '6px', display: 'flex', gap: '4px', alignItems: 'center' }}>
                      <AlertTriangle size={10} /> {t.error_message}
                    </div>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '9px', color: 'var(--text-dark)' }}>
                    <span>ID: {t.id}</span>
                    <span>{t.created_at ? new Date(t.created_at).toLocaleTimeString() : ''}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

      </main>

      {/* ── Ingest Modal Overlay ─────────────────────────────────────────── */}
      {showUploadModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, backdropFilter: 'blur(4px)' }}>
          <div className="glass-card" style={{ width: '650px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, display: 'flex', gap: '8px', alignItems: 'center' }}>
                <UploadCloud style={{ color: 'var(--color-primary)' }} />
                Ingest New CNC Program
              </h3>
              <button 
                onClick={() => setShowUploadModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleUploadProgram} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Part Number *</label>
                  <input 
                    type="text" 
                    placeholder="e.g. GR-88602-SHAFT" 
                    required 
                    value={newPartNumber}
                    onChange={e => setNewPartNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Operation Number</label>
                  <input 
                    type="text" 
                    placeholder="e.g. OP10 (leave blank for Swiss)" 
                    value={newOpNumber}
                    onChange={e => setNewOpNumber(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Description</label>
                <input 
                  type="text" 
                  placeholder="e.g. Machined sleeve drive shaft" 
                  value={newDescription}
                  onChange={e => setNewDescription(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>Ingest Notes</label>
                <input 
                  type="text" 
                  placeholder="e.g. Toolpaths verified in Mastercam" 
                  value={newNotes}
                  onChange={e => setNewNotes(e.target.value)}
                />
              </div>

              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>G-Code / NC Content *</label>
                <textarea 
                  rows={8} 
                  required
                  placeholder="Paste G-code content here..." 
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '12px' }}
                  value={newGCode}
                  onChange={e => setNewGCode(e.target.value)}
                />
              </div>

              {parsedPreview && (
                <div style={{ background: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '6px', padding: '12px', fontSize: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, color: 'var(--color-primary)', fontSize: '11px', textTransform: 'uppercase', marginBottom: '6px' }}>
                    <Sparkles size={12} /> Auto-Parsed CNC Metadata
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <div>Program Header O-Num: <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{parsedPreview.o_number ? `O${parsedPreview.o_number}` : 'Missing!'}</span></div>
                    <div>Lathe Channels: <span style={{ color: 'var(--text-main)' }}>{parsedPreview.channels.length > 0 ? parsedPreview.channels.map(c => c.delimiter).join(', ') : '1 (Single)'}</span></div>
                    <div style={{ gridColumn: '1 / -1' }}>
                      Subprogram Calls Found: <span style={{ color: 'var(--text-main)' }}>
                        {parsedPreview.subprogram_refs.length > 0 
                          ? parsedPreview.subprogram_refs.map(r => `${r.call_type}${r.ref_number}`).join(', ') 
                          : 'None'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowUploadModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Ingest & Save
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
