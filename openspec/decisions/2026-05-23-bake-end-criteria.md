# Bake-end criteria for `fireman333.github.io/study-rpg/` retirement

Written 2026-05-23 (one day after `add-med-study-rpg-domain-migration` archived). Source: working chat with Claude immediately after the Import UI shipped + CF Pages auto-deploy was wired up. Captures the "when to file the bake-end change" decision so future-self / new session doesn't have to re-derive it.

## Bake window

| Bound | Date | Source |
|---|---|---|
| Bake start | 2026-05-22 | `add-med-study-rpg-domain-migration` archive timestamp |
| Earliest end | 2026-06-05 | "2 weeks" lower bound from spec |
| Latest end | 2026-06-19 | "4 weeks" upper bound from spec |

Not a deadline — a **window**. File the bake-end change when traffic signals support it, not on the calendar.

## Trigger — file bake-end change when ≥ 2 of these hold

| # | Signal | How to check |
|---|---|---|
| a | R2 reads from GH origin ≈ 0 | CF Worker logs or R2 access logs; filter by `Origin: https://fireman333.github.io` |
| b | New `bug_reports` rows all from CF origin | Run the SQL below in Supabase SQL editor |
| c | Sync push originate from CF | Cloudflare dashboard → Workers → Logs → grep `med-study-rpg.com` vs `fireman333.github.io` ratio ≈ 100% |
| d | You've announced the new URL publicly at least once | Threads / IG bio / personal site / Discord |
| e | All public outbound links point to new URL | Search your bio / pinned posts / README |

### Primary signal — Supabase SQL (run this 6/5, then weekly)

```sql
-- Origin breakdown for last 7 days of bug reports.
-- Wait until "https://fireman333.github.io%" row drops to 0 for 3+ consecutive runs.
SELECT
  CASE
    WHEN origin LIKE 'https://fireman333.github.io%' THEN 'GH Pages (old)'
    WHEN origin LIKE 'https://med-study-rpg.com%'    THEN 'CF Pages (new)'
    ELSE 'other'
  END AS source,
  COUNT(*) AS report_count
FROM public.bug_reports
WHERE created_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 2 DESC;
```

Conservative rule: GH Pages count = 0 for 3 consecutive weekly runs → file the change.

## Bake-end change checklist

Run `/opsx:propose retire-gh-pages-deploy` then implement these:

- [ ] Replace `.github/workflows/deploy.yml` Pages publish with a redirect-only artifact: `index.html` containing `<meta http-equiv="refresh" content="0; url=https://med-study-rpg.com/1st/">` plus a JS `location.replace` fallback. Keep the workflow itself so the redirect stays maintained.
- [ ] Worker `CORS_ALLOWED_ORIGINS` — remove `https://fireman333.github.io` (in `cloudflare/sync-worker/wrangler.jsonc`)
- [ ] R2 bucket cors.json — remove `https://fireman333.github.io` (then `wrangler r2 bucket cors put study-rpg-saves --file cors.json`)
- [ ] Supabase Auth → Redirect URLs: remove `https://fireman333.github.io/study-rpg/**` + `/hospital/**`
- [ ] Supabase Site URL: flip from `https://fireman333.github.io/study-rpg/` → `https://med-study-rpg.com/1st/`
- [ ] `.github/workflows/deploy.yml` — remove `VITE_DEPLOY_TARGET=gh-pages` env var
- [ ] Delete `apps/medexam-tw/src/components/DomainMigrationBanner.tsx`
- [ ] Delete `apps/medexam2-hospital-tw/src/components/DomainMigrationBanner.tsx`
- [ ] Search + delete corresponding CSS (`.domain-migration-banner` + `:has(.domain-migration-banner)`)
- [ ] **Keep**: `apps/medexam-tw/src/components/LocalDataImportButton.tsx` — it's an emergency restore tool, no banner dependency, low maintenance
- [ ] OpenSpec delta on `deploy-pipeline`: REMOVED "Migration banner on GitHub Pages during bake" + MODIFIED "Cloudflare Pages deploy target alongside GitHub Pages" to drop bake-period language

## Two risks if you cut too early

1. **Bookmark lag**: users bookmark old URL; will return weeks-to-months later. → **Keep redirect stub indefinitely**, never serve 404 at `fireman333.github.io/study-rpg/*`. Cost ≈ 0 (a static HTML file on free GH Pages).
2. **Anonymous users with un-migrated local Dexie**: their data is per-origin and stuck on the old domain. → Keep the banner + Export JSON CTA until trigger condition (b) shows GH origin = 0 for 3+ runs. If you kill banner before that, they see 404 → assume game is dead → local save effectively lost.

## Recommendation

- **2026-06-05** (week 2): first SQL run. If GH origin > 0, defer to 6/12.
- **2026-06-12** (week 3): second SQL run.
- **2026-06-19** (week 4): third SQL run. If 3 consecutive runs at 0, run `/opsx:propose retire-gh-pages-deploy` and implement.
- **Redirect stub stays forever** — separate from the rest of the retirement work.

## Related artifacts

- `openspec/changes/archive/2026-05-22-add-med-study-rpg-domain-migration/` — parent change that started the bake
- `openspec/changes/archive/2026-05-23-align-cf-pages-deploy-with-gh-actions/` — CF Pages auto-deploy workflow spec alignment (this session)
- `apps/medexam-tw/src/components/DomainMigrationBanner.tsx` — the banner to retire
- `apps/medexam2-hospital-tw/src/components/DomainMigrationBanner.tsx` — same, 二階
- `docs/AUTH_REDIRECT_URIS.md` — Supabase URI inventory; update during retirement
