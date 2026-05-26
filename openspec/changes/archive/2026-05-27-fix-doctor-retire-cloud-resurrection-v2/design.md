## Context

二階玩家用 AAD（醫師退休）功能後重整頁面，被退休的醫師會復活並繼續產生營收。Root cause 是 sync engine 兩個既有設計決定的交互作用：

1. **`engine.ts` `deleting` hook（line 159-164）** 不把 delete propagate 到 Supabase。註解明示：「Deletes aren't synced yet (Postgres would need a tombstone column). Just clear dirty marker so we don't push a deleted row.」雲端那筆 `hospital_doctors` 永久留著，`updated_at` 還是原本 recruit 時的值。
2. **`engine.start()` 一律 `pullAllNow({force:true})`**（line 491），這是 `fix-account-switch-data-loss` 在 2026-05-19 為了修「跨 session incremental cursor 把合法 cloud row 過濾掉」而加的安全網。`pullAllNow` 走 `pullNow({sinceIso: new Date(0).toISOString(), force:true})`，`force:true` 讓 `applyToLocal` 跳過 LWW 比較直接覆寫 local。

兩者疊起來：retire → local 刪除 + refund 寫 revenue（refund 透過 gameCounters dirty 正確 push） → 雲端 doctor 列不變 → refresh → force-pull 把那列強塞回 local Dexie → tick loop 從下個 tick 開始繼續產生收入，玩家等於拿了 refund 還繼續收錢，符合 double-dip exploit 定義。

`services/retire.ts` 本身的 tx 設計是對的（在同一個 Dexie tx 內 delete doctor + add retirementLog + +refund revenue），問題完全在 sync 層。`retirementLog` 表已經為了 「24h diversification grace」存在（`lib/tick.ts:206` 讀它）、`services/retire.ts` 已經寫它、`lib/achievement-stats.ts:88` 已經讀它做成就統計 — 把它「升級成 cloud-synced」邊際成本是最低的。

R2 bundle path（dual-write 但目前 prod 讀 Supabase）相對乾淨：`buildBundleSnapshot` 走 `snapshotAll` 直接掃 local Dexie，刪掉的 row 自然不會進 bundle。但 `applyBundleSnapshot` 也只 iterate cloud bundle 的 row 寫 local，**不會刪除 local 多出的 row**。所以 R2 cutover 後跨裝置場景（裝置 A retire、裝置 B pull）仍會有類似 drift，本 change 一併解掉。

**v1 (`dac4eae`) 為什麼掛 + v2 怎麼避免**：v1 把 retirementLog Dexie pk 從 `++id` 改成 `&doctorId`，撞到 Dexie 4.x 硬限制：

```
DatabaseClosedError: UpgradeError Not yet support for changing primary key
```

App 對使用者顯示「啟動中…」永遠不前進，因為 `await db.gameCounters.get(...)` 落在 async stack 沒 surface 任何 UI error。Prod 緊急 revert，整個 track-m2 reset 回 main。完整 pitfall 紀錄已寫進 `~/.claude/imports/dexie_pk_change_pitfall.md` 並 wire 進 CLAUDE.md。**v2 紀律**：

- Dexie pk **維持 `++id`**，把 `doctorId` 加成 **plain (非 unique) secondary index** — Dexie 4.x 允許加 / 改 secondary index，只禁止改 pk（Take-2 改成非 unique 的理由見 Decision 2）
- Adapter lookup 改成 `.where('doctorId').equals(pk).first()`（secondary index lookup），不用 `.get(pk)`
- Vitest 加 **upgrade-from-v18 fixture**（task 8.12）— 先用 v18 schema 寫 row、再開 v19 看會不會 throw — 這條 test 在 v1 是 deferred，v2 是 hard requirement，守住未來不再有人誤改 pk

## Goals / Non-Goals

**Goals:**

- Retire 後重整 / 重新登入 / 換裝置都不會讓醫師復活
- 復活醫師不會產生 tick 收入（消除 double-dip exploit）
- 既有玩家（包括已經中招、local 有殭屍醫師的）在第一次裝 fix 版本後自動修復
- **第一次開 v19 client 的 v18 user 不會卡在「啟動中…」** — Dexie upgrade 純加 index 不改 pk，避開 Dexie 4.x pk-change limit
- 不動 `services/retire.ts` 業務邏輯 — 該檔已正確（唯一 diff = `_updatedAt: Date.now()` literal 加入）
- 不動 cold-start force-pull 行為 — `fix-account-switch-data-loss` 的設計理由仍然成立
- R2 cutover 後（VITE_CLOUD_SYNC_READ_BACKEND=r2）一樣 work
- 既有 v3 client 在 transition 期間讀到 v4 bundle 不會 crash

**Non-Goals:**

- 通用 tombstone-column 機制（per-row `deleted_at`）— 留給未來有第二個 delete-needing collection 時再抽象
- 一階（`apps/medexam-tw`）的同類 fix — 一階目前沒有 user-triggered row delete UX
- 清除既有雲端殭屍 doctor row 的 backfill SQL — 留著無害，apply-path carve-out 會在 client 端 skip
- 把 retire 邏輯改成 soft-delete（doctor 留著加 `retiredAt` 欄位）— 太大規模、會打到所有 read site
- Worker-side schema_version enforcement — follow-up `add-bundle-schema-version-guard`
- `pushAllNow` 條件式 dirty marker clear refactor — follow-up `audit-pushAllNow-dirty-marker-semantics`

