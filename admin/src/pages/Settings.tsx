import { useState } from 'react'
import { api, errorText } from '../api'
import { ErrorNote, Loading } from '../components/ui'
import { ago } from '../format'
import { useApi } from '../useApi'

type Side = 'web' | 'app'
interface AdsSettings { ads: Record<Side, boolean>, updatedAt: string | null }

const SIDES: { key: Side, name: string, detail: string }[] = [
  { key: 'web', name: 'Website', detail: 'An AdSense ad in a dialog between rounds, for people playing in a browser.' },
  { key: 'app', name: 'Mobile app', detail: 'An AdMob full-screen ad between rounds in the iOS and Android apps.' }
]

export function Settings () {
  const { data, error, reload } = useApi(() => api<AdsSettings>('GET', '/settings/ads'), 'settings:ads')
  const [busy, setBusy] = useState<Side | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const set = async (side: Side, on: boolean) => {
    setBusy(side)
    setSaveError(null)
    try {
      await api('PATCH', '/settings/ads', { body: { [side]: on } })
      reload()
    } catch (err) {
      setSaveError(errorText(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <header className='page-head'><h1>Settings</h1></header>
      <h2>Ads between rounds</h2>
      <p className='muted lead'>
        Players see an ad every few rounds. Turning a switch off stops ads for that side. Apps check the switch when a table opens
        and every few minutes, so an open session can show one more ad for a short while. Every change is recorded in the audit log.
      </p>
      {error && <ErrorNote error={error} />}
      {saveError && <ErrorNote error={saveError} />}
      {!data ? <Loading /> : (
        <div className='table-wrap'>
          <table className='data'>
            <thead><tr><th>Where</th><th>State</th><th /></tr></thead>
            <tbody>
              {SIDES.map(({ key, name, detail }) => {
                const on = data.ads[key]
                return (
                  <tr key={key}>
                    <td><span className='strong'>{name}</span><div className='muted'>{detail}</div></td>
                    <td><span className={`badge ${on ? 'badge-active' : 'badge-inactive'}`}>{on ? '● On' : '◌ Off'}</span></td>
                    <td><button className='btn small' disabled={busy !== null} onClick={() => set(key, !on)}>{busy === key ? 'Saving…' : on ? 'Turn off' : 'Turn on'}</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {data?.updatedAt && <p className='muted'>Last changed {ago(data.updatedAt)}.</p>}
      <p className='muted'>Ads also need the AdSense and AdMob ids set in the builds. Without them nothing shows, whatever these switches say.</p>
    </>
  )
}
