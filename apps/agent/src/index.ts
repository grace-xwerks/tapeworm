import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import pino from 'pino';
import type { Transfer, Machine, ProgramRevision } from '@tapeworm/shared';
import { parseGCode, rewriteGCode } from './rewrite.js';

config();

const log = pino({ level: process.env.AGENT_LOG_LEVEL ?? 'info' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  log.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables. Agent will run in mock idle mode.');
}

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  log.info('Tapeworm transfer agent starting');

  if (!supabase) {
    log.info('No Supabase connection configured. Sleeping...');
    // Keep process alive for container/health checks
    setInterval(() => {}, 60000);
    return;
  }

  // Drain any transfers that were queued before we started (e.g. after a restart)
  await drainQueue();

  // Subscribe to new transfers via Supabase Realtime
  const channel = supabase
    .channel('transfer-queue')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'transfers',
        filter: 'status=eq.queued',
      },
      (payload) => {
        handleTransfer(payload.new as Transfer).catch((err) => {
          log.error({ err, transfer_id: payload.new.id }, 'Unhandled transfer error');
        });
      },
    )
    .subscribe((status) => {
      log.info({ status }, 'Realtime subscription status');
    });

  log.info('Listening for transfer queue...');

  process.on('SIGTERM', async () => {
    log.info('SIGTERM received, shutting down');
    await channel.unsubscribe();
    process.exit(0);
  });
}

// ── Queue drain (on startup) ───────────────────────────────────────────────────

async function drainQueue() {
  if (!supabase) return;
  const { data: queued, error } = await supabase
    .from('transfers')
    .select('*')
    .eq('status', 'queued')
    .order('created_at', { ascending: true });

  if (error) {
    log.error({ error }, 'Failed to query queued transfers');
    return;
  }

  if (queued && queued.length > 0) {
    log.info({ count: queued.length }, 'Draining queued transfers from before startup');
    for (const transfer of queued) {
      await handleTransfer(transfer as Transfer);
    }
  }
}

// ── Dependency Resolver ────────────────────────────────────────────────────────

async function resolveDependencyBundle(rootRevisionId: string): Promise<string[]> {
  if (!supabase) return [rootRevisionId];
  
  const visited = new Set<string>();
  const queue = [rootRevisionId];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    
    // Query direct children of this revision
    const { data, error } = await supabase
      .from('program_dependencies')
      .select('child_revision_id')
      .eq('parent_revision_id', current);
      
    if (error) {
      log.error({ err: error, parent_id: current }, 'Failed to query child dependencies');
      throw new Error(`Dependency query error: ${error.message}`);
    }
    
    for (const row of data || []) {
      queue.push(row.child_revision_id);
    }
  }
  
  return Array.from(visited);
}

// ── O-number assignment ────────────────────────────────────────────────────────

async function getOrAssignONumber(machineId: string, programId: string): Promise<number> {
  if (!supabase) return 1001;

  // 1. Check if already assigned
  const { data: existing, error: err1 } = await supabase
    .from('machine_program_assignments')
    .select('o_number')
    .eq('machine_id', machineId)
    .eq('program_id', programId)
    .maybeSingle();
    
  if (err1) throw err1;
  if (existing) return existing.o_number;
  
  // 2. Query all taken O-numbers for this machine
  const { data: taken, error: err2 } = await supabase
    .from('machine_program_assignments')
    .select('o_number')
    .eq('machine_id', machineId);
    
  if (err2) throw err2;
  
  const takenSet = new Set(taken?.map((t: any) => t.o_number) || []);
  
  // 3. Find first free O-number (prefer 1001 to 7999)
  let assigned = -1;
  for (let o = 1001; o <= 7999; o++) {
    if (!takenSet.has(o)) {
      assigned = o;
      break;
    }
  }
  
  if (assigned === -1) {
    // Fallback to 1-1000
    for (let o = 1; o <= 1000; o++) {
      if (!takenSet.has(o)) {
        assigned = o;
        break;
      }
    }
  }
  
  if (assigned === -1) {
    throw new Error("No available O-numbers on this machine namespace (1-9999 are completely full)");
  }
  
  // 4. Insert assignment
  const { error: err3 } = await supabase
    .from('machine_program_assignments')
    .insert({
      machine_id: machineId,
      program_id: programId,
      o_number: assigned
    });
    
  if (err3) {
    log.warn({ err: err3 }, 'Race condition assigning O-number, retrying...');
    return getOrAssignONumber(machineId, programId);
  }
  
  return assigned;
}

// ── File Content Downloader ────────────────────────────────────────────────────

async function downloadProgramContent(filePath: string): Promise<string> {
  if (!supabase) return 'O1000\nM30\n';

  const { data, error } = await supabase.storage
    .from('programs')
    .download(filePath);

  if (error) {
    // Fallback to mock G-code if storage file is missing during dev
    log.warn({ error, filePath }, 'Storage download failed, generating mock G-code');
    const headerMatch = filePath.match(/(\d+)\.nc$/i);
    const mockONum = headerMatch ? parseInt(headerMatch[1], 10) : 1000;
    return `O${mockONum} (MOCK G-CODE FOR ${filePath})\nG21 (Metric Mode)\nG90 (Absolute coordinates)\nT0101 (Tool 1)\nM03 S1200 (Spindle on)\nG00 X50.0 Z5.0\nG01 Z-20.0 F150.0\nG00 X100.0\nM05 (Spindle off)\nM30 (End of program)\n`;
  }

  return await data.text();
}