## Decisions

### Decision 1: 用 `retirementLog` 當 tombstone-table（而非加 `deleted_at` column）

**選擇**：把 `retirementLog` 升級成 synced collection，sync engine 把它當作「對應 doctor 已被 retire」的權威信號。

**替代方案考慮**：

| 方案 | 優 | 缺 | 結論 |
|---|---|---|---|
| **A. retirementLog 當 tombstone**（採用） | 不動 Supabase 既有 8 表的 schema；retire.ts 已寫 retirementLog；語意天然契合（retire 本來就要記 log） | 需要新表 + 新 RLS + 改 upsert_lww；只 cover retire 這一種 delete | 改動最小、語意最對、可擴充到未來其他 delete 種類（each 新增「事件型 delete」會有自己對應的 log table） |
| B. `hospital_doctors` 加 `deleted_at timestamptz` | 通用、未來其他 collection 抄一遍同個 pattern | Supabase migration 改 8 個 RLS policy；client 全部要懂 `deleted_at != null` 視為刪除；混版本期 v3 看到 deleted_at 會誤把它當 normal row 應用 → 仍然復活 | 通用性不夠 pay-off：M_2nd 短期只有 retire 一個 case，未來有第二個再抽象 |
| C. 在 retire.ts 直接 `await supabase.from('hospital_doctors').delete()` | 一兩行就上 | 把 sync 邏輯漏到 service 層；只 cover Supabase 寫路徑（R2 仍 broken）；混版本期任何 v3 client 仍會復活；跨裝置同步窗口仍有 race | Band-aid，不採用 |

**Why now**：A 的「升級既有 log table」成本與 B 相當（新表 vs 新 column 都要 migration + RLS + upsert_lww extend），但 A 沒有混版本誤判風險，且把「retirementLog 已經是事實上的不可變紀錄」這個語意明確化。Decision 不變。

### Decision 2 (**重寫 — Path A，post-codex Take-2**): retirementLog 的 Dexie schema **additive upgrade** — pk 維持 `++id`，`doctorId` 維持 plain secondary index（**非 unique**），新增 `_updatedAt` LWW field index

**最終選擇（Take-2 2026-05-27 經 §8.12 fixture 實測修正）**：Dexie **v18 → v19** additive migration，schema string 從 `'++id, retiredAt, doctorId'` 改 `'++id, retiredAt, doctorId, _updatedAt'`。pk 保持 `++id`（auto-increment），`doctorId` 維持 plain secondary index（**沒有 `&` 前綴**），新增 `_updatedAt` 為 indexed LWW field。**Upgrade callback 仍跑 defensive dedup** — 不是為了讓 unique index 建構過關（這條 path 已證實不可行），而是為了：清掉 ghost-resurrection 累積殘留、減少首次同步 payload。

**Take-1 嘗試（最初 design）**：promote `doctorId` 為 unique `&doctorId`，並打算讓 upgrade callback 在 unique 索引建構**前**做 dedup。Codex adversarial review Attack 1 預測「Dexie 4.x activate 新 unique index 的時機可能 BEFORE upgrade callback」。**Fixture-first /opsx:apply 第一個動作驗證 Codex 預測**：

```
AbortError: A request was aborted, for example through a call to IDBTransaction.abort.
```

duplicate-doctorId 的 fixture case 直接 abort versionchange tx — symptom 跟 v1 (`UpgradeError`) 不同，但對 user 都一樣：「啟動中…」hang。zero-row case + all-unique case pass。**Take-1 對曾踩 ghost-resurrection bug 的 v18 user 全部 brick**。

**Take-2 修法**：drop unique constraint。Schema 字串 `'++id, retiredAt, doctorId, _updatedAt'`（doctorId 為 **plain** 非 unique secondary index）。Uniqueness invariant 改由四層 redundancy 守住：

| Layer | 機制 | 為什麼夠 |
|---|---|---|
| 1. App | `services/retire.ts` destructive operation — `delete doctor + add retirementLog` 在同一個 tx；若 doctor row 已不存在 retire flow early-return | 同一 doctorId 不可能在同一裝置 retire 兩次 |
| 2. Cloud | Supabase `retirement_log` 表 pk = `(user_id, doctor_id)` 複合鍵 — server 級 unique guarantee | 跨裝置 race 也只能有一筆 cloud row |
| 3. Identity | `crypto.randomUUID()` 128-bit doctorId | 機率 collision-free（2^-64 birthday bound for 全人類 doctor 量級） |
| 4. Adapter | `snapshotDirty/All` 一律 `.where('doctorId').equals(x).first()` lookup → 每個 doctorId emit 最多一筆 logical row | local duplicate（理論不可能，但 defensive）也不會放大成 cloud duplicate |

Dexie 層 unique enforcement 屬 nice-to-have defense-in-depth：在前述四層 redundancy 下 marginal value 接近 0；且 Dexie 4.x runtime 行為不允許在含 duplicate data 的 upgrade 路徑加 unique。Cost > benefit → 不做。

**Why additive index（仍維持原 Take-1 rationale）**：

