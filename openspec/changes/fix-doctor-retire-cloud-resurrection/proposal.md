## Why

二階玩家回報「醫師用 AAD 退休後，重整頁面醫師會自己回來、營收還是繼續上漲」。Root cause：sync engine 的 `deleting` hook 只清 dirty marker，從不把 delete propagate 到 Supabase（雲端那筆 `hospital_doctors` 永遠留著舊 `updated_at`），cold-start `engine.start()` 又必定 `pullAllNow({force:true})` 全量強制覆寫 local（這條來自 `fix-account-switch-data-loss` 的安全網），於是雲端那筆退休的醫師被 force-apply 回 Dexie，tick loop 把它當活人繼續計入 throughput 與 reputation。玩家還拿到了 retire 的 `powerMultiplier × 1000` refund，等於 double dip。

延伸影響：任何 collection-shape 表（doctors / mastery / questionHistory / bookmarks / targeted_tickets / achievements）的 row-level delete 在 Supabase read path 下都會被 cold-start force-pull 復活；目前 retire 是最明顯的觸發點，但所有未來會刪 row 的功能都會踩同一個坑。

## What Changes

- Sync engine 認可一個「tombstone 替代品」：`retirementLog` 表本身就是退休醫師的不可變紀錄，已經被 `services/retire.ts` 同 tx 寫入。把它升級成 synced collection（新 Supabase table + RLS + `upsert_lww` whitelist 第 10 項 + R2 `m2` bundle 新 key + Dexie hook），sync engine 拿來當權威 tombstone。
- `HOSPITAL_DOCTORS.applyToLocal` 在寫入前先檢查該 `doctorId` 是否已出現在 `retirementLog`：是 → skip cloud write 並 delete 該筆 local doctor 殘留。
- 新增 post-pull reconcile（`reconcileRetiredDoctors`）：在現有 `onPullComplete` chain 內、`checkAssignmentInvariants` 之前，iterate `retirementLog` 把 local 殘留的對應 doctor row 清掉，覆蓋 race condition（cloud_row 應用順序剛好 doctor 在 retirementLog 之前）。
- R2 `m2` bundle `SCHEMA_VERSION` 1→2→3→**4**，新增 `retirementLog` top-level data key。v4 client 讀 v3 bundle 把該 key 預設成 `[]`；v3 client 讀 v4 bundle 忽略未知 key（與既有 v2→v3 升級的兼容策略一致）。
- **Bundle push schema_version monotonic guard**（codex audit 修補）：`pushBundle` 在 PUT 之前檢查 cached cloud schema_version ≥ local SCHEMA_VERSION，downgrade 直接 throw `r2_schema_downgrade_refused` 拒寫，防止 v3 client 覆寫 v4 cloud bundle 把 retirement_log key 抹掉。
- **Startup whitelist probe**（codex audit 修補）：engine.start 完成 hook 安裝後、cold-start force-pull 前，跑 no-op `upsert_lww('retirement_log', [])`；失敗（partial migration → unknown table）→ engine 進 `paused` 狀態、不裝 debounce timer、不跑 pullAllNow，避免 pushAllNow 結尾 `dirty.perTable.values().clear()` 把 retire tombstone 的 dirty marker 永久燒掉。
- **Account lifecycle 全面覆蓋 retirementLog**（codex audit 修補）：`apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts` 的 `clearLocalSyncTables` 表清單加 `db.retirementLog`；新 Supabase migration 0015 `CREATE OR REPLACE delete_my_data()` 加 `DELETE FROM public.retirement_log`；防止換帳號 / 重置進度後 stale tombstone 污染新 state 或誤刪新醫師。
- Dexie schema **v18 → v19** migration（前作 `tidy-tabs-add-study-stats-medexam2` 已用 v18 加 `dailyStudyLog` table，本 change 不可重用 v18），把 `retirementLog` pk 從 `++id` 改 `doctorId` 並加 `_updatedAt` LWW field。
- Supabase migration **0013（建表）+ 0014（`upsert_lww` whitelist extend）+ 0015（`delete_my_data` extend）**，沿用既有「never edit existing migrations」紀律（前作 migration 已排到 0012_hospital_monotonic_counters.sql）。
- `services/retire.ts` **不改邏輯**（既有 tx 已正確寫 `retirementLog` row 並 delete doctor），只是現在會被 sync 帶到雲端與其他裝置。
- **BREAKING (sync 層級, M_2nd only)**：v3 client 在裝過 v4 client 後切回 v3 build 進入 broken push 狀態（push 全被 schema_version guard 拒絕），跟「rollback 已知缺口」一致；玩家更新到 v4 build 就恢復。

## Capabilities

### New Capabilities

無 — 不新增 spec。

### Modified Capabilities

