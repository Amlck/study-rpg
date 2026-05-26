-- =====================================================================
-- 0013_retirement_log.sql
-- Change: fix-doctor-retire-cloud-resurrection (2026-05-26)
--
-- Bring the 二階 `retirementLog` Dexie table into the cloud-sync surface
-- so retire events propagate cross-device. The `retirementLog` row is
-- the authoritative tombstone for the paired `hospital_doctors` row —
-- see openspec/specs/cloud-sync/spec.md "Row deletion in collection
-- tables SHALL propagate via tombstone-table mechanism".
--
-- This migration is split into three (0013 table+RLS, 0014 upsert_lww
-- whitelist extend, 0015 delete_my_data extend) per CLAUDE.md
-- convention "every change to upsert_lww adds a new numbered migration;
-- existing migrations are never edited in place". They MUST be applied
-- in strict order — see openspec/specs/cloud-sync/spec.md "upsert_lww
-- whitelist coverage SHALL be probed at engine startup" for the
-- client-side startup probe that catches partial-deploy state.
--
-- Schema choice: flat columns (mirrors `hospital_mastery` pattern from
-- 0001) instead of `data JSONB` blob, because retirement_log rows have
-- a small fixed schema with no need for nested adapter-side flexibility.
-- ON DELETE CASCADE to auth.users handles full-account-deletion case.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.retirement_log (
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doctor_id   TEXT NOT NULL,
  retired_at  BIGINT NOT NULL,
  subject_id  TEXT NOT NULL,
  rarity      TEXT NOT NULL,
  refund      INTEGER NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  app_version TEXT,
  PRIMARY KEY (user_id, doctor_id)
);

CREATE INDEX IF NOT EXISTS idx_retirement_log_user_updated
  ON public.retirement_log (user_id, updated_at);

ALTER TABLE public.retirement_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY retirement_log_select ON public.retirement_log
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY retirement_log_insert ON public.retirement_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY retirement_log_update ON public.retirement_log
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY retirement_log_delete ON public.retirement_log
  FOR DELETE USING (auth.uid() = user_id);