- Dexie 4.x 對 `.upgrade()` 內改 pk 有**硬限制**：throw `UpgradeError Not yet support for changing primary key`，DB 進 `DatabaseClosedError` 狀態（v1 `dac4eae` 撞到的就是這個）
- Dexie 4.x **允許** `.version()` 之間加 plain secondary index — 純 metadata 變更，不重新分配 row storage，不檢驗 row content
- `++id` auto-incr 留著對既有 row 完全無影響，只是 adapter lookup path 改走 `.where('doctorId').equals(x).first()`（secondary index 查詢，效率與 pk 查詢相當）
- 跨裝置語意一致性靠**邏輯 pk = doctorId**（adapter 層面），不靠 Dexie 物理 pk。Supabase pk 用 `(user_id, doctor_id)` 複合鍵、R2 bundle 用 doctorId 為 logical pk — 物理 pk 跟邏輯 pk 解耦本來就是 sync layer 的職責邊界

**Migration 細節（Dexie v18 → v19 upgrade callback）**：

```ts
this.version(19)
  .stores({
    // ... full v18 schema repeated ...
    retirementLog: '++id, retiredAt, doctorId, _updatedAt',
    // ... 其他表照抄 v18，Dexie 要求重新宣告完整 stores ...
  })
  .upgrade(async (tx) => {
    // Defensive dedup of any duplicate doctorId rows. Pre-v19 users could
    // have them from the ghost-resurrection bug (retire X → ghost back →
    // retire again → 2 rows). After Take-2 (Path A) we no longer make
    // doctorId unique at the Dexie layer (Codex Attack 1 + fixture proved
    // Dexie 4.x activates the new index BEFORE the upgrade callback runs,
    // so duplicates would abort the versionchange tx). Dedup is still
    // useful to: (a) trim historical noise from first sync payload,
    // (b) match the logical "one row per doctorId" invariant the adapter
    // already enforces via .where().first(). Keep the chronologically-first
    // row (smallest retiredAt) as the canonical retire event.
    const oldRows = await tx.table('retirementLog').toArray()
    const byDoctor = new Map<string, typeof oldRows[number]>()
    for (const row of oldRows) {
      const existing = byDoctor.get(row.doctorId)
      if (!existing || row.retiredAt < existing.retiredAt) {
        byDoctor.set(row.doctorId, row)
      }
    }
    await tx.table('retirementLog').clear()
    await tx.table('retirementLog').bulkAdd(
      Array.from(byDoctor.values()).map((r) => ({
        // Omit `id` — Dexie auto-assigns new ++id values
        doctorId: r.doctorId,
        retiredAt: r.retiredAt,
        subjectId: r.subjectId,
        rarity: r.rarity,
        refund: r.refund,
        _updatedAt: r.retiredAt, // backfill LWW timestamp to the original retire moment
      })),
    )
  })
```

Existing v18 schema string: `'++id, retiredAt, doctorId'`. **New v19 schema string (Take-2)**: `'++id, retiredAt, doctorId, _updatedAt'` (note: `doctorId` is **plain** non-unique, **no `&` prefix**). `RetirementLogRow` interface 加 `_updatedAt?: number` (optional in type since pre-v19 rows may not have it backfilled until upgrade runs), but post-upgrade always present. `EntityTable<RetirementLogRow, 'id'>` type **不變**（pk 仍是 `id`）。

**Defense-in-depth**：即使 user 從未踩過 ghost-doctor 情境（duplicate doctorId 不存在），upgrade callback 也是 idempotent / no-op — 純 read → identity rewrite → write 回去，cost ≈ table size × 1 round-trip Dexie tx，對 < 1000 rows 完全可忽略。Defensive 比 conditional 安全。

### Decision 3: apply 路徑同時用 carve-out + post-pull reconcile

**選擇**：兩道防線。

- **Carve-out**（apply 階段）：`HOSPITAL_DOCTORS.applyToLocal` 第一步檢查 `db.retirementLog.where('doctorId').equals(cloudRow.id).first()`，命中即 skip 並 delete local 殘留。
- **Reconcile**（post-pull 階段）：`reconcileRetiredDoctors()` iterate `db.retirementLog.toArray()`，對每個 `row.doctorId` 呼叫 `db.doctors.delete(doctorId)`。

**Why secondary-index lookup（v2 重要 diff）**：v1 用 `db.retirementLog.get(pk)` — 因為 v1 把 pk 改成 doctorId，所以 `get(doctorId)` 直接命中 pk。v2 pk 仍是 auto-incr `id`，所以 lookup 必須走 secondary index：`db.retirementLog.where('doctorId').equals(cloudRow.id).first()`。plain `doctorId` index 仍保證查詢效率（O(log n) B-tree），non-unique 不影響 `.first()` 永遠回 deterministic 單一 row（依 retiredAt 隱式排序 — 但實務上 dedup callback + retire flow invariant 保證每個 doctorId 永遠只有一筆 local row）。

**Why 兩個都要**：

- Carve-out 解 99% 的 case（local 已經有 retirementLog row 時）
- Reconcile 解 race：Supabase per-table pull 不保證表間順序，可能先 fetch hospital_doctors 應用完才 fetch retirement_log；此時 carve-out 對該次 doctor write 沒幫助，但 reconcile 在 onPullComplete 最後一輪清掉。R2 bundle apply 順序可控（M2_ADAPTERS 陣列 retirementLog 排在 HOSPITAL_DOCTORS 前），所以 R2 path carve-out 永遠先觸發 — 但 reconcile 仍是雙保險
- Reconcile 也修「裝過 pre-fix 版本累積殭屍」的存量 — pre-fix 版本有 retirementLog 但 doctor row 因為一直被 force-pull 復活，post-fix 第一次跑就清乾淨

