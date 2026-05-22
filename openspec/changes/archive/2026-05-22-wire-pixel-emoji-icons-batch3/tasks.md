## 1. Preflight

- [x] 1.1 `git status` clean — HEAD = `0ad7f38 wire-pixel-emoji-icons-batch2`.
- [x] 1.2 `openspec validate wire-pixel-emoji-icons-batch3 --strict`.

## 2. Per-component swap

- [x] 2.1 `SyncStatusChip.tsx` — chip render site + 2 button labels.
- [x] 2.2 `LeaderboardOptInModal.tsx` — h2 + 5 list items.
- [x] 2.3 `ConflictChooserModal.tsx` — 7 swap.
- [x] 2.4 `FateCardPage.tsx` — 5 swap.
- [x] 2.5 `V6MigrationModal.tsx` — h2 + 4 section header.
- [x] 2.6 `QuizBugReportSheet.tsx` — 1 h2 swap.
- [x] 2.7 `ERConsultDialog.tsx` — 4 swap.
- [x] 2.8 `AccountSwitchPrompt.tsx` — 6 swap.
- [x] 2.9 `Hospital.tsx` — 1 h2 swap.
- [x] 2.10 `MigrationUploadPrompt.tsx` — 5 swap.
- [x] 2.11 `AuthButton.tsx` — 4 swap.
- [x] 2.12 `AssignDoctorModal.tsx` — 1 sprite fallback swap.

## 3. Verify

- [x] 3.1 `pnpm --filter @study-rpg/medexam2-hospital-tw typecheck` clean.
- [x] 3.2 Chrome MCP smoke — HomePage (RecruitmentBanner / ticket counter) + visit accessible routes (#/bookmarks / #/leaderboard / #/training / #/fate-cards / #/hospital) DOM count check.
- [x] 3.3 `openspec validate wire-pixel-emoji-icons-batch3 --strict` re-validate.
- [x] 3.4 Internal 3-dim verify (mechanical pattern, same as batch 1/2).

## 4. Archive

- [x] 4.1 Append "Batch 3 integration coverage" ADDED requirement to `openspec/specs/ui-emoji-icons/spec.md`.
- [x] 4.2 Move to `archive/2026-05-22-wire-pixel-emoji-icons-batch3/`.
- [x] 4.3 Commit `spec(archive): merge wire-pixel-emoji-icons-batch3 — 12 components swap`.
