import { useState, type FormEvent } from 'react'
import { api, errorText, type Bonus } from '../api'
import { ErrorNote, Loading, Modal } from '../components/ui'
import { ago, chips, compact, label } from '../format'
import { useApi } from '../useApi'

const optionalNumber = (text: string) => (text.trim() === '' ? null : Number(text))

function EditBonus ({ bonus, onDone, onClose }: { bonus: Bonus, onDone: () => void, onClose: () => void }) {
  const [form, setForm] = useState({
    amount: String(bonus.amount),
    cooldownSeconds: bonus.cooldownSeconds == null ? '' : String(bonus.cooldownSeconds),
    maxClaims: bonus.maxClaims == null ? '' : String(bonus.maxClaims),
    minBalanceThreshold: bonus.minBalanceThreshold == null ? '' : String(bonus.minBalanceThreshold),
    isActive: bonus.isActive
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const field = (key: 'amount' | 'cooldownSeconds' | 'maxClaims' | 'minBalanceThreshold') => ({
    inputMode: 'numeric' as const,
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value.replace(/\D/g, '') })
  })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await api('PATCH', `/bonuses/${bonus.bonusId}`, {
        body: {
          amount: Number(form.amount),
          cooldownSeconds: optionalNumber(form.cooldownSeconds),
          maxClaims: optionalNumber(form.maxClaims),
          minBalanceThreshold: optionalNumber(form.minBalanceThreshold),
          isActive: form.isActive
        }
      })
      onDone()
    } catch (err) {
      setError(errorText(err))
      setBusy(false)
    }
  }

  return (
    <Modal title={`Edit ${bonus.code}`} onClose={onClose}>
      <form className='form' onSubmit={submit}>
        <label><span>Amount{bonus.type === 'DAILY' && <span className='muted'> (day 1; later streak days pay a multiple)</span>}</span><input required {...field('amount')} /></label>
        <label><span>Cooldown in seconds <span className='muted'>(empty for none)</span></span><input {...field('cooldownSeconds')} /></label>
        <label><span>Max claims per player <span className='muted'>(empty for unlimited)</span></span><input {...field('maxClaims')} /></label>
        <label><span>Only below balance <span className='muted'>(empty for any balance)</span></span><input {...field('minBalanceThreshold')} /></label>
        <label className='check'><input type='checkbox' checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
        {error && <ErrorNote error={error} />}
        <div className='form-actions'>
          <button type='button' className='btn' onClick={onClose}>Cancel</button>
          <button className='btn primary' disabled={busy || !Number(form.amount)}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function Bonuses () {
  const { data, error, reload } = useApi(() => api<{ bonuses: Bonus[] }>('GET', '/bonuses'), 'bonuses')
  const [editing, setEditing] = useState<Bonus | null>(null)

  return (
    <>
      <header className='page-head'><h1>Bonuses</h1></header>
      <p className='muted lead'>Changes apply to the next claim. Every edit is recorded in the audit log.</p>
      {error && <ErrorNote error={error} />}
      {!data ? <Loading /> : (
        <div className='table-wrap'>
          <table className='data'>
            <thead>
              <tr><th>Bonus</th><th className='num'>Amount</th><th>Rules</th><th className='num'>Claims</th><th className='num'>Paid out</th><th>State</th><th /></tr>
            </thead>
            <tbody>
              {data.bonuses.map(b => (
                <tr key={b.bonusId}>
                  <td><span className='strong'>{b.code}</span><div className='muted'>{label(b.type)} · edited {ago(b.updatedAt)}</div></td>
                  <td className='num'>{chips(b.amount)}</td>
                  <td className='muted'>
                    {[
                      b.cooldownSeconds != null && `every ${Math.round(b.cooldownSeconds / 3600)}h`,
                      b.maxClaims != null && `max ${b.maxClaims}`,
                      b.minBalanceThreshold != null && `below ${chips(b.minBalanceThreshold)}`
                    ].filter(Boolean).join(' · ') || 'no limits'}
                  </td>
                  <td className='num'>{compact(b.claims)}<div className='muted'>{b.claimsToday} today</div></td>
                  <td className='num'>{compact(b.totalPaid)}</td>
                  <td><span className={`badge ${b.isActive ? 'badge-active' : 'badge-inactive'}`}>{b.isActive ? '● On' : '◌ Off'}</span></td>
                  <td><button className='btn small' onClick={() => setEditing(b)}>Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <EditBonus bonus={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); reload() }} />}
    </>
  )
}
