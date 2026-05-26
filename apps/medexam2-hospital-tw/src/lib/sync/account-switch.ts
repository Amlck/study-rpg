// Account-switch infrastructure for 二階 (fix-sync-sign-in-lifecycle Bug 2).
// Mirror of apps/medexam-tw/src/lib/sync/account-switch.ts adapted for
// HospitalDB. See that file for full design rationale.

import { getHospitalDB, type HospitalDB } from '../../db/schema'
import { clearSchemaVersion } from './r2/etag'

const LAST_SIGNED_IN_KEY = 'last_signed_in_user_id'
const MIGRATION_CHOICE_PREFIX = 'migration_choice:'
const MIGRATION_PAUSED_PREFIX = 'migration_paused:'

export async function getLastSignedInUserId(
  db: HospitalDB = getHospitalDB(),
): Promise<string | null> {
  const row = await db.meta.get(LAST_SIGNED_IN_KEY)
  const v = row?.value
  return typeof v === 'string' ? v : null
}

export async function setLastSignedInUserId(
  db: HospitalDB,
  userId: string,
): Promise<void> {
  await db.meta.put({ key: LAST_SIGNED_IN_KEY, value: userId })
}

export async function clearMigrationMetaKeys(db: HospitalDB): Promise<void> {
  const all = await db.meta.toArray()
  const toDelete: string[] = []
  for (const row of all) {
    if (
      row.key.startsWith(MIGRATION_CHOICE_PREFIX) ||
      row.key.startsWith(MIGRATION_PAUSED_PREFIX)
    ) {
      toDelete.push(row.key)
    }
  }
  if (toDelete.length === 0) return
  await db.meta.bulkDelete(toDelete)
}

/**
 * Wipe ALL cloud-synced HospitalDB tables + migration meta keys for the
 * AccountSwitchPrompt 「清空本地」 path. Preserves localBackup for safety.
 *
 * Note: this clears MORE tables than the existing wipeLocalSyncedTables in
 * migration.ts (which already handles ALL the hospital cloud-synced tables).
 * The difference is that this one ALSO clears the migration-choice meta keys
 * so the new account's gate evaluation isn't poisoned by previous prefs.
 */
export async function clearLocalSyncTables(db: HospitalDB): Promise<void> {
  await db.transaction(
    'rw',
    [
      db.gameCounters,
      db.gachaStats,
      db.tickets,
      db.rooms,
      db.affinity,
      db.doctors,
      // retirementLog joined the cloud-sync surface in
      // fix-doctor-retire-cloud-resurrection (2026-05-26). Must be wiped
      // alongside `doctors` on account-switch — otherwise user A's
      // tombstones survive locally, get re-pushed to user B's cloud, and
      // the post-pull reconciler erroneously deletes user B's doctors
      // that happen to share an id (probability negligible with UUIDs,
      // but spec coverage required).
      db.retirementLog,
      db.mastery,
      db.questionHistory,
      db.targetedTickets,
      db.targetedTicketHistory,
      db.monotonicCounters,
      db.meta,
    ],
    async () => {
      await db.gameCounters.clear()
      await db.gachaStats.clear()
      await db.tickets.clear()
      await db.rooms.clear()
      await db.affinity.clear()
      await db.doctors.clear()
      await db.retirementLog.clear()
      await db.mastery.clear()
      await db.questionHistory.clear()
      await db.targetedTickets.clear()
      await db.targetedTicketHistory.clear()
      await db.monotonicCounters.clear()
      const all = await db.meta.toArray()
      const toDelete = all
        .filter(
          (r) =>
            r.key.startsWith(MIGRATION_CHOICE_PREFIX) ||
            r.key.startsWith(MIGRATION_PAUSED_PREFIX),
        )
        .map((r) => r.key)
      if (toDelete.length) await db.meta.bulkDelete(toDelete)
    },
  )

  // Wipe R2 schema_version cache so the next account's first push
  // is not blocked by the previous account's cached cloud SV
  // (fix-doctor-retire-cloud-resurrection §5 + §7).
  clearSchemaVersion('m2')
  clearSchemaVersion('bookmarks')
}
