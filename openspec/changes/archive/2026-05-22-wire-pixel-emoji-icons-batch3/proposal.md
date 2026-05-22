## Why

Batch 1 ship 6 modal/banner、batch 2 ship 3 high-density page。Batch 3 把剩餘**中等密度 component**（每檔 5-9 處 emoji）一次掃完，達成 medexam2 hospital app 內所有 ≥5 emoji 的 component 都 swap 為 pixel art baseline 的覆蓋目標。剩 <5 line 的長尾小檔留 batch 4 mop-up。

選在此時做的理由：(1) batch 1 + 2 共 41 sites swap 都 typecheck + Chrome MCP smoke 全綠、pattern 穩定；(2) 中等密度 component 多為 modal（onboarding / migration / consent / detail dialog），個別 trigger 麻煩、smoke 路徑 page-level 已驗，靠 typecheck + DOM-render 推論為主；(3) 一次掃完 ≥5 layer 比拖到 batch 4 mop-up 容易維護 mental model.

## What Changes

12 component swap，所有 standalone emoji-as-icon JSX position 改成 `<EmojiIcon>`：

- **SyncStatusChip.tsx** — 2 button labels（⬆ 立即同步上傳 / ⬇ 立即同步下載）；chip icon object literals 內的 emoji 保留為文字（render site `<span>{chip.icon}</span>` 可改為 `<EmojiIcon char={chip.icon}>` 一處）.
- **LeaderboardOptInModal.tsx** — h2 🏆 + 5 list items（🏥 / 📈 / 👨‍⚕️ / 📖 / 🏷️）.
- **ConflictChooserModal.tsx** — 7 swap：warning ⚠ × 2 / migration label 📱 ☁ × 2 / button label ☁ 📱 ⏸.
- **FateCardPage.tsx** — 5 swap：ticket counter ⭐ / pending notice 🎫 / outcome conditional ⚡ / 🎁 / pity tag 🎯 / history conditional.
- **V6MigrationModal.tsx** — 5 swap：h2 🏥 + 4 section header strong（📖 / 💰 / ⬆ / 🎯）.
- **QuizBugReportSheet.tsx** — 1 swap：h2 🐞（CATEGORY_LABELS object 內保留為文字，render 進 `<option>` 不能 swap）.
- **ERConsultDialog.tsx** — 4 swap：h2 🚨 / 💡 notice prefix / 🩺 sprite fallback / 📷 missing image.
- **AccountSwitchPrompt.tsx** — 6 swap：warning ⚠ × 2 / migration label 📱 ☁ / button label 🧹 🔀.
- **Hospital.tsx** — 1 swap：h2 🏗（其餘 prose-inside 💰 與 title attribute 保留為文字）.
- **MigrationUploadPrompt.tsx** — 5 swap：header ☁ / button label ☁ 🔒 ⏰ / error ⚠.
- **AuthButton.tsx** — 4 swap：label ☁ / button content ☁ × 2 / button 🔄 切換帳號. confirm() dialog 內 ⚠ 保留為文字（HTML 原生 dialog 不支援 JSX）.
- **AssignDoctorModal.tsx** — 1 swap：sprite fallback 🩺. 其餘 prose-inside 💰 與 title attribute 保留為文字.

**保留為 native 字** (同 batch 1/2 規則)：
- prose-inside `{cost} 💰` 在 `<p>` / `<strong>` 內
- HTML attribute（`title=`, native `window.confirm()` dialog content）
- `<select><option>` 的 child（HTML restriction）
- 不在 codex set 內的字（✓ ✕ — EmojiIcon 自動 fallback、效果跟保留 char 相同）

範圍外：剩 8 個檔（< 5 emoji 密度）— MigrationBanner, StudySessionPage, DoctorRoster, RenameDoctorModal, LeaderboardSettingsControls, TargetedDrawTutorialOverlay, RoomCard, NicknameField — 留 batch 4 mop-up。Service 層（services/, lib/sync/, lib/srs-scheduler.ts）內的 emoji 是字串/註解，不入 swap 範圍.

## Capabilities

### Modified Capabilities
- `ui-emoji-icons`: ADD a new requirement listing the 12 components covered in batch 3 + grep-able verification scenarios.

## Impact

**Affected code:** 12 files in `apps/medexam2-hospital-tw/src/components/` and `apps/medexam2-hospital-tw/src/pages/`（清單見 What Changes 段）.

**Not affected:** core / theme / content / asset bundle / 一階 / EmojiIcon API. 同 batch 1/2.

**Risk surface:**
- 多檔同時 edit、容易踩 surrounding layout（特別是 button vertical-align）對策：每個 file commit 完跑 typecheck 一次；最後 Chrome MCP DOM count check 全頁面.
- 部分 modal 觸發路徑深（V6Migration 需 first-time onboarding；ERConsult 需 random spawn；ConflictChooser 需多 device sign-in）— Chrome MCP 不易自動 trigger. 靠 typecheck + spec scenario 抽樣驗證.
- `👨‍⚕️` (`1f468-200d-2695-fe0f`) 是 ZWJ sequence、不在 manifest，會 fallback 為原 char render；對 LeaderboardOptInModal 「醫師個數」list item 預期效果是「pixel art icon + 文字 fallback 混搭」.
