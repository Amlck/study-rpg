// Headless component — mounts the sync engine. Returns nothing visible.
// Place once at the top of the App tree inside <AuthProvider>.

import { useSync } from './useSync'

export function SyncMount(): null {
  useSync()
  return null
}
