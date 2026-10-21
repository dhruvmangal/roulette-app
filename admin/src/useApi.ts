import { useCallback, useEffect, useState } from 'react'
import { errorText } from './api'

/** Loads data whenever `key` changes; `reload` fetches again after a change. */
export function useApi<T> (load: () => Promise<T>, key: string) {
  const [state, setState] = useState<{ data: T | null, error: string | null, loading: boolean }>({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let live = true
    setState(previous => ({ ...previous, loading: true, error: null }))
    load().then(
      data => { if (live) setState({ data, error: null, loading: false }) },
      error => { if (live) setState(previous => ({ ...previous, error: errorText(error), loading: false })) }
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])

  const reload = useCallback(() => setNonce(n => n + 1), [])
  return { ...state, reload }
}
