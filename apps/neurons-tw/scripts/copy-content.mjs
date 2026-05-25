/**
 * Copy content-neurons-tw dist artifacts into apps/neurons-tw/public/content/neurons-tw/
 * so Vite serves them under the configured base URL at runtime.
 *
 * Run automatically via predev / prebuild hooks in package.json.
 */
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC_DIR = resolve(__dirname, '..', '..', '..', 'packages/content-neurons-tw/dist')
const DEST_DIR = resolve(__dirname, '..', 'public/content/neurons-tw')

if (!existsSync(SRC_DIR)) {
  console.error(`✗ content-neurons-tw dist not found: ${SRC_DIR}`)
  console.error('  Run `pnpm --filter @study-rpg/content-neurons-tw build` first.')
  process.exit(1)
}

mkdirSync(DEST_DIR, { recursive: true })
for (const file of ['meta.json', 'subjects.json', 'questions.json']) {
  copyFileSync(resolve(SRC_DIR, file), resolve(DEST_DIR, file))
}
console.log(`✓ Copied content-neurons-tw artifacts → ${DEST_DIR}`)