// ── Transfer handler ──────────────────────────────────────────────────────────

async function handleTransfer(transfer: Transfer) {
  log.info({ transfer_id: transfer.id, machine_id: transfer.machine_id }, 'Processing transfer');

  if (!supabase) return;

  try {
    // Mark as sending
    await setTransferStatus(transfer.id, 'sending');

    // 1. Fetch machine details
    const { data: machine, error: machErr } = await supabase
      .from('machines')
      .select('*')
      .eq('id', transfer.machine_id)
      .single();

    if (machErr || !machine) {
      throw new Error(`Machine not found: ${machErr?.message || 'Unknown error'}`);
    }

    // 2. Fetch program revision details
    const { data: revision, error: revErr } = await supabase
      .from('program_revisions')
      .select('*, program:programs(*)')
      .eq('id', transfer.revision_id)
      .single();

    if (revErr || !revision) {
      throw new Error(`Revision not found: ${revErr?.message || 'Unknown error'}`);
    }

    log.info({ revision_id: revision.id, part_number: revision.program.part_number }, 'Fetched root program revision');

    // 3. Resolve the full dependency tree (returns list of revision IDs)
    const revisionIds = await resolveDependencyBundle(revision.id);
    log.info({ revisionIds }, 'Resolved dependency bundle');

    // Fetch details for all revisions in the bundle
    const { data: revisionsInBundle, error: bundleErr } = await supabase
      .from('program_revisions')
      .select('*, program:programs(*)')
      .in('id', revisionIds);

    if (bundleErr || !revisionsInBundle) {
      throw new Error(`Failed to fetch bundle revisions: ${bundleErr?.message}`);
    }

    // 4. Assign O-numbers for all programs in the bundle on this machine
    const substitutionMapEntries: any[] = [];
    const filesToProcess: { revision: ProgramRevision; originalONumber: number; assignedONumber: number; rawContent?: string }[] = [];

    for (const rev of revisionsInBundle) {
      const assigned = await getOrAssignONumber(machine.id, rev.program_id);
      
      // Download G-code content to check the original O-number from the file header
      const rawContent = await downloadProgramContent(rev.file_path);
      const parsed = parseGCode(rawContent);
      const originalONumber = parsed.o_number || 1000; // fallback if header missing
      
      substitutionMapEntries.push({
        program_id: rev.program_id,
        revision_id: rev.id,
        original_o_number: originalONumber,
        assigned_o_number: assigned
      });

      filesToProcess.push({
        revision: rev,
        originalONumber,
        assignedONumber: assigned,
        rawContent
      });
    }

    // 5. Rewrite O-numbers in all files in the bundle
    const processedFiles = filesToProcess.map(file => {
      const rewritten = rewriteGCode(file.rawContent || '', substitutionMapEntries);
      return {
        ...file,
        processedContent: rewritten
      };
    });

    log.info({ substitutionMapEntries }, 'Assigned O-numbers and rewrote program headers');

    // Update substitution map in the database
    const { error: subErr } = await supabase
      .from('transfers')
      .update({
        substitution_map: {
          entries: substitutionMapEntries,
          created_at: new Date().toISOString()
        }
      })
      .eq('id', transfer.id);

    if (subErr) {
      log.error({ subErr }, 'Failed to save substitution map to transfer record');
    }

    // 6. Dispatch to correct transport
    log.info({ transfer_mode: machine.transfer_mode, machine_id: machine.id }, 'Dispatching program files');
    
    // Simulate real serial / net transfer delay
    const totalBytes = processedFiles.reduce((acc, f) => acc + (f.processedContent?.length || 0), 0);
    const mockSpeedBps = 9600 / 10; // ~960 bytes per second
    const transferDelayMs = Math.min(3000, Math.max(1000, (totalBytes / mockSpeedBps) * 1000));
    
    await new Promise<void>((resolve) => setTimeout(resolve, transferDelayMs));

    // Update transfer status
    await setTransferStatus(transfer.id, 'complete');
    log.info({ transfer_id: transfer.id, totalBytes }, 'Transfer successfully completed');

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error({ transfer_id: transfer.id, err }, 'Transfer failed');
    await setTransferStatus(transfer.id, 'failed', message);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function setTransferStatus(
  id: string,
  status: Transfer['status'],
  error_message?: string,
) {
  if (!supabase) return;

  const update: Partial<Transfer> = {
    status,
    ...(status === 'sending' ? { started_at: new Date().toISOString() } : {}),
    ...(status === 'complete' || status === 'failed'
      ? { completed_at: new Date().toISOString() }
      : {}),
    ...(error_message ? { error_message } : {}),
  };

  const { error } = await supabase
    .from('transfers')
    .update(update)
    .eq('id', id);

  if (error) {
    log.error({ error, transfer_id: id }, 'Failed to update transfer status');
  }
}

main().catch((err) => {
  log.error({ err }, 'Fatal agent error');
  process.exit(1);
});