Reconcile 必須排在 `checkAssignmentInvariants()` 之前 — 後者預期讀到正確的 doctor roster 才能正確 reset orphan room pointer。

### Decision 4: R2 m2 bundle SCHEMA_VERSION 1 → 2 → 3 → 4

**選擇**：bump SCHEMA_VERSION，新增 `retirement_log` 為 top-level data key。

**版本相容矩陣**：

| Client \ Bundle | v1 bundle | v2 bundle | v3 bundle | v4 bundle |
|---|---|---|---|---|
| v1 client | ✓ | ✓ (ignore everWrong) | ✓ (ignore daily_study_log) | ✓ (ignore retirement_log) |
| v2 client | ✓ (everWrong default false, preserve-on-omission) | ✓ | ✓ (ignore daily_study_log) | ✓ (ignore retirement_log) |
| v3 client | ✓ | ✓ | ✓ | ✓ (ignore retirement_log) **← 仍會復活** |
| v4 client | ✓ (retirement_log default []) | ✓ | ✓ | ✓ |

v3 client 讀 v4 bundle 不會 crash（unknown key ignored）但仍會踩原 bug — local carve-out 也不存在。屬 known regression 對「裝了 v4 client 後切回 v3 build」的場景。Dev-only ignore，prod 不滾回舊版即可。

`bundles.ts` doc comment 沿用既有 v2/v3 升級的格式（已有先例可抄）。

### Decision 5: 不改 `services/retire.ts` 業務邏輯

`services/retire.ts` 已經在同一個 Dexie tx 裡：(1) delete doctor、(2) +refund revenue、(3) add retirementLog row。Sync engine 改完後，這 tx 的 dirty markers 會被三個 adapter 分別讀取：

- `HOSPITAL_DOCTORS`: dirty for `doc-x` PK → cleared by deleting hook（行為不變，cloud doctor 仍留著舊 row）
- `HOSPITAL_STATE`: dirty for `singleton` → push gameCounters with new revenue ✓
- `RETIREMENT_LOG`（新）: dirty for new row (Dexie creating hook 自動標記，物理 dirty pk = auto-incr id；adapter snapshotDirty 收 id → lookup row → emit `doctor_id` 為 logical pk) → push retirementLog row ✓

新的 tombstone push 完全靠既有 dirty marker 機制；retire.ts 唯一補 `_updatedAt: Date.now()` 進 `logRow` literal 讓首次 push timestamp 明確（既有 `creating` hook 也會 stamp `_updatedAt`，但 service 層 explicit set 比較不依賴 hook 順序）。Curator rule: 不改 retire.ts 業務邏輯等於不增加業務邏輯被誤改的風險。

### Decision 6: Achievement / counter integration 不變

`lib/achievement-stats.ts` 跟 `services/counter-backfill.ts` 已經 iterate retirementLog 計 `p1DoctorsRetired` / `derivedTotalDoctors`（= live + retired）等。Cloud-synced 後跨裝置的 achievement evaluation 會更準（裝置 B 看得到裝置 A 的 retire 紀錄）。**不需要任何 achievement-system 改動**。Read 路徑都用 `.toArray()` / `.each()` / `.where('retiredAt').above(...)` 等不依賴 pk 字面值的 API，pk 變化（其實 v2 沒改 pk）無影響。

### Decision 7: Migration vs hotfix worktree 路由

雖然 CLAUDE.md Bug Triage 寫「P1/P2 bug 走 hotfix 常駐 worktree」，本 fix 涉及：

- ~~Supabase migration（新表 + RPC 改）~~ 已 prod-applied，本輪不再跑
- Dexie schema bump（v18 → v19）
- R2 bundle SCHEMA_VERSION bump

這些都是「跨 spec 結構性 change」，比起單一 ui-fix 適合走完整 OpenSpec workflow（current track-m2 worktree）。一階 main 不受影響（一階沒有 retire 流程），不需要 cherry-pick 回 main。

Pivot signal：如果 review 時發現 owner 想先 ship band-aid（Decision 1-C）給已知玩家，本 change 可拆「Phase 1: band-aid」+「Phase 2: 完整 fix」兩個 change。目前 default 不拆 — 把整個 fix 一次 ship 比較乾淨。

### Decision 8: R2 bundle push 強制 schema_version monotonic（不可 downgrade）

**選擇**：`pushBundle` 在 PUT 之前檢查「最近一次成功 pull 的 cloud bundle schema_version」與 local SCHEMA_VERSION，若 local < cloud 則 throw `r2_schema_downgrade_refused` 並拒絕寫入；同時 surface 給 sync chip 與既有 `add-version-check-banner` 機制提示玩家升版。

**Why this is necessary（不是 paranoia）**：codex audit Attack 1 抓到 — 當前 `pushBundle` ([engine-r2.ts:60-146](apps/medexam2-hospital-tw/src/lib/sync/r2/engine-r2.ts:60)) 只有 ETag concurrency check，**完全沒有 schema_version monotonic guard**。攻擊路徑：

