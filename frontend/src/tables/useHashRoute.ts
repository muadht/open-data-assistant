import { useCallback, useEffect, useState } from 'react'

// Plain URL hashes - "#/" (the chat) and "#/browse?q=..." (the chat with the browse panel
// open, #74) - so the back button works and a filtered browse view can be shared as a link,
// without a routing library.

export type View = 'chat' | 'browse'

export interface Route {
  view: View
  search: URLSearchParams
}

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  return {
    view: path === '/browse' ? 'browse' : 'chat',
    search: new URLSearchParams(query),
  }
}

export function hashFor(view: View, search?: URLSearchParams): string {
  const query = search?.toString()
  return view === 'browse' ? `#/browse${query ? `?${query}` : ''}` : '#/'
}

export function useHashRoute() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  const navigate = useCallback((view: View, search?: URLSearchParams) => {
    const hash = hashFor(view, search)
    if (window.location.hash !== hash) window.location.hash = hash
    // Set directly too, so the view updates even where hashchange is slow or absent.
    setRoute(parseHash(hash))
  }, [])

  return { route, navigate }
}
