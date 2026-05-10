import * as React from 'react'

export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      const m = window.matchMedia(query)
      m.addEventListener('change', onStoreChange)
      return () => m.removeEventListener('change', onStoreChange)
    },
    [query],
  )

  const getSnapshot = React.useCallback(() => {
    return window.matchMedia(query).matches
  }, [query])

  const getServerSnapshot = React.useCallback(() => false, [])

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
