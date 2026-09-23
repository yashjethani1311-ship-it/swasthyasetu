import { useEffect, useState } from 'react'

export function navigate(path: string) {
  window.location.hash = path
}

export function useRoute() {
  const read = () => (window.location.hash.replace(/^#/, '') || '/')
  const [route, setRoute] = useState(read)
  useEffect(() => {
    const onHash = () => setRoute(read())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return route
}
