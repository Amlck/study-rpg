#!/usr/bin/env node
/**
 * Assemble dist-cf/ for Cloudflare Pages deploy.
 *
 * Inputs (must exist before this runs):
 *   apps/medexam-tw/dist/                ← 一階, built with VITE_DEPLOY_BASE=/1st/
 *   apps/medexam2-hospital-tw/dist/      ← 二階, built with VITE_DEPLOY_BASE=/2nd/
 *   scripts/cf-landing-template.html     ← root landing page
 *
 * Output:
 *   dist-cf/
 *     index.html                         ← copy of cf-landing-template.html
 *     _redirects                         ← SPA fallback rules
 *     1st/                               ← 一階 dist
 *     2nd/                               ← 二階 dist
 *
 * Spec: openspec/changes/add-med-study-rpg-domain-migration/specs/deploy-pipeline/spec.md
 *       — "Cloudflare Pages deploy target alongside GitHub Pages" + "SPA fallback via _redirects"
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const ROUTES = [
  { src: 'apps/medexam-tw/dist', dest: '1st' },
  { src: 'apps/medexam2-hospital-tw/dist', dest: '2nd' },
]

const OUTPUT_DIR = 'dist-cf'
const LANDING_TEMPLATE = 'scripts/cf-landing-template.html'

async function ensureDistExists(relPath) {
  const abs = path.join(repoRoot, relPath)
  let stat
  try {
    stat = await fs.stat(abs)
  } catch {
    throw new Error(`Required input missing: ${relPath} — run the app build first.`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`Required input is not a directory: ${relPath}`)
  }
  const indexHtml = path.join(abs, 'index.html')
  try {
    await fs.access(indexHtml)
  } catch {
    throw new Error(`Build looks incomplete: ${relPath}/index.html missing.`)
  }
}

async function ensureFileExists(relPath) {
  const abs = path.join(repoRoot, relPath)
  try {
    await fs.access(abs)
  } catch {
    throw new Error(`Required input missing: ${relPath}`)
  }
}

async function resetOutputDir() {
  const abs = path.join(repoRoot, OUTPUT_DIR)
  await fs.rm(abs, { recursive: true, force: true })
  await fs.mkdir(abs, { recursive: true })
}

async function copyTree(srcRel, destRel) {
  const src = path.join(repoRoot, srcRel)
  const dest = path.join(repoRoot, OUTPUT_DIR, destRel)
  await fs.cp(src, dest, { recursive: true })
  // Strip GH-Pages-only SPA fallback helper. CF Pages handles SPA routing
  // via the top-level _redirects file; leaving 404.html in place makes CF
  // Pages serve it (with status 404) instead of applying the rewrite rule,
  // so a direct hit on `/1st/skills` would 404 the SPA route.
  const fourOhFour = path.join(dest, '404.html')
  await fs.rm(fourOhFour, { force: true })
}

async function writeRedirects() {
  // CF Pages SPA rewrite for two co-located apps.
  //
  // The `/<dest>/*  /<dest>/  200` rule serves the app's index.html for any
  // path under /<dest>/. But it also rewrites real static files (JSON, JS,
  // CSS, fonts, images) when those paths happen to share the prefix —
  // because the directory-canonical destination doesn't preserve the file
  // existence check (unlike the standard `/* /index.html 200` SPA pattern,
  // which is what CF Pages docs reference but only works on a single-app
  // site at the root).
  //
  // Workaround: explicitly pass through asset directories FIRST (using
  // `:splat` to preserve the original subpath), then fall through to the
  // SPA catch-all. Rule ordering matters — first match wins per CF docs.
  //
  // The per-app `404.html` (GH-Pages SPA-fallback helper) is stripped from
  // dist-cf/<dest>/ in copyTree() so it doesn't intercept before this fires.
  const assetDirs = ['assets', 'content', 'fonts', 'icons', 'images']
  const lines = []
  for (const { dest } of ROUTES) {
    for (const dir of assetDirs) {
      lines.push(`/${dest}/${dir}/*  /${dest}/${dir}/:splat  200`)
    }
    lines.push(`/${dest}/*  /${dest}/  200`)
  }
  const body = lines.join('\n') + '\n'
  await fs.writeFile(path.join(repoRoot, OUTPUT_DIR, '_redirects'), body, 'utf8')
}

async function writeLanding() {
  const tpl = await fs.readFile(path.join(repoRoot, LANDING_TEMPLATE), 'utf8')
  await fs.writeFile(path.join(repoRoot, OUTPUT_DIR, 'index.html'), tpl, 'utf8')
}

async function main() {
  console.log('build-cf-pages-dist: verifying inputs…')
  for (const { src } of ROUTES) {
    await ensureDistExists(src)
  }
  await ensureFileExists(LANDING_TEMPLATE)

  console.log(`build-cf-pages-dist: resetting ${OUTPUT_DIR}/`)
  await resetOutputDir()

  for (const { src, dest } of ROUTES) {
    console.log(`build-cf-pages-dist: ${src} → ${OUTPUT_DIR}/${dest}/`)
    await copyTree(src, dest)
  }

  console.log(`build-cf-pages-dist: writing ${OUTPUT_DIR}/_redirects`)
  await writeRedirects()

  console.log(`build-cf-pages-dist: writing ${OUTPUT_DIR}/index.html from template`)
  await writeLanding()

  console.log('build-cf-pages-dist: done.')
}

main().catch((err) => {
  console.error('build-cf-pages-dist: FAILED —', err.message)
  process.exit(1)
})
