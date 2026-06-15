import type { ChallengeAttemptRow, ChallengeInProgressRow } from '../db/schema'
import { getHospitalDB } from '../db/schema'

const IN_PROGRESS_KEY: ChallengeInProgressRow['key'] = 'challengeInProgress'

export async function listChallengeAttempts(): Promise<ChallengeAttemptRow[]> {
  return getHospitalDB().challengeAttempts.orderBy('finishedAt').reverse().toArray()
}

export async function getChallengeAttemptById(id: string): Promise<ChallengeAttemptRow | null> {
  return (await getHospitalDB().challengeAttempts.get(id)) ?? null
}

export async function listChallengeAttemptsByPaper(paperId: string): Promise<ChallengeAttemptRow[]> {
  return getHospitalDB().challengeAttempts.where('paperId').equals(paperId).reverse().sortBy('finishedAt')
}

export async function saveChallengeAttempt(attempt: ChallengeAttemptRow): Promise<void> {
  await getHospitalDB().challengeAttempts.put(attempt)
}

export async function getChallengeInProgress(): Promise<ChallengeInProgressRow | null> {
  return (await getHospitalDB().challengeInProgress.get(IN_PROGRESS_KEY)) ?? null
}

export async function saveChallengeInProgress(row: Omit<ChallengeInProgressRow, 'key'>): Promise<void> {
  await getHospitalDB().challengeInProgress.put({ key: IN_PROGRESS_KEY, ...row })
}

export async function clearChallengeInProgress(): Promise<void> {
  await getHospitalDB().challengeInProgress.delete(IN_PROGRESS_KEY)
}
