-- =====================================================================
-- retirement_log_rls.sql — manual RLS sanity check for 0013/0014/0015
-- Change: fix-doctor-retire-cloud-resurrection (2026-05-26)
--
-- Run these in the Supabase dashboard SQL editor AFTER applying
-- 0013_retirement_log.sql, 0014_upsert_lww_retirement_log.sql, and
-- 0015_delete_my_data_retirement_log.sql in that order. They are not
-- auto-run by any pipeline; they document the expected behaviour.
-- =====================================================================

-- ─── 1. Unauthenticated SELECT returns zero rows ──────────────────────
-- Run while logged out / as anon role.
SET ROLE anon;
SELECT count(*) FROM public.retirement_log;
-- Expected: 0 (RLS filters everything, no rows visible)
RESET ROLE;

-- ─── 2. upsert_lww whitelist accepts 'retirement_log' ─────────────────
-- Empty rows array — should succeed with written_count = 0.
-- If 0014 was not applied: RAISE EXCEPTION 'upsert_lww: unknown table'.
SELECT public.upsert_lww('retirement_log', '[]'::jsonb);
-- Expected: 0

-- ─── 3. Client startup probe equivalent ───────────────────────────────
-- The engine.start()'s runStartupProbe() invokes the same RPC. If this
-- call succeeds with 0, the client will leave 'pending' and proceed to
-- cold-start force-pull. If it errors, the client stays paused with
-- pausedReason = 'whitelist_missing:retirement_log'.

-- ─── 4. Authenticated INSERT of own row succeeds via RPC ──────────────
-- Run while signed in as a real user. The RPC sets user_id from
-- auth.uid() internally; you can pass any user_id in the row payload
-- and it'll be checked against auth.uid() (mismatched user_id raises).
--
-- Equivalent client-side call:
--   await supabase.rpc('upsert_lww', {
--     table_name: 'retirement_log',
--     rows: [{
--       user_id: auth.uid(),
--       updated_at: new Date().toISOString(),
--       doctor_id: 'test-doc-x',
--       retired_at: Date.now(),
--       subject_id: '內科',
--       rarity: 'P3',
--       refund: 2000,
--     }],
--   })
-- Expected: 1 (row inserted)

-- ─── 5. delete_my_data() wipes retirement_log ─────────────────────────
-- After inserting a test row (step 4), call delete_my_data() and
-- verify the row is gone. The RPC must include the new DELETE from 0015.
--
-- SELECT public.delete_my_data();
-- SELECT count(*) FROM public.retirement_log WHERE user_id = auth.uid();
-- Expected: 0

-- ─── 6. LWW guard: stale updated_at rejected ──────────────────────────
-- Insert with a recent updated_at, then attempt to overwrite with an
-- earlier updated_at — second call should leave row unchanged.
--
-- (See change tasks.md §8.2 / §8.3 for full Vitest coverage of LWW
-- semantics across the adapter + RPC.)