1. Device A (v4 client) retire → 寫 v4 bundle to cloud（含 `retirement_log` key）
2. Device B (v3 client，沒升 build) cold-start → pullBundle 拿到 v4 bundle → ETag 快取住，`applyBundleSnapshot` 忽略未知 `retirement_log` key（v3 沒註冊 adapter）→ local 仍有殭屍 doctor X
3. Device B 任何 local write 觸發 push → `pushBundle` builds **v3 snapshot**（沒有 retirement_log key）→ 用 cached ETag `If-Match` PUT 過 → **cloud bundle 被覆寫成 v3**，retirement_log key 永久消失
4. Device C (v4 fresh) 跨裝置簽入 → pullBundle 拿到「v3 bundle」→ retirement_log 被視為 `[]` → carve-out 對 doctor X 不觸發 → resurrect 全網

R2 ETag-only model 完全擋不住「降版本覆寫」。

**Mechanism**：

```ts
// In r2/etag.ts (extend existing module):
export function setSchemaVersion(bundle: Bundle, sv: number): void { ... }
export function getSchemaVersion(bundle: Bundle): number | null { ... }
export function clearSchemaVersion(bundle: Bundle): void { ... }

// In r2/engine-r2.ts pullBundle, after successful gunzipBundle:
if (etag) setEtag(bundle, etag)
setSchemaVersion(bundle, snapshot.meta.schema_version)  // NEW

// In r2/engine-r2.ts pushBundle, BEFORE the PUT loop:
const snapshot = await buildBundleSnapshot(db, adapters, userId)
const cachedRemoteSV = getSchemaVersion(bundle)
if (cachedRemoteSV != null && cachedRemoteSV > snapshot.meta.schema_version) {
  throw new Error(
    `r2_schema_downgrade_refused: cloud=${cachedRemoteSV} local=${snapshot.meta.schema_version} bundle=${bundle}`,
  )
}
```

**Why client-side check is sufficient（沒做 Worker-side guard）**：

- 既有 `Cold-start force-pull bypasses incremental cursor` requirement 保證每次 `engine.start()` 都先 pullBundle → cached schema_version 隨之 refresh，攻擊路徑 step 3 之前 cached SV 一定 ≥ cloud SV
- ETag 也是 client-side 加 server-side `If-Match` 共同維持，schema_version 沿用同 invariant 沒問題
- Worker-side enforcement 是 nice-to-have 但 out of scope（follow-up change `add-bundle-schema-version-guard` 處理：Worker 從 `x-amz-meta-schema-version` custom metadata 拒收降版本 PUT）

**Refuse 後對 user 的處理**：

- Sync chip 顯示「🔴 同步暫停 — 請更新到最新版」
- 既有 `consecutiveErrors` 機制累計到 threshold 觸發既有 「sync error toast」
- localStorage cached schema_version 不清，避免 user 刷頁繞過 guard
- 任何 incoming 本地寫入照常 commit 進 Dexie（local-first 不變），只是 push 不出去
- 玩家升 v4 build 後第一次 push 通過

**Trade-offs**：

| Cost | Mitigation |
|---|---|
| v3 client 進 broken 狀態（cannot push） | 預期 — 阻止 cloud bundle 損壞值得這代價 |
| First-ever push (`cachedRemoteSV == null`) 永遠 allowed | 安全 — fresh account 沒 cloud bundle 不會 downgrade |
| Race: pullBundle 跑到一半 push 觸發 | `cachedRemoteSV` 從 etag.ts module-scope state 讀，sequential consistency 由 engine pushNow 跟 pullNow 互斥保證（既有設計） |

### Decision 9: Account-switch / account-reset / `delete_my_data` 同步加進 `retirementLog` 清單

**選擇**：

1. `apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts` `clearLocalSyncTables`：表清單加 `db.retirementLog`，post-wipe call `clearSchemaVersion('m2')` + `clearSchemaVersion('bookmarks')` 避免下一個帳號的首次 push 被前帳號 cached cloud SV 擋住
2. `apps/medexam2-hospital-tw/src/lib/sync/migration.ts` 內任何 `wipeLocalSyncedTables`-style helper 同步加
3. Supabase migration `0015_delete_my_data_retirement_log.sql` (**already prod-applied**)：`CREATE OR REPLACE delete_my_data()`，wipe list 加 `DELETE FROM public.retirement_log WHERE user_id = uid` 一行（placed 在 `hospital_doctors` 旁邊）
4. `0013_retirement_log.sql` 的 `ON DELETE CASCADE` 保留（FK 到 auth.users.id）— 帳號完全刪除時 cascade 自動清

**Why this is necessary**：codex audit「missed scope」抓到 — 既有 `clearLocalSyncTables` ([account-switch.ts:50-89](apps/medexam2-hospital-tw/src/lib/sync/account-switch.ts:50)) 清 12 個表但**沒包 retirementLog**；既有 `delete_my_data` ([0012:263-271](supabase/migrations/0012_hospital_monotonic_counters.sql:263)) 9 個 DELETE statement 也**沒包 retirement_log**。本 change 把 retirementLog 升 synced collection 後若不補：

- 玩家「重置此帳號進度」→ local 跟雲端的 retirementLog 殘留 → 後續任何 reconcile 會把新醫師（如果 doctorId 撞舊的、雖機率極低但 deterministic UUID source 不保證）誤殺
- 玩家換帳號 → A 的 retirementLog 殘在 local → 簽入 B 之後 reconcile 會嘗試 delete B 的 doctor（doctorId 不撞 → no-op；撞了 → 誤殺）
- 玩家「徹底刪帳號」走 `delete_my_data()` → cloud retirement_log 殘留（FK cascade 只在 user row 被刪時觸發、`delete_my_data` 只 wipe data 不 delete user）→ user 之後 re-onboard 看到 stale tombstones

