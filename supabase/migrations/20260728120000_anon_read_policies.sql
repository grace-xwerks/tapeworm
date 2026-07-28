-- Grant anonymous read access to all domain tables.
--
-- Why: apps/web creates its Supabase client with the anon key and never calls
-- supabase.auth.* — there is no login flow (see apps/web/src/App.tsx:33 and the
-- queries at :288). The initial schema granted SELECT to `authenticated` only,
-- so the dashboard connected successfully but rendered zero rows while 41
-- machines sat in the table.
--
-- SECURITY NOTE: this exposes the program library to anyone who can reach the
-- Kong endpoint (port 8000). docs/cnc_programmer_workflow.md describes CNC
-- programs as customer-owned IP with cryptographic provenance requirements.
-- Accepted deliberately for the isolated lab bring-up. Revisit before this node
-- reaches the shop LAN or before real customer programs are ingested — the
-- durable fix is an auth flow in apps/web, at which point these policies should
-- be dropped.
--
-- Writes are unaffected: INSERT/UPDATE remain restricted to `authenticated`,
-- and the transfer agent continues to bypass RLS via the service role.

CREATE POLICY anon_read ON customers                   FOR SELECT TO anon USING (true);
CREATE POLICY anon_read ON machines                    FOR SELECT TO anon USING (true);
CREATE POLICY anon_read ON programs                    FOR SELECT TO anon USING (true);
CREATE POLICY anon_read ON program_revisions           FOR SELECT TO anon USING (true);
CREATE POLICY anon_read ON program_dependencies        FOR SELECT TO anon USING (true);
CREATE POLICY anon_read ON program_documents           FOR SELECT TO anon USING (true);
CREATE POLICY anon_read ON machine_program_assignments FOR SELECT TO anon USING (true);
CREATE POLICY anon_read ON transfers                   FOR SELECT TO anon USING (true);
