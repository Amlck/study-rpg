-- =====================================================================
-- 0014_upsert_lww_retirement_log.sql
-- Change: fix-doctor-retire-cloud-resurrection (2026-05-26)
--
-- Extend upsert_lww RPC whitelist + dispatch for the new `retirement_log`
-- table. Body is 0012 verbatim with one new whitelist entry and one new
-- ELSIF branch. Per CLAUDE.md "every change to upsert_lww adds a new
-- numbered migration; existing migrations are never edited in place".
--
-- The dispatch INSERT uses flat columns matching the table schema
-- defined in 0013 (doctor_id / retired_at / subject_id / rarity /
-- refund), modeled on the `hospital_mastery` flat-column pattern in
-- 0009/0012 rather than the `data JSONB` blob pattern used by most
-- collection tables.
--
-- Composite PK is (user_id, doctor_id) so ON CONFLICT references both
-- columns. LWW guard: incoming row only overwrites when its updated_at
-- is strictly greater than the existing row's updated_at.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.upsert_lww(
  table_name TEXT,
  rows       JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid             UUID := auth.uid();
  written_count   INTEGER := 0;
  row_json        JSONB;
  row_updated_at  TIMESTAMPTZ;
  row_app_version TEXT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'upsert_lww: not authenticated';
  END IF;

  IF table_name NOT IN (
    'player_state', 'srs_cards', 'item_instances', 'mentor_backlog',
    'hospital_state', 'hospital_doctors', 'hospital_mastery',
    'hospital_question_history', 'question_bookmarks',
    'targeted_tickets', 'targeted_ticket_history',
    'hospital_monotonic_counters',
    'retirement_log'
  ) THEN
    RAISE EXCEPTION 'upsert_lww: unknown table %', table_name;
  END IF;

  FOR row_json IN SELECT * FROM jsonb_array_elements(rows)
  LOOP
    IF (row_json->>'user_id')::UUID <> uid THEN
      RAISE EXCEPTION 'upsert_lww: user_id mismatch in row (auth.uid()=% row.user_id=%)', uid, row_json->>'user_id';
    END IF;

    row_updated_at  := (row_json->>'updated_at')::TIMESTAMPTZ;
    row_app_version := row_json->>'app_version';

    IF table_name = 'player_state' THEN
      INSERT INTO public.player_state (user_id, data, updated_at, app_version)
      VALUES (uid, row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id) DO UPDATE
        SET data        = EXCLUDED.data,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.player_state.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'mentor_backlog' THEN
      INSERT INTO public.mentor_backlog (user_id, data, updated_at, app_version)
      VALUES (uid, row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.mentor_backlog.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'hospital_state' THEN
      INSERT INTO public.hospital_state (user_id, data, updated_at, app_version)
      VALUES (uid, row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.hospital_state.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'srs_cards' THEN
      INSERT INTO public.srs_cards (user_id, question_id, data, updated_at, app_version)
      VALUES (uid, row_json->>'question_id', row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id, question_id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.srs_cards.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'item_instances' THEN
      INSERT INTO public.item_instances (user_id, id, data, updated_at, app_version)
      VALUES (uid, row_json->>'id', row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id, id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.item_instances.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'hospital_doctors' THEN
      INSERT INTO public.hospital_doctors (user_id, id, data, updated_at, app_version)
      VALUES (uid, row_json->>'id', row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id, id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.hospital_doctors.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'hospital_mastery' THEN
      INSERT INTO public.hospital_mastery (user_id, subject_id, correct, total, updated_at, app_version)
      VALUES (
        uid,
        row_json->>'subject_id',
        COALESCE((row_json->>'correct')::REAL, 0),
        COALESCE((row_json->>'total')::INTEGER, 0),
        row_updated_at,
        row_app_version
      )
      ON CONFLICT (user_id, subject_id) DO UPDATE
        SET correct = EXCLUDED.correct,
            total   = EXCLUDED.total,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.hospital_mastery.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'hospital_question_history' THEN
      INSERT INTO public.hospital_question_history (user_id, question_id, data, updated_at, app_version)
      VALUES (uid, row_json->>'question_id', row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id, question_id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.hospital_question_history.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'question_bookmarks' THEN
      INSERT INTO public.question_bookmarks (user_id, question_id, added_at, updated_at, app_version)
      VALUES (
        uid,
        row_json->>'question_id',
        (row_json->>'added_at')::TIMESTAMPTZ,
        row_updated_at,
        row_app_version
      )
      ON CONFLICT (user_id, question_id) DO UPDATE
        SET added_at    = EXCLUDED.added_at,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.question_bookmarks.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'targeted_tickets' THEN
      INSERT INTO public.targeted_tickets (user_id, id, data, updated_at, app_version)
      VALUES (uid, row_json->>'id', row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id, id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, app_version = EXCLUDED.app_version
        WHERE public.targeted_tickets.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'targeted_ticket_history' THEN
      INSERT INTO public.targeted_ticket_history (user_id, ticket_id, event, data, updated_at, app_version)
      VALUES (
        uid,
        row_json->>'ticket_id',
        row_json->>'event',
        row_json->'data',
        row_updated_at,
        row_app_version
      )
      ON CONFLICT (user_id, ticket_id, event) DO UPDATE
        SET data        = EXCLUDED.data,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.targeted_ticket_history.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'hospital_monotonic_counters' THEN
      INSERT INTO public.hospital_monotonic_counters (user_id, data, updated_at, app_version)
      VALUES (uid, row_json->'data', row_updated_at, row_app_version)
      ON CONFLICT (user_id) DO UPDATE
        SET data        = EXCLUDED.data,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.hospital_monotonic_counters.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;

    ELSIF table_name = 'retirement_log' THEN
      INSERT INTO public.retirement_log (
        user_id, doctor_id, retired_at, subject_id, rarity, refund,
        updated_at, app_version
      )
      VALUES (
        uid,
        row_json->>'doctor_id',
        COALESCE((row_json->>'retired_at')::BIGINT, 0),
        row_json->>'subject_id',
        row_json->>'rarity',
        COALESCE((row_json->>'refund')::INTEGER, 0),
        row_updated_at,
        row_app_version
      )
      ON CONFLICT (user_id, doctor_id) DO UPDATE
        SET retired_at  = EXCLUDED.retired_at,
            subject_id  = EXCLUDED.subject_id,
            rarity      = EXCLUDED.rarity,
            refund      = EXCLUDED.refund,
            updated_at  = EXCLUDED.updated_at,
            app_version = EXCLUDED.app_version
        WHERE public.retirement_log.updated_at < EXCLUDED.updated_at;
      GET DIAGNOSTICS written_count = ROW_COUNT;
    END IF;
  END LOOP;

  RETURN written_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_lww(TEXT, JSONB) TO authenticated;