**Cross-account doctorId 撞名實際機率**：極低（[loot.ts:139](packages/core/src/lib/loot.ts:139) `randomId` 走 `crypto.randomUUID`，128-bit），但「靠機率擋」不是 robust spec position — 改正 wipe list 才是。

### Decision 10: 0013 / 0014 / 0015 deploy 順序強制保證（已 historically applied，仍保留 spec 條款）

**選擇**：tasks.md 加 explicit owner-step ordering guard。0013–0015 **已 prod-applied**（v1 deploy 前就上了 dashboard），但本 spec 條款保留，讓未來任何 disaster-recovery / fresh-Supabase-project 重做時仍有正確順序：

1. Apply 0013 (table + RLS) FIRST in dashboard
2. **Verify** `SELECT count(*) FROM retirement_log;` 應為 0（建表成功）
3. Apply 0014 (upsert_lww whitelist extend) NEXT
4. **Verify** `SELECT upsert_lww('retirement_log', '[]'::jsonb);` 應回 0（whitelist 通過）
5. Apply 0015 (delete_my_data extend) LAST
6. **Verify** `SELECT delete_my_data();` 在 test account 跑一遍應 wipe 乾淨（含 retirement_log）
7. **Only then** CI merge → deploy client build
8. Client side: backend-config check 加 startup probe — 若 `upsert_lww('retirement_log', '[]')` 噴 `unknown table` → engine 不 start sync，sync chip 顯示「待 Supabase migration」狀態

**v2 落地時的 owner steps**：因為 0013/0014/0015 已存在 Supabase，本 change deploy 流程**不需要 owner 跑任何 SQL**。owner 只需確認三條 SQL 存在於 dashboard（已驗，handoff 紀錄）+ smoke `SELECT count(*) FROM retirement_log;` 不噴 `relation does not exist`。

**Why startup probe 仍要 ship**：even if owner re-runs migrations correctly, 未來新 Supabase environment / DR rebuild / new dev branch 都會有 partial-migration window。Probe 是 long-lived defensive 機制，不是 v1 deploy 的 one-shot guard。

**Why this is necessary**：codex audit Attack 3 抓到 — 0013 apply 但 0014 沒 apply 時，pushAllNow ([engine.ts:412-413](apps/medexam2-hospital-tw/src/lib/sync/engine.ts:412)) 結尾 `for (const set of dirty.perTable.values()) set.clear()` **無條件清掉所有 dirty markers，即使 firstError 非 null**。意思是：

1. 玩家 retire → local Dexie 更新 + retirementLog dirty marker set
2. pushAllNow (e.g., from migration UI) → 嘗試 `upsert_lww('retirement_log', ...)` → RPC RAISE `unknown table` → error 進 firstError 但**仍跑 line 413** → retirementLog dirty marker 永遠清掉
3. 後續 dirty 變動只 enqueue 新 marker — 原本的 retirementLog 那 dirty PK 永遠不會 push
4. 即使 owner 後續補 apply 0014，client 也不會 re-push 那筆已遺失的 dirty
5. → tombstone 永遠不上雲端 → 跨裝置 / refresh 都復活

Client-side startup probe 是 belt-and-suspenders：即使 owner 順序錯，client 自己會拒 start sync 而非把 dirty marker 燒掉。

### Decision 11 (**v2 新增**): Vitest 必含 v18→v19 upgrade-from-existing-data fixture

**選擇**：`apps/medexam2-hospital-tw/src/__tests__/retirement-tombstone.test.ts` 必含 §8.12 一條 test:

```ts
it('opens cleanly from v18 with existing retirementLog rows (additive index, no pk change)', async () => {
  // 1. Open at explicit v18 schema, write rows including a duplicate doctorId
  const dbV18 = new Dexie('test-upgrade-v18-to-v19')
  dbV18.version(18).stores({ retirementLog: '++id, retiredAt, doctorId' })
  await dbV18.open()
  await dbV18.table('retirementLog').bulkAdd([
    { doctorId: 'doc-x', retiredAt: 1000, subjectId: 'IM', rarity: 'P3', refund: 500 },
    { doctorId: 'doc-x', retiredAt: 2000, subjectId: 'IM', rarity: 'P3', refund: 500 }, // dup (ghost case)
    { doctorId: 'doc-y', retiredAt: 1500, subjectId: 'SX', rarity: 'P4', refund: 250 },
  ])
  dbV18.close()

  // 2. Reopen with full HospitalDB chain (v1 ... v18 v19) — upgrade callback fires
  const dbV19 = new HospitalDB('test-upgrade-v18-to-v19')
  await dbV19.open() // ← if v2 mistakenly tries to change pk, this throws DatabaseClosedError

  // 3. Assert dedup kept the smaller retiredAt + secondary-index lookup works
  const docX = await dbV19.retirementLog.where('doctorId').equals('doc-x').first()
  expect(docX).toBeDefined()
  expect(docX!.retiredAt).toBe(1000)
  expect(await dbV19.retirementLog.count()).toBe(2)

  // 4. Path A (Take-2): doctorId is plain non-unique. Adding a row with the
  //    same doctorId succeeds locally; uniqueness lives at app/cloud layers.
  await dbV19.retirementLog.add({
    doctorId: 'doc-x', retiredAt: 3000, subjectId: 'IM', rarity: 'P3', refund: 500,
    _updatedAt: Date.now(),
  })
  expect(await dbV19.retirementLog.count()).toBe(2 + 1) // 2 deduped + 1 new dup

  dbV19.close()
})
```

