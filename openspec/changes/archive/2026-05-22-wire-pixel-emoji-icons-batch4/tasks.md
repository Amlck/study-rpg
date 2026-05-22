## 1. Preflight

- [x] 1.1 `git status` clean — HEAD = `019b1eb wire-pixel-emoji-icons-batch3`.
- [x] 1.2 `openspec validate wire-pixel-emoji-icons-batch4 --strict`.

## 2. Per-component swap

- [x] 2.1 `MigrationBanner.tsx` — 4 banner icon span.
- [x] 2.2 `StudySessionPage.tsx` — 3 state conditional rewrites.
- [x] 2.3 `DoctorRoster.tsx` — 2 swap (sprite fallback + rename btn).
- [x] 2.4 `RenameDoctorModal.tsx` — 2 swap (h2 + error).
- [x] 2.5 `LeaderboardSettingsControls.tsx` — 2 swap (link + rename btn).
- [x] 2.6 `TargetedDrawTutorialOverlay.tsx` — split COPY into `{icon, title, body}` + render swap.
- [x] 2.7 `RoomCard.tsx` — 2 swap (sprite fallback + bonus chip).

## 3. Verify

- [x] 3.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` clean.
- [x] 3.2 Chrome MCP smoke — visit existing pages, count EmojiIcon imgs.
- [x] 3.3 `openspec validate wire-pixel-emoji-icons-batch4 --strict`.
- [x] 3.4 Internal 3-dim verify (mechanical pattern).

## 4. Archive

- [x] 4.1 Sync delta — ADD "Batch 4 integration coverage (mop-up)" + "Final emoji icon coverage milestone" requirements to main spec.
- [x] 4.2 Move to `archive/2026-05-22-wire-pixel-emoji-icons-batch4/`.
- [x] 4.3 Commit `spec(archive): merge wire-pixel-emoji-icons-batch4 — mop-up 7 components`.
