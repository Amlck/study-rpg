## Why

M_3rd 神經元 reskin 已 ship 10/11 capabilities — content / theme / connectome / variant gacha / family mastery / sprites / leaderboard / motion library / achievements / atlases 都進 `track-neurons` 主 spec。剩最後一塊：**讓玩家實際打得到** `apps/neurons-tw`，並讓進度跨裝置 sync。本 change 把 neurons-tw 上 production（Cloudflare Pages on `https://med-study-rpg.com/neurons/`）+ 接 R2 cloud sync engine + 把 `add-neurons-achievements` 預留的 `onPullComplete` backfill hook 落地。順手在 medexam-tw SettingsPanel 加 companion-app pointer（履行 `neurons-mode` Req 6 既定的 maintenance-mode banner 要求）。完成後 track-neurons 可以 merge 回 main、M_3rd 結案。

## What Changes

- 新 `apps/neurons-tw/src/lib/auth/` (AuthContext + Supabase client) — 沿用 OAuth Client ID `554492800193-1gp4...`，OAuth redirect URI 與 Supabase Site URL allowlist 加入 `https://med-study-rpg.com/neurons/`
- 新 `apps/neurons-tw/src/lib/sync/` (sync engine + R2 client + bundle adapter for `neurons-snapshot.json.gz`)
  - 自己的 R2 bundle slug，不跟 m1 / m2 / bookmarks 共用
  - 沿用 Worker `https://api.med-study-rpg.com` 的 `/presign` + `/download` 端點（Worker 端 R2 路徑分流靠 bundle 名稱、不需 Worker code 改）
- 新 `apps/neurons-tw/src/lib/sync/useSync.ts` React hook + sign-in resolution UI（minimum viable，仿 medexam-tw 之精簡版本）
- `onPullComplete` hook 接三個 backfill：
  - `backfillAchievementsFromCurrentStats()`（`add-neurons-achievements` task §3 預留）
  - MAX-merge counter backfill（`maxQuizCorrectStreak` 等 monotonic counter，避免 cross-device 互覆蓋）
  - `deriveBadgesCsvFromDexie()` + `deriveAchievementSnapshot()` 重算 leaderboard derived field 確保 next push 帶最新 badges
- 新 `.github/workflows/deploy-neurons.yml` 或擴充既有 `deploy.yml` 增加 neurons-tw build 進 `dist-cf/neurons/`
- 修 `scripts/build-cf-pages-dist.mjs`：`ROUTES` 加 `{ src: 'apps/neurons-tw/dist', dest: 'neurons' }`，`_redirects` SPA fallback 同步擴增
- 修 `scripts/cf-landing-template.html`：根頁加 neurons-tw entry（與 1st / 2nd 並列）
- 新 D1 / R2 / OAuth allowlist 設定（owner manual：CF Pages dashboard 建 build pipeline + Custom Domain binding 到 `med-study-rpg.com/neurons/*` + Supabase OAuth callback + Site URL）
- 修 `apps/medexam-tw/src/components/SettingsPanel.tsx`：加「神經元主題版（companion app）」 entry → 點開新 tab 到 `https://med-study-rpg.com/neurons/`（履行 `neurons-mode` Req 6 banner deferred clause）
- 修 root `package.json`：加 `dev:neurons` / `build:neurons` script alias
- **Out of scope**：不改 OAuth Client ID；不動 m1 / m2 / bookmarks 任何 R2 bundle；不改 hospital-leaderboard / leaderboard Worker code；不碰 medexam-tw 既有 sync engine；medexam2-hospital-tw 完全不動

## Capabilities

### New Capabilities
- `neurons-deploy`: Cloudflare Pages deploy target + co-located subpath build artifact (`/neurons/`) + companion-app pointer in medexam-tw + neurons-tw cloud sync engine wiring + `onPullComplete` triple-backfill hook (achievement + counter MAX-merge + leaderboard derived field) for cross-device pull recovery

### Modified Capabilities
(none — `deploy-pipeline` 已涵蓋 1st/2nd CF Pages pattern，neurons-deploy 是新 capability 而非延伸；medexam-tw SettingsPanel 文案級改動不需 `cosmetic-system` / `auth` 任何 requirement 變更)

## Impact

- **Code**:
  - 新 ~8 個檔 in `apps/neurons-tw/src/lib/{auth,sync}/`
  - 新 1 sign-in resolution modal（minimum viable）
  - `scripts/build-cf-pages-dist.mjs` `ROUTES` array 加一行 + asset prefix 同步
  - `scripts/cf-landing-template.html` + 1 entry row
  - `.github/workflows/deploy.yml` 加 neurons-tw build step（or 新 workflow 檔）
  - `apps/medexam-tw/src/components/SettingsPanel.tsx` 加 1 個 entry
- **Infrastructure** (owner manual)：
  - Cloudflare Pages dashboard：擴增現有 `med-study-rpg-com` Pages project 的 build command 把 neurons-tw 帶進來
  - Cloudflare Pages Custom Domain：`med-study-rpg.com/neurons/*` route（落在既有 zone）
  - Supabase Auth：Site URL allowlist 加 `https://med-study-rpg.com/neurons/`，Redirect URLs 加同
  - Google OAuth Console：Authorized redirect URIs 加 `https://jakdyjxojokyqxeiuukx.supabase.co/auth/v1/callback` 已存在（共用），不需 OAuth-side 改動
  - **不**新建 R2 bucket（沿用 `study-rpg-state` 既有 bucket、bundle key prefix 區隔）
  - **不**新建 D1 database（leaderboard_neurons table 已由 `add-neurons-leaderboard` change 建好）
- **Bake / monitoring**：
  - Greenfield deploy — 沒有 legacy GH Pages user 要遷，不需要 2-4 週 bake；live 後 dogfood 即可
  - 首次 sign-in + push + pull cycle 用 owner 自帳號跑一輪 smoke
- **Documentation**：
  - `docs/AUTH_REDIRECT_URIS.md` 加 neurons-tw 兩條（Site URL + Redirect URL）
  - `CLAUDE.md` 加 `apps/neurons-tw` deploy 條目（複製 1st / 2nd table 行型）
- **Dependencies**: 無新 npm 套件（`@supabase/supabase-js` 等已 hoisted 在 root）
- **Cross-track**: track-neurons archive 後 merge 回 main 觸發 `openspec/project.md` roadmap row M_3rd 標 ✓ shipped 11/11
