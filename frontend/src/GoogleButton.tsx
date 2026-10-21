import { useEffect, useRef, useState } from 'react'
import type { ProviderToken } from '@roulette/contracts'

interface GoogleIdentity {
  accounts: {
    id: {
      initialize (options: { client_id: string, callback: (response: { credential: string }) => void, nonce?: string, ux_mode?: 'popup', auto_select?: boolean }): void
      renderButton (parent: HTMLElement, options: Record<string, string | number>): void
    }
  }
}

declare global {
  interface Window { google?: GoogleIdentity }
}

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client'
let loading: Promise<GoogleIdentity> | null = null

/** Loads Google Identity Services once per page. */
function loadGoogle (): Promise<GoogleIdentity> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google)
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => window.google ? resolve(window.google) : reject(new Error('Google sign-in did not load'))
    script.onerror = () => { loading = null; reject(new Error('Could not load Google sign-in')) }
    document.head.append(script)
  })
  return loading
}

/** A random nonce: Google echoes it inside the ID token and the server checks it. */
function newNonce () {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, '')
}

interface Props {
  clientId: string
  onCredential: (token: ProviderToken) => void
  text?: 'continue_with' | 'signin_with' | 'signup_with'
}

/** Google's own sign-in button, which hands back an ID token for our server to verify. */
export function GoogleButton ({ clientId, onCredential, text = 'continue_with' }: Props) {
  const slot = useRef<HTMLDivElement>(null)
  const onCredentialRef = useRef(onCredential)
  onCredentialRef.current = onCredential
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    loadGoogle().then(google => {
      if (cancelled || !slot.current) return
      const nonce = newNonce()
      google.accounts.id.initialize({
        client_id: clientId,
        nonce,
        ux_mode: 'popup',
        auto_select: false,
        callback: ({ credential }) => onCredentialRef.current({ idToken: credential, nonce })
      })
      // Google's button has a fixed pixel width (200–400): take the room the dialog gives it.
      const width = Math.round(Math.min(300, Math.max(200, slot.current.clientWidth)))
      google.accounts.id.renderButton(slot.current, { theme: 'filled_black', size: 'large', shape: 'pill', text, width })
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [clientId, text])

  if (failed) return <p className="form-error">Google sign-in could not load. Check your connection and try again.</p>
  return <div className="google-slot" ref={slot} />
}
