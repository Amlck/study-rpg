-- =====================================================================
-- 0015_delete_my_data_retirement_log.sql
-- Change: fix-doctor-retire-cloud-resurrection (2026-05-26)
--
-- Extend delete_my_data() to wipe the new `retirement_log` table on
-- 「重置此帳號進度」. Body is 0012 verbatim with one new DELETE
-- statement, placed AFTER `hospital_doctors` so the deletion order
-- respects the logical pairing (drop doctors first, then their
-- tombstones — though order is not strictly required since both rows
-- belong to the same user).
--
-- Per CLAUDE.md "every change to upsert_lww adds a new numbered
-- migration; existing migrations are never edited in place. Same
-- applies to delete_my_data."
--
-- Without this migration, an in-place account reset would leave stale
-- cloud retirement_log rows behind. The next sign-in's cold-start
-- force-pull + reconcileRetiredDoctors() would then iterate those
-- tombstones and could erroneously delete any newly-recruited doctor
-- that happens to share an id (probability negligible with UUIDs,
-- but spec coverage required). See openspec/specs/hospital-finances/
-- spec.md "Account reset wipes both local retirementLog AND cloud
-- retirement_log".
-- =====================================================================

CREATE OR REPLACE FUNCTION public.delete_my_data()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'delete_my_data: not authenticated';
  END IF;

  DELETE FROM public.player_state                  WHERE user_id = uid;
  DELETE FROM public.srs_cards                     WHERE user_id = uid;
  DELETE FROM public.item_instances                WHERE user_id = uid;
  DELETE FROM public.mentor_backlog                WHERE user_id = uid;
  DELETE FROM public.hospital_state                WHERE user_id = uid;
  DELETE FROM public.hospital_doctors              WHERE user_id = uid;
  DELETE FROM public.retirement_log                WHERE user_id = uid;
  DELETE FROM public.hospital_mastery              WHERE user_id = uid;
  DELETE FROM public.hospital_question_history     WHERE user_id = uid;
  DELETE FROM public.hospital_monotonic_counters   WHERE user_id = uid;

  -- Bump the reset marker so other devices wipe local on next pull gate.
  INSERT INTO public.account_metadata (user_id, last_reset_at)
  VALUES (uid, now())
  ON CONFLICT (user_id) DO UPDATE
    SET last_reset_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_data() TO authenticated;
