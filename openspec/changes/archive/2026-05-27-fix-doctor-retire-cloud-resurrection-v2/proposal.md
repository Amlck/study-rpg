## Why

二階玩家回報「醫師用 AAD 退休後，重整頁面醫師會自己回來、營收還是繼續上漲」。Root cause：sync engine 的 `deleting` hook 只清 dirty marker，從不把 delete propagate 到 Supabase（雲端那筆 `hospital_doctors` 永遠留著舊 `updated_at`），cold-start `engine.start()` 又必定 `pullAllNow({force:true})` 全量強制覆寫 local（這條來自 `fix-account-switch-data-loss` 的安全網），於是雲端那筆退休的醫師被 force-apply 回 Dexie，tick loop 把它當活人繼續計入 throughput 與 reputation。玩家還拿到了 retire 的 `powerMultiplier × 1000` refund，等於 double dip。

**這是 v2 重做**：前一輪 `fix-doctor-retire-cloud-resurrection` (`dac4eae`) 把 `retirementLog` Dexie pk 從 `++id` 改 `&doctorId`，撞到 Dexie 4.x 硬限制 `UpgradeError Not yet support for changing primary key`，每個既有 v18 玩家打開都卡在「啟動中…」，prod 緊急 revert（pitfall 已寫進 `~/.claude/imports/dexie_pk_change_pitfall.md`，新 session 自動載入）。v2 的關鍵差異：**Dexie pk 維持 `++id`，把 `doctorId` 加成 additive secondary index**（**非 unique** — 詳見下方 Take-2 段落），不觸發 pk-change limit；adapter lookup 改 `.where('doctorId').equals(pk).first()`；Vitest 必加 v18→v19 upgrade-from-existing-data fixture 守住未來不再踩同一坑。

**v2 design Take-2（2026-05-27 經 §8.12 fixture 實測修正）**：第一輪 design 把 `doctorId` 升為 **unique** `&doctorId`，並打算靠 upgrade callback 在 unique 索引建構前 dedup。Codex adversarial review 預測這條會掛、`/opsx:apply` 第一個動作就 fixture-first 驗證 — 證實 Dexie 4.x **先 activate 新 unique index、再跑 upgrade callback**，既有 v18 玩家若曾踩 ghost-resurrection bug 有 duplicate doctorId，整個 versionchange tx 直接 abort（symptom: `AbortError`，user 仍卡「啟動中…」）。**結論**：drop unique constraint，schema string 改 `'++id, retiredAt, doctorId, _updatedAt'`（doctorId 為 **plain** secondary index）。唯一性 invariant 改靠：(1) `services/retire.ts` 是 destructive operation 不可二次 retire 已刪 doctor、(2) Supabase composite pk `(user_id, doctor_id)` server-side guarantee、(3) `crypto.randomUUID()` 128-bit doctorId 機率 collision-free、(4) adapter `snapshotDirty/All` 只 emit 一筆 per doctorId via `.where().first()`。Dexie 層 unique enforcement 屬 nice-to-have defense-in-depth — 不必要、且 Dexie 4.x runtime 行為不允許。Upgrade callback 仍跑 defensive dedup（不再為了讓 index 建構過關，而是減少首次同步 payload + 清掉歷史殘留）。

延伸影響：任何 collection-shape 表（doctors / mastery / questionHistory / bookmarks / targeted_tickets / achievements）的 row-level delete 在 Supabase read path 下都會被 cold-start force-pull 復活；目前 retire 是最明顯的觸發點，但所有未來會刪 row 的功能都會踩同一個坑。

## What Changes

