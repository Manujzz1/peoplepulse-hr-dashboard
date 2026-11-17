import { useEffect, useState } from 'react'
import { Bell, CheckCircle2, ChevronRight, X } from 'lucide-react'

export default function NotificationsCenter({ items = [], onNavigate }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <div className="notifications-center">
      <button type="button" className="notification-button" aria-label={items.length ? `Notifications, ${items.length} active alerts` : 'Notifications, no active alerts'} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Bell size={16} />{items.length > 0 && <span className="notification-count">{items.length > 9 ? '9+' : items.length}</span>}
      </button>
      {open && <div className="notification-popover" role="region" aria-label="Notifications">
        <header><div><strong>Notifications</strong><small>{items.length ? `${items.length} active data-quality alert${items.length === 1 ? '' : 's'}` : 'No active data-quality alerts'}</small></div><button type="button" className="icon-button" aria-label="Close notifications" onClick={() => setOpen(false)}><X size={15} /></button></header>
        {items.length ? <ul>{items.map((item) => <li key={item.id}>{item.actionPage ? <button type="button" onClick={() => { setOpen(false); onNavigate(item.actionPage) }}><span className="notification-copy"><strong>{item.title}</strong><small>{item.detail}</small></span><ChevronRight size={14} /></button> : <div className="notification-copy"><strong>{item.title}</strong><small>{item.detail}</small></div>}</li>)}</ul> : <div className="notifications-clear"><CheckCircle2 size={17} /><span>All current staged-source checks are clear. Synthetic demo data is active.</span></div>}
        <p className="notification-footnote">Alerts are calculated locally from staged source checks. They are not sent to a notification service.</p>
      </div>}
    </div>
  )
}