**Why this is hard requirement (not deferred)**：v1 把這條 test 標 deferred，所以 prod 第一次發版才發現 pk-change 限制。v2 把 fixture 設成 mandatory，並寫進 `~/.claude/imports/dexie_pk_change_pitfall.md` 作為通用 Dexie change 紀律（cross-link 進 CLAUDE.md），守住任何未來 schema 改動的 reviewer 一眼看出「沒有 v(N-1)→v(N) upgrade fixture = 不能 merge」。

**Test infrastructure**：`fake-indexeddb` 已是 vitest setup 內標準依賴；本 fixture 不需要新增 polyfill。每個 case 用獨立 DB name（`test-upgrade-v18-to-v19`）避免 cross-test 污染。`afterEach` 自動清 indexedDB 資料庫。

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **既有雲端 stale `hospital_doctors` row 不會被清除** — cloud 那邊永遠留著 retire 過的 doctor row | Apply-path carve-out 處理。Cloud row 留著無害（只占空間，極小）。如果未來要清，寫 one-off SQL `DELETE FROM hospital_doctors WHERE id IN (SELECT doctor_id FROM retirement_log)`，但本 change 不做。 |
| **Dexie v18 → v19 migration 失敗** | Migration 是 read-rewrite pattern（read all → dedup → clear → bulkAdd），任何失敗保留 v18 state。dexie 的 `.upgrade()` 失敗會 throw、Dexie 不會 commit；DB 留在 v18 不動，引擎在啟動時報錯，user 看到 sync paused 狀態。**v2 紀律：Vitest §8.12 fixture 在 PR pre-merge 就會抓到 pk-change 類的 schema bug；v1 那種 prod 全網卡住的 incident 不會重演**。 |
| **既有 v18 retirementLog 含 ghost-bug duplicate doctorId** | Take-2 drop unique constraint，本來就允許 duplicate 存在；upgrade callback dedup 是 nice-to-have cleanup。即使 dedup 失敗也只是有 redundant row，adapter `.where().first()` 仍 emit 一筆 logical row。 |
| **R2 bundle 被 v3 client downgrade overwrite**（codex Attack 1） | Decision 8 加 client-side schema_version monotonic guard，pushBundle pre-check 拒絕 downgrade。Follow-up change `add-bundle-schema-version-guard` 補 Worker-side enforcement 作為第二道防線。 |
| **0013/0014 partial migration 導致 pushAllNow 燒掉 dirty marker**（codex Attack 3） | Decision 10 client-side startup probe — `upsert_lww('retirement_log', '[]')` 噴 unknown table 時 engine 不 start sync、不觸發任何 pushAllNow，避免 dirty marker 在 partial deploy 期間遺失。 |
| **既有 wipe path 漏 retirementLog 導致跨帳號污染**（codex missed scope） | Decision 9 同步擴 clearLocalSyncTables + 既有 migration `0015_delete_my_data_retirement_log.sql`；FK `ON DELETE CASCADE` 保留覆蓋 user 完全刪除。 |
| **race: device A 跟 device B 同時 retire 不同 doctor** | retirementLog logical pk = doctorId（adapter 層），Dexie 物理 pk 不同的 auto-incr id，兩筆獨立 row，正常 LWW upsert via Supabase compound pk `(user_id, doctor_id)`，無衝突。 |
| **race: device A 跟 device B 對同一 doctor 都 retire（不太可能 — retire 是 destructive，但 offline-since-recruit 的 stale device 理論可能）** | Adapter 層 dedup by doctorId，LWW 留下後寫的那筆。`retiredAt` 用兩筆中後寫的；refund 已分別在各裝置 local 結算到 revenue（會 sync race 在 gameCounters 層解）。不會多扣或多退 refund — refund 不再 double-process 因為 Dexie tx 同步 idempotency 由 doctor row 是否存在來把關。Server-side composite pk `(user_id, doctor_id)` 在 Supabase 端 collapse 成單一 row（後寫 LWW 勝出），cloud side 永遠 deterministic。 |
| **mid-version users**（裝過 v3 client 但還沒升 v4）| v3 client 仍會踩原 bug。Mitigation：deploy 後 force-push 給所有 active session（既有 `add-version-check-banner` 機制如果可用就用），或自然汰換。 |
| **R2 cutover（Phase 3）影響** | 本 change 跟 R2 cutover 正交 — 本 change 同時改 Supabase adapter 跟 R2 bundle。任何時間點 deploy 都安全。 |
| **counter-backfill 已經 derived `totalDoctorsRecruited = live + retired`** | retirementLog 跨裝置同步後，counter-backfill 在裝置 B 算出來的 `derivedTotalDoctors` 會包含 A 的 retire — 這是更正確的行為（達成「終身招募數」一致）。不會 break 任何 achievement scenario。 |
| **achievement stats `p1DoctorsRetired` 跨裝置變化**（fortune-composite-p1「不離不棄」predicate 讀此） | 達成更正確的跨裝置一致性；不會降級已 unlocked achievement（achievement-system 是 monotonic）。 |
| **`HOSPITAL_DOCTORS.applyToLocal` 多一次 secondary-index lookup 的 perf cost** | plain `doctorId` index 是 B-tree，lookup O(log n) where n = retirementLog row count（典型 < 100）。Force-pull 全量同步時對 50 doctors → 50 次 indexed lookup ≈ < 5ms total，user-imperceptible。Vs v1 用 pk `.get()` 的 O(1)：在這個 row count 級別差異可以忽略。 |

