const STORAGE_KEY = 'openbika.selectedOrganizationId'

export function readStoredOrganizationId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw && raw.length > 0 ? raw : null
  } catch {
    return null
  }
}

export function writeStoredOrganizationId(organizationId: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, organizationId)
  } catch {
    /* ignore quota / private mode */
  }
}
