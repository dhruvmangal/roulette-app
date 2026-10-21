import { useEffect, useRef, type ReactNode } from 'react'
import type { PlayerStatus } from '../api'
import { navigate } from '../router'

export function StatTile ({ label, value, note }: { label: string, value: ReactNode, note?: ReactNode }) {
  return (
    <div className='tile'>
      <div className='tile-label'>{label}</div>
      <div className='tile-value'>{value}</div>
      {note && <div className='tile-note'>{note}</div>}
    </div>
  )
}

const STATUS_ICON: Record<string, string> = { active: '●', banned: '⊘', inactive: '◌' }

export function StatusBadge ({ status }: { status: PlayerStatus | string }) {
  return <span className={`badge badge-${status}`}><span aria-hidden>{STATUS_ICON[status] ?? '●'}</span> {status}</span>
}

export function Amount ({ value, direction }: { value: number, direction: 'CREDIT' | 'DEBIT' }) {
  return <span className={`amount ${direction === 'CREDIT' ? 'credit' : 'debit'}`}>{direction === 'CREDIT' ? '+' : '−'}{value.toLocaleString('en-US')}</span>
}

/** An in-app link: a real href (so new-tab works) that navigates without reloading. */
export function Link ({ to, children, className }: { to: string, children: ReactNode, className?: string }) {
  return (
    <a
      href={`/admin${to}`}
      className={className}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

export function Pager ({ count, pageNo, limit, onPage }: { count: number, pageNo: number, limit: number, onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(count / limit))
  const first = count === 0 ? 0 : (pageNo - 1) * limit + 1
  return (
    <div className='pager'>
      <span>{count === 0 ? 'No results' : `${first.toLocaleString()}–${Math.min(count, pageNo * limit).toLocaleString()} of ${count.toLocaleString()}`}</span>
      <div className='pager-buttons'>
        <button className='btn' disabled={pageNo <= 1} onClick={() => onPage(pageNo - 1)}>Previous</button>
        <button className='btn' disabled={pageNo >= pages} onClick={() => onPage(pageNo + 1)}>Next</button>
      </div>
    </div>
  )
}

export function Modal ({ title, onClose, children }: { title: string, onClose: () => void, children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog ref={ref} className='modal' onCancel={(event) => { event.preventDefault(); onClose() }}>
      <div className='modal-head'>
        <h2>{title}</h2>
        <button className='icon-btn' aria-label='Close' onClick={onClose}>×</button>
      </div>
      {children}
    </dialog>
  )
}

export function Loading () {
  return <div className='empty'>Loading…</div>
}

export function ErrorNote ({ error }: { error: string }) {
  return <div className='error-note' role='alert'>{error}</div>
}
