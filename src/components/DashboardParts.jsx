import { ArrowDownRight, ArrowUpRight, MoreHorizontal } from 'lucide-react'

export function Panel({ title, subtitle, action, className = '', children }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        {action || <button className="panel-more" aria-label={`More options for ${title}`}><MoreHorizontal size={19} /></button>}
      </div>
      {children}
    </section>
  )
}

export function MetricCard({ label, value, detail, change, tone = 'blue', icon: Icon, formatValue }) {
  const positive = typeof change === 'number' && change >= 0
  return (
    <article className="metric-card">
      <div className="metric-top">
        <div className="metric-label">{label}</div>
        <div className={`metric-icon ${tone}`}><Icon size={18} strokeWidth={1.9} /></div>
      </div>
      <div className="metric-value">{formatValue ? formatValue(value) : value}</div>
      <div className="metric-footer">
        <span className={`metric-change ${change === undefined ? 'muted' : positive ? 'up' : 'down'}`}>
          {change !== undefined && (positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />)}
          {change === undefined ? detail : `${Math.abs(change)}%`}
        </span>
        {change !== undefined && <span className="metric-context">{detail}</span>}
      </div>
    </article>
  )
}

export function EmptyChart({ message = 'No data available for these filters' }) {
  return <div className="chart-empty"><span className="empty-mark">—</span><p>{message}</p></div>
}

export function ChartTooltip({ active, payload, label, currency = false, formatINR }) {
  if (!active || !payload?.length) return null
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <div className="tooltip-line" key={item.dataKey}>
          <span><i style={{ background: item.color || item.fill }} />{item.name}</span>
          <b>{item.value == null ? 'Unavailable' : currency && formatINR ? formatINR(item.value) : item.value}</b>
        </div>
      ))}
    </div>
  )
}

