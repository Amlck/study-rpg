// ETag cache for R2 bundle-level optimistic concurrency.
// localStorage-backed; key namespaced under neurons-rpg.sync.etag.

const KEY = 'neurons-rpg.sync.etag.neurons'

export function getEtag(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function setEtag(value: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(KEY, value)
  } catch {
    // quota / private mode — ignore
  }
}

export function clearEtag(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