- Sync engine 認可一個「tombstone 替代品」：`retirementLog` 表本身就是退休醫師的不可變紀錄，已經被 `services/retire.ts` 同 tx 寫入。把它升級成 synced collection（新 Supabase table + RLS + `upsert_lww` whitelist 第 10 項 + R2 `m2` bundle 新 key + Dexie hook），sync engine 拿來當權威 tombstone。Supabase 端的 migration 0013 / 0014 / 0015 **前輪已 prod-applied 且 SQL 檔仍在 `supabase/migrations/`**，本 change 不需要 owner 再跑 SQL。
- `HOSPITAL_DOCTORS.applyToLocal` 在寫入前先檢查該 `doctorId` 是否已出現在 `retirementLog`：是 → skip cloud write 並 delete 該筆 local doctor 殘留。**查詢用 `.where('doctorId').equals(pk).first()`**（不是 v1 的 `.get(pk)`，因為 v2 pk 仍是 auto-incr `id`）。
- 新增 post-pull reconcile（`reconcileRetiredDoctors`）：在現有 `onPullComplete` chain 內、`checkAssignmentInvariants` 之前，iterate `retirementLog` 把 local 殘留的對應 doctor row 清掉，覆蓋 race condition（cloud_row 應用順序剛好 doctor 在 retirementLog 之前）。
- R2 `m2` bundle `SCHEMA_VERSION` 1→2→3→**4**，新增 `retirementLog` top-level data key。v4 client 讀 v3 bundle 把該 key 預設成 `[]`；v3 client 讀 v4 bundle 忽略未知 key（與既有 v2→v3 升級的兼容策略一致）。
- **Bundle push schema_version monotonic guard**（codex audit Attack 1 修補，沿用前輪）：`pushBundle` 在 PUT 之前檢查 cached cloud schema_version ≥ local SCHEMA_VERSION，downgrade 直接 throw `r2_schema_downgrade_refused` 拒寫，防止 v3 client 覆寫 v4 cloud bundle 把 retirement_log key 抹掉。
- **Startup whitelist probe**（codex audit Attack 3 修補，沿用前輪）：engine.start 完成 hook 安裝後、cold-start force-pull 前，跑 no-op `upsert_lww('retirement_log', [])`；失敗（partial migration → unknown table）→ engine 進 `paused` 狀態、不裝 debounce timer、不跑 pullAllNow，避免 pushAllNow 結尾 `dirty.perTable.values().clear()` 把 retire tombstone 的 dirty marker 永久燒掉。
- **Account lifecycle 全面覆蓋 retirementLog**（codex audit missed scope 修補，沿用前輪）：`apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts` 的 `clearLocalSyncTables` 表清單加 `db.retirementLog`；`migration.ts` 的 wipe 同步加；既有 migration 0015 的 `delete_my_data` extension 仍涵蓋 server side。防止換帳號 / 重置進度後 stale tombstone 污染新 state 或誤刪新醫師。
- Dexie schema **v18 → v19** additive migration — schema string 從 `'++id, retiredAt, doctorId'` 改 `'++id, retiredAt, doctorId, _updatedAt'`（pk 保持 `++id`、把 `doctorId` 從普通 index 升級為 unique index、加 `_updatedAt` LWW field index）。Upgrade callback 做 defensive dedup（read all → keep smallest retiredAt per doctorId → clear → bulkAdd 不帶 id），避免任何既有 v18 殘留的 duplicate doctorId 撞 unique constraint。
- `services/retire.ts` **不改邏輯**（既有 tx 已正確寫 `retirementLog` row 並 delete doctor），只是現在會被 sync 帶到雲端與其他裝置；唯一補 `_updatedAt: Date.now()` 進 `logRow` literal，讓首次 push timestamp 明確。
- **BREAKING (sync 層級, M_2nd only)**：v3 client 在裝過 v4 client 後切回 v3 build 進入 broken push 狀態（push 全被 schema_version guard 拒絕），跟「rollback 已知缺口」一致；玩家更新到 v4 build 就恢復。

## Capabilities

### New Capabilities

無 — 不新增 spec。

### Modified Capabilities

- `cloud-sync`: 新增一條 Requirement 規範「row deletion via tombstone-table」(retirementLog) 的同步語意 — 包含 push 路徑、apply 路徑碰撞時的解決順序（adapter lookup via secondary index）、cold-start force-pull 與此機制的互動、跨裝置反序到達情境。加 R2 schema_version downgrade guard requirement + startup whitelist probe requirement。
- `hospital-finances`: 「Voluntary doctor retirement」requirement 補一條 scenario「跨裝置 / 重整後 retire 仍然有效」，明確說明任何 client cold-start force-pull 不可使退休醫師復活、不可讓他再產生 tick 收入。

## Impact

