import { useState, type FormEvent } from 'react'
import { api, auth, errorText, type Admin } from '../api'

export function Login ({ onSignedIn }: { onSignedIn: (admin: Admin) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { admin, accessToken } = await api<{ admin: Admin, accessToken: string }>('POST', '/auth/login', { body: { email, password } })
      auth.set(accessToken)
      onSignedIn(admin)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className='login'>
      <form className='login-card' onSubmit={submit}>
        <div className='brand'><img src={`${import.meta.env.BASE_URL}favicon.svg`} alt='' width={28} height={28} /> Roulette Admin</div>
        <label>Email<input type='email' autoComplete='username' required value={email} onChange={e => setEmail(e.target.value)} autoFocus /></label>
        <label>Password<input type='password' autoComplete='current-password' required value={password} onChange={e => setPassword(e.target.value)} /></label>
        {error && <div className='error-note' role='alert'>{error}</div>}
        <button className='btn primary' disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  )
}
