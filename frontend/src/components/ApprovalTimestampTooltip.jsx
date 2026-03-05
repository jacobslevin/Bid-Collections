import { useMemo, useState } from 'react'

export default function ApprovalTimestampTooltip({
  label = 'Needs Fix',
  timestamps = [],
  showCount = true,
  labelClassName = 'approval-needs-fix-label'
}) {
  const [hovered, setHovered] = useState(false)
  const normalizedTimestamps = useMemo(() => (
    Array.isArray(timestamps) ? timestamps.filter(Boolean) : []
  ), [timestamps])

  if (normalizedTimestamps.length === 0) {
    return <span className={labelClassName}>{label}</span>
  }

  const count = normalizedTimestamps.length
  const displayLabel = (showCount && count > 1) ? `${label} (${count}x)` : label

  return (
    <span
      className="approval-tooltip-anchor"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className={labelClassName}>{displayLabel}</span>
      {hovered && count > 1 ? (
        <span className="approval-timestamp-tooltip" role="tooltip">
          {normalizedTimestamps.map((value, index) => (
            <span key={`${value}-${index}`} className="approval-timestamp-tooltip-row">
              {index + 1}. {new Date(value).toLocaleDateString()}
            </span>
          ))}
          <span className="approval-timestamp-tooltip-arrow" />
        </span>
      ) : null}
    </span>
  )
}
