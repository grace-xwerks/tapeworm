-- Tapeworm — initial schema
-- Migration: 20240101000000_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";   -- fuzzy search on part numbers

-- ── Customers ──────────────────────────────────────────────────────────────────

CREATE TABLE customers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL UNIQUE,   -- URL-safe, used in filenames
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Machines ───────────────────────────────────────────────────────────────────

CREATE TABLE machines (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_number    TEXT NOT NULL UNIQUE,  -- "851", "886" etc.
  description       TEXT,
  make              TEXT,
  model             TEXT,
  control_family    TEXT NOT NULL CHECK (control_family IN (
                      'mitsubishi', 'fanuc', 'haas_serial',
                      'haas_net_share', 'brother', 'usb_gadget'
                    )),
  transfer_mode     TEXT NOT NULL CHECK (transfer_mode IN (
                      'rs232_serial', 'net_share', 'usb_gadget'
                    )),
  connection_config JSONB NOT NULL DEFAULT '{}',
  location          TEXT,         -- 'lathe area' | 'mill area'
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Programs (identity — not versioned) ────────────────────────────────────────

CREATE TABLE programs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id      UUID NOT NULL REFERENCES customers(id),
  part_number      TEXT NOT NULL,
  operation_number TEXT,          -- NULL for Swiss lathes (single-operation)
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (customer_id, part_number, operation_number)
);

-- ── Program revisions (versioned) ─────────────────────────────────────────────

CREATE TABLE program_revisions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id           UUID NOT NULL REFERENCES programs(id),
  revision             INTEGER NOT NULL DEFAULT 1,
  status               TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
                         'draft', 'pending_approval', 'approved',
                         'in_production', 'archived'
                       )),
  file_path            TEXT NOT NULL,    -- Supabase Storage path
  file_size            INTEGER,
  file_hash            TEXT,             -- SHA-256
  channel_count        INTEGER NOT NULL DEFAULT 1,
  has_parameter_block  BOOLEAN NOT NULL DEFAULT FALSE,  -- Citizen $0 block
  notes                TEXT,
  submitted_by         UUID REFERENCES auth.users(id),
  approved_by          UUID REFERENCES auth.users(id),
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (program_id, revision)
);

-- ── Program dependency graph ───────────────────────────────────────────────────
-- Stores directed edges: parent calls child via M98/G65
-- Populated at ingest by the G-code parser

CREATE TABLE program_dependencies (
  parent_revision_id UUID NOT NULL REFERENCES program_revisions(id),
  child_revision_id  UUID NOT NULL REFERENCES program_revisions(id),
  PRIMARY KEY (parent_revision_id, child_revision_id),
  CHECK (parent_revision_id != child_revision_id)
);

-- ── Machine program assignments (O-number namespace) ──────────────────────────
-- Each machine has its own O-number namespace.
-- Once assigned, the O-number for a program on a given machine never changes.

CREATE TABLE machine_program_assignments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id  UUID NOT NULL REFERENCES machines(id),
  program_id  UUID NOT NULL REFERENCES programs(id),
  o_number    INTEGER NOT NULL CHECK (o_number >= 1 AND o_number <= 9999),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (machine_id, program_id),   -- one O-number per program per machine
  UNIQUE (machine_id, o_number)      -- O-numbers unique within each machine namespace
);

-- ── Transfers (audit trail — immutable once created) ──────────────────────────

CREATE TABLE transfers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  machine_id       UUID NOT NULL REFERENCES machines(id),
  revision_id      UUID NOT NULL REFERENCES program_revisions(id),
  status           TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
                     'queued', 'sending', 'complete', 'failed'
                   )),
  initiated_by     UUID REFERENCES auth.users(id),
  substitution_map JSONB,          -- immutable rewrite map: {entries: [{original, assigned, ...}]}
  error_message    TEXT,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Program documents ──────────────────────────────────────────────────────────

CREATE TABLE program_documents (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id   UUID NOT NULL REFERENCES programs(id),
  type         TEXT NOT NULL CHECK (type IN (
                 'setup_sheet', 'tool_list', 'inspection_sheet', 'photo', 'other'
               )),
  name         TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by  UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ────────────────────────────────────────────────────────────────────

CREATE INDEX idx_programs_customer       ON programs(customer_id);
CREATE INDEX idx_programs_part_number    ON programs USING gin(part_number gin_trgm_ops);
CREATE INDEX idx_revisions_program       ON program_revisions(program_id);
CREATE INDEX idx_revisions_status        ON program_revisions(status);
CREATE INDEX idx_transfers_status        ON transfers(status) WHERE status IN ('queued', 'sending');
CREATE INDEX idx_transfers_machine       ON transfers(machine_id);
CREATE INDEX idx_assignments_machine     ON machine_program_assignments(machine_id);

-- ── updated_at trigger ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Row-level security ─────────────────────────────────────────────────────────

ALTER TABLE customers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_revisions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_dependencies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_program_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE program_documents          ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read everything
CREATE POLICY "auth_read" ON customers                   FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON machines                    FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON programs                    FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON program_revisions           FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON program_dependencies        FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON machine_program_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON transfers                   FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_read" ON program_documents           FOR SELECT TO authenticated USING (true);

-- CAM programmers can insert draft revisions and submit for approval
CREATE POLICY "cam_insert_revision" ON program_revisions
  FOR INSERT TO authenticated
  WITH CHECK (status = 'draft');

CREATE POLICY "cam_update_draft" ON program_revisions
  FOR UPDATE TO authenticated
  USING (status = 'draft' AND submitted_by = auth.uid());

-- Anyone authenticated can queue a transfer (RLS enforced; agent uses service role)
CREATE POLICY "auth_queue_transfer" ON transfers
  FOR INSERT TO authenticated
  WITH CHECK (status = 'queued');

-- ── Seed: Grace Engineering machines (from machine_inventory.xlsx) ─────────────
-- Run separately via: pnpm db:seed

-- INSERT INTO customers (name, slug) VALUES ('Grace Engineering', 'grace');
-- Machine records will be populated by apps/agent/src/seed/machines.ts