- `cloud-sync`: 新增一條 Requirement 規範「row deletion via tombstone-table」(retirementLog) 的同步語意 — 包含 push 路徑、apply 路徑碰撞時的解決順序、cold-start force-pull 與此機制的互動、跨裝置反序到達情境。
- `hospital-finances`: 「Voluntary doctor retirement」requirement 補一條 scenario「跨裝置 / 重整後 retire 仍然有效」，明確說明任何 client cold-start force-pull 不可使退休醫師復活、不可讓他再產生 tick 收入。

## Impact

**程式碼**：
- `apps/medexam2-hospital-tw/src/db/schema.ts` — `RetirementLogRow` 改 `doctorId` 為 pk、加 `_updatedAt` LWW field + Dexie **v19** schema bump + v18→v19 upgrade callback（read all → dedup by `doctorId` keep smallest `retiredAt` → clear → bulkAdd）。
- `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` — 新 `RETIREMENT_LOG: TableAdapter`（collection, pk = `doctorId`）；加入 `HOSPITAL_ADAPTERS` 與 `M2_ADAPTERS`（在 `HOSPITAL_DOCTORS` 之前）；`HOSPITAL_DOCTORS.applyToLocal` 加 tombstone check carve-out（FIRST step、force=true 也 honor）。
- `apps/medexam2-hospital-tw/src/lib/sync/engine.ts` — `start()` 加 startup whitelist probe（fail → `paused` + 不裝 timer + 不跑 pullAllNow）；deleting hook 不變（retirementLog 是 append-only）。
- `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts` — `onPullComplete` chain 加 `reconcileRetiredDoctors()`，置於 `checkAssignmentInvariants()` 之前。
- `apps/medexam2-hospital-tw/src/lib/retirement-reconcile.ts` (新) — `reconcileRetiredDoctors()` 實作。
- `apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts` — `clearLocalSyncTables` 表清單加 `db.retirementLog`；同步加進 transaction tables 列表。
- `apps/medexam2-hospital-tw/src/lib/sync/migration.ts` — 任何 `wipeLocalSyncedTables`-style helper 同步加 `db.retirementLog`。
- `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts` — `SCHEMA_VERSION = 4` + v3→v4 兼容性 doc 註解。
- `apps/medexam2-hospital-tw/src/lib/sync/r2/etag.ts`（或 sibling） — 新 `setSchemaVersion(bundle, sv)` / `getSchemaVersion(bundle)` 與既有 ETag 一起 cache 到 localStorage。
- `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts` — `pushBundle` PUT 前加 schema_version monotonic guard（local SV < cached cloud SV → throw `r2_schema_downgrade_refused`，不發 PUT）；`pullBundle` gunzip 成功後呼叫 `setSchemaVersion`。
- `apps/medexam2-hospital-tw/src/lib/sync/r2/migrate-from-supabase.ts` — `tables` 陣列加 `{ table: 'retirement_log', pkColumns: ['doctor_id'] }`。

**Schema / 後端**：
- `supabase/migrations/0013_retirement_log.sql` (新) — `public.retirement_log` 表（pk `doctor_id`、`user_id` + RLS + `updated_at` LWW 欄位 + `ON DELETE CASCADE` to `auth.users.id`）。
- `supabase/migrations/0014_upsert_lww_retirement_log.sql` (新) — `CREATE OR REPLACE upsert_lww`，whitelist 從 9 表擴成 10 表 + 新 dispatch branch。
- `supabase/migrations/0015_delete_my_data_retirement_log.sql` (新) — `CREATE OR REPLACE delete_my_data()`，wipe list 加 `DELETE FROM public.retirement_log WHERE user_id = uid` 一行（placed 在 `hospital_doctors` DELETE 之後）。

**測試**：
- `apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts` (新) — bundle round-trip：retire → snapshot → apply → 確認 doctor 不復活；reconcile：local 含活著的 ghost doctor + cloud retirementLog 有對應 → reconcile 後 doctor 清掉。

**Migration**：
- 既有玩家：第一次 retire 後新 row 進 retirementLog，之後跨裝置正確。**已經中招復活的 ghost doctor** 由 `reconcileRetiredDoctors` 在第一次 force-pull post-deploy 清掉（因為 retirementLog 也會 force-pull 並有對應 row）。
- 既有雲端殭屍 doctor row：可選擇手動 SQL one-off 清除，或依賴 `reconcileRetiredDoctors` 在 client 端清，cloud row 留著無害（applyToLocal carve-out 會 skip）。本 change 採後者，無需 backfill SQL。

**Out of scope（不在本 change 內）**：
- 一階（`apps/medexam-tw`）的同類 bug。一階目前沒有 retire-like delete 流程（doctor concept 是 二階獨有），其他 collection（srs_cards / item_instances / mentor_backlog）沒有使用者觸發的 delete UX；如未來加上，再走平行 change。
- 通用 tombstone column 機制。本 change 用 retirementLog 一個 specific tombstone-table 解決 retire-only 場景；未來若有第二個 delete-needing collection，再考慮抽象成通用 mechanism。