**程式碼**：
- `apps/medexam2-hospital-tw/src/db/schema.ts` — `RetirementLogRow` 加 `_updatedAt?: number` (LWW field) + Dexie **v19** schema bump (additive：`doctorId` 維持 plain secondary index + 加 `_updatedAt` index；pk 維持 `++id`；**doctorId NOT unique**，per Take-2 above) + v18→v19 upgrade callback (defensive dedup by doctorId keep smallest retiredAt — 清掉 ghost-resurrection 殘留)。**EntityTable type 維持 `'id'`，不改 pk**。
- `apps/medexam2-hospital-tw/src/lib/sync/tables.ts` — 新 `RETIREMENT_LOG: TableAdapter`（collection，logical pk = `doctorId`，背後 Dexie pk = `++id` auto-incr）；`snapshotDirty / snapshotAll / applyToLocal` 全部走 `.where('doctorId').equals(doctorId).first()` lookup，不依賴 Dexie pk；加入 `HOSPITAL_ADAPTERS` 與 `M2_ADAPTERS`（在 `HOSPITAL_DOCTORS` 之前）；`HOSPITAL_DOCTORS.applyToLocal` 加 tombstone check carve-out（FIRST step、force=true 也 honor，用 `.where('doctorId').equals(cloudRow.id).first()`）。
- `apps/medexam2-hospital-tw/src/lib/sync/engine.ts` — `start()` 加 startup whitelist probe（fail → `paused` + 不裝 timer + 不跑 pullAllNow）；`deleting` hook 不變（retirementLog 是 append-only）。
- `apps/medexam2-hospital-tw/src/lib/sync/useSync.ts` — `onPullComplete` chain 加 `reconcileRetiredDoctors()`，置於 `checkAssignmentInvariants()` 之前。
- `apps/medexam2-hospital-tw/src/lib/retirement-reconcile.ts` (新) — `reconcileRetiredDoctors()` 實作。
- `apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts` — `clearLocalSyncTables` 表清單加 `db.retirementLog`（含 `clearSchemaVersion('m2')` post-wipe）。
- `apps/medexam2-hospital-tw/src/lib/sync/migration.ts` — 任何 `wipeLocalSyncedTables`-style helper 同步加 `db.retirementLog`。
- `apps/medexam2-hospital-tw/src/lib/sync/r2/bundles.ts` — `SCHEMA_VERSION = 4` + v3→v4 兼容性 doc 註解。
- `apps/medexam2-hospital-tw/src/lib/sync/r2/etag.ts` — 新 `setSchemaVersion(bundle, sv)` / `getSchemaVersion(bundle)` / `clearSchemaVersion(bundle)` 與既有 ETag 一起 cache 到 localStorage。
- `apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts` — `pushBundle` PUT 前加 schema_version monotonic guard（local SV < cached cloud SV → throw `r2_schema_downgrade_refused`，不發 PUT）；`pullBundle` gunzip 成功後呼叫 `setSchemaVersion`。
- `apps/medexam2-hospital-tw/src/lib/sync/r2/migrate-from-supabase.ts` — `tables` 陣列加 `{ table: 'retirement_log', pkColumns: ['doctor_id'] }`。
- `apps/medexam2-hospital-tw/src/services/retire.ts` — `logRow` literal 加 `_updatedAt: Date.now()`，**業務邏輯不動**。

**Schema / 後端**：
- `supabase/migrations/0013_retirement_log.sql` (**existing, prod-applied, no owner action needed**) — `public.retirement_log` 表（pk `(user_id, doctor_id)`、`user_id` + RLS + `updated_at` LWW 欄位 + `ON DELETE CASCADE` to `auth.users.id`）。
- `supabase/migrations/0014_upsert_lww_retirement_log.sql` (**existing, prod-applied**) — `CREATE OR REPLACE upsert_lww`，whitelist 擴成 10+ 表 + 新 dispatch branch。
- `supabase/migrations/0015_delete_my_data_retirement_log.sql` (**existing, prod-applied**) — `CREATE OR REPLACE delete_my_data()`，wipe list 加 `DELETE FROM public.retirement_log WHERE user_id = uid`。

**測試**：
- `apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts` (新) — bundle round-trip / adapter carve-out / reconcile / schema_version guard / account-switch wipe，**新增 §8.12 v18→v19 upgrade-from-existing-data fixture** 守住 Dexie pk-change 不再被誤動。

**Migration**：
- 既有 v18 玩家：第一次打開 v19 client → Dexie upgrade callback 跑 defensive dedup → 第一次 retire 後新 row 進 retirementLog with `_updatedAt`，之後跨裝置正確。**已經中招復活的 ghost doctor** 由 `reconcileRetiredDoctors` 在第一次 force-pull post-deploy 清掉（因為 retirementLog 也會 force-pull 並有對應 row）。
- 既有雲端殭屍 doctor row：可選擇手動 SQL one-off 清除，或依賴 `reconcileRetiredDoctors` 在 client 端清，cloud row 留著無害（applyToLocal carve-out 會 skip）。本 change 採後者，無需 backfill SQL。
- **與 v1 (`dac4eae`) 的關鍵差異**：v2 不改 pk，所以 Dexie 不會 throw `UpgradeError Not yet support for changing primary key`。每個 v18 user 第一次打開 v19 client 不會卡在「啟動中…」。

**Out of scope（不在本 change 內）**：
- 一階（`apps/medexam-tw`）的同類 bug。一階目前沒有 retire-like delete 流程（doctor concept 是 二階獨有），其他 collection（srs_cards / item_instances / mentor_backlog）沒有使用者觸發的 delete UX；如未來加上，再走平行 change。
- 通用 tombstone column 機制。本 change 用 retirementLog 一個 specific tombstone-table 解決 retire-only 場景；未來若有第二個 delete-needing collection，再考慮抽象成通用 mechanism。
- Worker-side bundle schema_version enforcement (`add-bundle-schema-version-guard` follow-up change)。
- `pushAllNow` 條件式清 dirty marker refactor (`audit-pushAllNow-dirty-marker-semantics` follow-up change)。
- Rewire-events branch (`rewire-hospital-events-to-non-reading-trigger`) — handoff 指示 v2 ship 後再 cherry-pick 進來（commits `61363b7 bcb0aa8 f6ca147` 已存 `origin/rewire-and-aad-backup`，**skip** `5f2962f` self-heal — v2 修對之後 self-heal 變死碼）。