## Migration Plan

**Pre-deploy（owner 手動，前置）**：

1. ~~Apply Supabase migration 0013 + 0014 + 0015~~ **已 prod-applied 不需重做**。verify only：dashboard SQL editor 跑 `SELECT count(*) FROM retirement_log;` 應為 0 / `SELECT upsert_lww('retirement_log', '[]'::jsonb);` 應回 0 / `SELECT delete_my_data();` 在 test account 應 wipe 乾淨。

**Deploy（CI 自動）**：

2. Merge change → main → CI deploy GitHub Pages + Cloudflare Pages（cherry-pick 進 main 之後）。Track-m2 worktree 落本 change → archive → merge 回 main 然後 push。
3. Active users 自動拿到新 build；第一次 sync cycle 走 v19 Dexie upgrade（dedup callback + index build）+ v4 bundle write。

**Per-user 自動修復**（無玩家動作）：

4. v4 client 第一次跑 `pullAllNow({force:true})` → 拉 retirementLog rows → reconcile 清掉 ghost doctors → next push 上傳本地 retirementLog 到 cloud（如果是第一次裝 v4）。
5. 既有殭屍 doctor row 在 cloud `hospital_doctors` 留著，但所有 v4 client 透過 carve-out skip 不應用 — 對 user 視覺不可見。

**Rollback strategy**：

- 程式碼層 rollback：revert PR、CI 重 deploy 上一版。Active session 拿回 v3 build → Dexie v18 → ⚠️ **不能 downgrade**，Dexie 是 monotonic version，v19 → v18 會 throw `VersionError`。
- 因此 rollback path 要 **同 step 跑 force-reset**（清 user IndexedDB → 重新從 cloud pull）— 對 user 是 data loss。**結論：本 change deploy 後等同 forward-only**。在 deploy 前充分 dogfood + smoke 才推 prod。
- Supabase migration 0013/0014/0015 可獨立 rollback（drop table + revert upsert_lww 到 0012 版本），但若 client 還在跑 v4，會看到 push 失敗 → sync 進 offline 狀態。

**Smoke checklist（owner 在 staging / 自己 prod account 跑）**：

1. **首要 — v18 → v19 upgrade 不卡**：先用一個 既有 v18 IndexedDB state 的 prod 帳號（直接在 prod URL 簽入）開新 build → 觀察「啟動中…」應在 < 2s 內變正常 UI、console 不噴 `DatabaseClosedError`。**這條是 v1 prod incident 直接對應，必跑。**
2. retire 1 個 doctor → revenue +refund → refresh → doctor 不復活 → revenue 不增加
3. retire 1 個 doctor → 開 incognito 簽入 → doctor 不在 roster
4. 在 dev console 手動 insert 殭屍 doctor row（模擬 pre-fix 中招）→ refresh → reconcile 清掉
5. `globalThis.__hospitalSync.getStatus()` post-retire 應為 `'idle'`，retirementLog dirty marker 清 0
6. `R2` URL inspector 看 m2 bundle 該有 `data.retirement_log` 陣列
7. SV downgrade guard：localStorage poison `study-rpg.sync.r2.m2.schemaVersion` 成 `999` → 任何 push 應 throw `r2_schema_downgrade_refused: cloud=999 local=4 bundle=m2`、0 PUT 到 cloudflarestorage

## Open Questions

1. **既有雲端殭屍 doctor row 要不要寫 one-off cleanup SQL？** 目前計畫不寫（apply-path carve-out + 空間極小）。如果 dashboard 看到 row 數膨脹得很誇張再說。Decision: defer.
2. **要不要把 retirementLog 限制成 R2-only adapter（mirror `LEADERBOARD_PROFILE` precedent）跳過 Supabase migration？** 評估：mirror `achievement-system` 的 R2-only pattern 確實減一個 migration，但會讓 dual-write 期 retire 跨裝置同步要等到 Phase 3 R2 cutover 才生效，當前 reads 還是 Supabase。為了讓本 fix 在當前 deploy 立即 work，**走 Supabase + R2 雙寫**（與其他 `hospital_*` 表一致）。Decision: dual-write — 而且 0013–0015 SQL 已 prod-applied，sunk cost 反而支持 dual-write。
3. **Achievement spec 要不要補一條 scenario「retire 跨裝置後新裝置看得到 p1DoctorsRetired 統計」？** 是 silver lining 但不在本 change 範圍。Decision: defer — 等 owner 看到實際行為再決定要不要明文化進 spec。
4. **是否要強化 Vitest pattern 成「所有 Dexie .version() bump 都必須有 v(N-1)→v(N) fixture」進 CLAUDE.md/CI**？ 本 change ship 後可以開 follow-up `enforce-dexie-upgrade-fixture-rule` 在 `pnpm verify` / pre-commit 加 lint 規則。目前 v2 只負責守住自己這條 fixture，更通用化是 follow-up scope。
