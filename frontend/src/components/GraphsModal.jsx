import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/workouts'
import { listToByDate, SPORT_COLORS } from '../utils/workouts'
import { weekActualTotal, weekActualTotalsBySport } from '../utils/weeklyTotals'
import { getMondayOf, addWeeks, addDays, toYMD } from '../utils/dates'

const WEEKS_3MO  = 13 // ~3 months of weekly buckets, including the current week
const WEEKS_YEAR = 52
// Where the last-three-months window starts within the year chart's 52
// points, expressed as a fractional index so the marker line sits between
// two weekly dots rather than through one.
const YEAR_BOUNDARY_INDEX = WEEKS_YEAR - WEEKS_3MO - 0.5
const THREE_MO_VIEWBOX_WIDTH = 340 // must match the default `width` used for the 3-month chart below
// Shared with WeeklyDurationChart's own `padding` — pulled out here so the
// phone-mode width math below can reproduce its per-point x spacing exactly.
const CHART_PADDING_LEFT = 38
const CHART_PADDING_RIGHT = 12
// Phone mode: rather than squeezing all 52 weeks into the same on-screen
// width as the 3-month chart's 13, extend that chart's per-week spacing out
// to 52 weeks and let the year chart scroll horizontally — so a week reads
// as the same size in both charts. A viewBox-unit width, independent of any
// particular screen's pixel size.
const YEAR_VIEWBOX_WIDTH_MATCHED = CHART_PADDING_LEFT + CHART_PADDING_RIGHT +
  ((THREE_MO_VIEWBOX_WIDTH - CHART_PADDING_LEFT - CHART_PADDING_RIGHT) / (WEEKS_3MO - 1)) * (WEEKS_YEAR - 1)
// Fixed pixel width of the non-scrolling y-axis strip pinned beside the
// phone-mode year chart — just wide enough for "16h"-sized tick labels.
const AXIS_PANEL_WIDTH = 40
const TOOLTIP_W = 92
const TOOLTIP_H = 36
const PR_SPORTS = [
  { key: 'swim', label: 'Swim' },
  { key: 'bike', label: 'Bike' },
  { key: 'run',  label: 'Run'  },
]

// Stack order (bottom to top) for the by-sport chart, and the shared source
// of truth for its legend. Colors match SportIcon's stripes so a sport reads
// the same way everywhere in the app; 'gym' groups 'strength' as
// weekActualTotalsBySport does.
const SPORT_STACK = [
  { key: 'swim',  label: 'Swim',  color: SPORT_COLORS.swim },
  { key: 'bike',  label: 'Bike',  color: SPORT_COLORS.bike },
  { key: 'run',   label: 'Run',   color: SPORT_COLORS.run },
  { key: 'gym',   label: 'Gym',   color: SPORT_COLORS.strength },
  { key: 'other', label: 'Other', color: SPORT_COLORS.other },
]

function buildWeeklyPoints(byDate, startMonday, weekCount) {
  return Array.from({ length: weekCount }, (_, i) => {
    const monday = addWeeks(startMonday, i)
    const minutes = weekActualTotal(byDate, monday)
    return {
      label: monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      hours: Math.round((minutes / 60) * 10) / 10,
    }
  })
}

function buildWeeklySportPoints(byDate, startMonday, weekCount) {
  return Array.from({ length: weekCount }, (_, i) => {
    const monday = addWeeks(startMonday, i)
    const minutesBySport = weekActualTotalsBySport(byDate, monday)
    const bySport = {}
    let total = 0
    for (const { key } of SPORT_STACK) {
      const hours = Math.round((minutesBySport[key] / 60) * 10) / 10
      bySport[key] = hours
      total += hours
    }
    return {
      label: monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      bySport,
      total: Math.round(total * 10) / 10,
    }
  })
}

function computeDistancePRs(list) {
  return PR_SPORTS.map(({ key, label }) => {
    let best = null
    for (const w of list) {
      if (w.sport !== key) continue
      if (w.actual_distance_km == null || w.actual_distance_km <= 0) continue
      if (!best || w.actual_distance_km > best.distanceKm) {
        best = { distanceKm: w.actual_distance_km, date: w.date }
      }
    }
    return { key, label, ...best }
  })
}

// Short-term (≤3 weeks) reads as weeks; ≤~1 year reads as months (plus a
// leftover-weeks remainder when it doesn't land on a whole month, months
// approximated as 4 weeks); beyond that reads as years (plus a leftover-
// months remainder) since "83 months ago" stops being readable long before
// "6 years, 11 months ago" does.
function timeSince(dateStr) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const then = new Date(dateStr + 'T00:00:00')
  const days = Math.floor((today - then) / 86400000)
  const weeks = Math.floor(days / 7)

  if (weeks <= 0) return 'This week'
  if (weeks <= 3) return `${weeks} week${weeks === 1 ? '' : 's'} ago`

  const months = Math.floor(weeks / 4)
  const remWeeks = weeks % 4

  if (months < 12) {
    if (remWeeks === 0) return `${months} month${months === 1 ? '' : 's'} ago`
    return `${months} month${months === 1 ? '' : 's'}, ${remWeeks} week${remWeeks === 1 ? '' : 's'} ago`
  }

  const years = Math.floor(months / 12)
  const remMonths = months % 12
  if (remMonths === 0) return `${years} year${years === 1 ? '' : 's'} ago`
  return `${years} year${years === 1 ? '' : 's'}, ${remMonths} month${remMonths === 1 ? '' : 's'} ago`
}

// Shared so both Personal Bests tables render dates identically — a native
// <input type="date"> displays its value in the browser/OS locale (e.g.
// "12/07/2026", ambiguous day-vs-month), so RaceBestsTable below shows this
// formatted text instead and only reveals the native picker on click.
function formatFullDate(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const RACE_TIME_PATTERN = /^\d{1,2}:\d{2}:\d{2}$/

function RaceBestsTable({ records, onSave, draggedIndex, onDragStart, onDragOver, onDragEnd }) {
  const [drafts, setDrafts] = useState({}) // { [raceType]: { race_name?, result?, date? } }
  const dateInputRefs = useRef({})

  function recordFor(key) {
    return records.find(r => r.race_type === key) ?? { race_type: key }
  }

  function fieldValue(key, field) {
    const draft = drafts[key]?.[field]
    if (draft !== undefined) return draft
    return recordFor(key)[field] ?? ''
  }

  function handleChange(key, field, value) {
    setDrafts(d => ({ ...d, [key]: { ...d[key], [field]: value } }))
  }

  function handleBlurText(key, field) {
    const value = fieldValue(key, field).trim()
    onSave(key, { [field]: value === '' ? null : value })
  }

  function handleBlurResult(key) {
    const value = fieldValue(key, 'result').trim()
    if (value === '') {
      onSave(key, { result: null })
      return
    }
    if (!RACE_TIME_PATTERN.test(value)) return // leave the draft as-is; not saved until valid
    onSave(key, { result: value })
  }

  function handleDateChange(key, value) {
    handleChange(key, 'date', value)
    onSave(key, { date: value === '' ? null : value })
  }

  function openDatePicker(key) {
    const el = dateInputRefs.current[key]
    if (!el) return
    if (el.showPicker) el.showPicker()
    else el.focus()
  }

  return (
    <table className="pr-table">
      <thead>
        <tr>
          <th>Race</th>
          <th>Result</th>
          <th>Date</th>
          <th>Time Since</th>
        </tr>
      </thead>
      <tbody>
        {records.map((record, index) => {
          const key = record.race_type
          return (
            <tr
              key={key}
              className={draggedIndex === index ? 'pr-table__row--dragging' : ''}
              onDragOver={e => { e.preventDefault(); onDragOver(index) }}
              onDrop={e => e.preventDefault()}
            >
              <td>
                {/* Handle lives inside the first cell (rather than its own
                    column) so this table keeps the same 4-column widths as the
                    Personal Bests table below it and stays aligned with it. */}
                <div className="race-best-name-cell">
                  <span
                    className="pr-table__drag-handle"
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(index) }}
                    onDragEnd={onDragEnd}
                    aria-label="Drag to reorder"
                    title="Drag to reorder"
                  >
                    <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
                      <circle cx="3" cy="3" r="1.3" fill="currentColor" />
                      <circle cx="7" cy="3" r="1.3" fill="currentColor" />
                      <circle cx="3" cy="8" r="1.3" fill="currentColor" />
                      <circle cx="7" cy="8" r="1.3" fill="currentColor" />
                      <circle cx="3" cy="13" r="1.3" fill="currentColor" />
                      <circle cx="7" cy="13" r="1.3" fill="currentColor" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    className="race-best-input race-best-input--name"
                    placeholder="Race name"
                    value={fieldValue(key, 'race_name')}
                    onChange={e => handleChange(key, 'race_name', e.target.value)}
                    onBlur={() => handleBlurText(key, 'race_name')}
                  />
                </div>
              </td>
              <td>
                <input
                  type="text"
                  className="race-best-input"
                  placeholder="hh:mm:ss"
                  value={fieldValue(key, 'result')}
                  onChange={e => handleChange(key, 'result', e.target.value)}
                  onBlur={() => handleBlurResult(key)}
                />
              </td>
              <td className="race-best-date-cell">
                <button
                  type="button"
                  className="race-best-date-display"
                  onClick={() => openDatePicker(key)}
                >
                  {record.date ? formatFullDate(record.date) : 'Add date'}
                </button>
                <input
                  type="date"
                  ref={el => { dateInputRefs.current[key] = el }}
                  className="race-best-date-input"
                  value={fieldValue(key, 'date')}
                  onChange={e => handleDateChange(key, e.target.value)}
                />
              </td>
              <td>{record.date ? timeSince(record.date) : '—'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function PersonalBestsTable({ records }) {
  return (
    <table className="pr-table">
      <thead>
        <tr>
          <th>Sport</th>
          <th>Longest</th>
          <th>Date</th>
          <th>Time Since</th>
        </tr>
      </thead>
      <tbody>
        {records.map(r => (
          <tr key={r.key}>
            <td>{r.label}</td>
            <td>{r.distanceKm != null ? `${r.distanceKm}km` : '—'}</td>
            <td>{r.date ? formatFullDate(r.date) : '—'}</td>
            <td>{r.date ? timeSince(r.date) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WeeklyDurationChart({ points, ariaLabel, width = 340, height = 260, svgRef, boundaryIndex, pixelWidth, pixelHeight, axisOnly = false, showYAxisLabels = true }) {
  const [hoverIndex, setHoverIndex] = useState(null)

  const padding = { top: boundaryIndex != null ? 26 : 16, right: CHART_PADDING_RIGHT, bottom: 34, left: CHART_PADDING_LEFT }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  // Rather than a fixed "label every Nth point" step — which reads fine at
  // the width it was tuned for but overlaps badly once the same chart (e.g.
  // this component reused at 52 points for the year view) gets squeezed
  // into a narrower container, such as phone view's single-column stack —
  // derive the step from how much width is actually available per label.
  const MIN_PX_PER_LABEL = 42
  const labelStep = Math.max(1, Math.ceil((points.length * MIN_PX_PER_LABEL) / innerW))
  const lastIndex = points.length - 1
  // The final point always gets a label (so the chart's right edge date is
  // never blank), but that can land less than a full step past the last
  // regular one — closer than labelStep guarantees anywhere else — and
  // visually crowd or overlap it. Drop that last regular label instead.
  function shouldShowLabel(i) {
    if (i === lastIndex) return true
    if (i % labelStep !== 0) return false
    return lastIndex - i >= labelStep
  }

  const maxHours = Math.max(1, ...points.map(p => p.hours))
  const yMax = Math.max(2, Math.ceil(maxHours / 2) * 2)

  // Weeks are discrete categories, not a continuous scale — each gets its
  // own evenly-spaced slot regardless of the (irrelevant) gap between dates.
  const xStep = points.length > 1 ? innerW / (points.length - 1) : 0
  const xAt = i => padding.left + i * xStep
  const yAt = h => padding.top + innerH - (h / yMax) * innerH

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(1)} ${yAt(p.hours).toFixed(1)}`)
    .join(' ')

  const yTickCount = 4
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => Math.round((yMax / yTickCount) * i))

  const hovered = hoverIndex != null ? points[hoverIndex] : null
  const tooltipCx = hoverIndex != null
    ? Math.min(Math.max(xAt(hoverIndex), padding.left + TOOLTIP_W / 2), width - padding.right - TOOLTIP_W / 2)
    : 0
  const pointCy = hovered ? yAt(hovered.hours) : 0
  const tooltipTop = pointCy - TOOLTIP_H - 12 < 2 ? pointCy + 12 : pointCy - TOOLTIP_H - 12

  // Normally width:100% (from .weekly-chart) lets the SVG shrink to fit its
  // container. Phone mode's year chart instead needs a fixed on-screen size
  // — wider than the container, scrolling horizontally — so its weeks render
  // at the same pixel size as the 3-month chart's rather than being squeezed.
  const fixedSizeStyle = pixelWidth != null ? { width: pixelWidth, height: pixelHeight, maxWidth: 'none' } : undefined

  // A standalone strip of just the y-axis numbers, pinned outside the
  // scrollable container (see .graph-year-scroll-wrap) so 0h/4h/8h/etc stay
  // on screen while the full chart beside it scrolls horizontally. Computed
  // from the same points/height/padding as the real chart, so its tick
  // positions land exactly level with that chart's gridlines.
  if (axisOnly) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="weekly-chart" style={fixedSizeStyle} aria-hidden="true">
        {yTicks.map(v => {
          const y = yAt(v)
          return (
            <text key={v} x={width - CHART_PADDING_RIGHT} y={y + 4} textAnchor="end" fontSize="10" fill="#6b7280">
              {v}h
            </text>
          )
        })}
      </svg>
    )
  }

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="weekly-chart" style={fixedSizeStyle} role="img" aria-label={ariaLabel}>
      {yTicks.map(v => {
        const y = yAt(v)
        return (
          <g key={v}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y}
                  stroke="#eaecf0" strokeWidth="1" />
            {showYAxisLabels && (
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#6b7280">
                {v}h
              </text>
            )}
          </g>
        )
      })}

      {points.map((p, i) => {
        if (!shouldShowLabel(i)) return null
        // The first/last labels sit right at the chart's left/right edge, so
        // centering them lets half the text spill past the SVG viewBox and
        // get clipped (e.g. the trailing "0" of "Jul 20"). Anchor those two
        // inward (start/end) instead; interior labels stay centered.
        const anchor = i === 0 ? 'start' : i === lastIndex ? 'end' : 'middle'
        return (
          <text key={i} x={xAt(i)} y={height - padding.bottom + 18}
                textAnchor={anchor} fontSize="9" fill="#6b7280">
            {p.label}
          </text>
        )
      })}

      {boundaryIndex != null && (
        <g>
          <line x1={xAt(boundaryIndex)} y1={padding.top} x2={xAt(boundaryIndex)} y2={height - padding.bottom}
                stroke="#9ca3af" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
          <text x={xAt(boundaryIndex)} y={padding.top - 10} textAnchor="middle" fontSize="9" fill="#9ca3af">
            3 Months
          </text>
        </g>
      )}

      <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="2.5"
            strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) => {
        const isHovered = hoverIndex === i
        return (
          <circle
            key={i}
            cx={xAt(i)}
            cy={yAt(p.hours)}
            r={isHovered ? 5.5 : 4.5}
            fill="#2563eb"
            stroke="#fff"
            strokeWidth="1.5"
          />
        )
      })}

      {/* Larger invisible hit targets on top so hovering near a point (not
          just exactly on its small visible dot) still registers. */}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={xAt(i)}
          cy={yAt(p.hours)}
          r="12"
          fill="transparent"
          onMouseEnter={() => setHoverIndex(i)}
          onMouseLeave={() => setHoverIndex(null)}
          style={{ cursor: 'pointer' }}
        />
      ))}

      {hovered && (
        <g pointerEvents="none">
          <rect
            x={tooltipCx - TOOLTIP_W / 2}
            y={tooltipTop}
            width={TOOLTIP_W}
            height={TOOLTIP_H}
            rx="5"
            fill="#111827"
            opacity="0.92"
          />
          <text x={tooltipCx} y={tooltipTop + 15} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
            {hovered.label}
          </text>
          <text x={tooltipCx} y={tooltipTop + 29} textAnchor="middle" fontSize="11" fill="#e5e7eb">
            {hovered.hours}h
          </text>
        </g>
      )}
    </svg>
  )
}

function WeeklyDurationBySportChart({ points, ariaLabel, width = 340, height = 260, svgRef }) {
  const [hoverIndex, setHoverIndex] = useState(null)

  const padding = { top: 16, right: 12, bottom: 34, left: 38 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

  const MIN_PX_PER_LABEL = 42
  const labelStep = Math.max(1, Math.ceil((points.length * MIN_PX_PER_LABEL) / innerW))
  const lastIndex = points.length - 1
  function shouldShowLabel(i) {
    if (i === lastIndex) return true
    if (i % labelStep !== 0) return false
    return lastIndex - i >= labelStep
  }

  const maxTotal = Math.max(1, ...points.map(p => p.total))
  const yMax = Math.max(2, Math.ceil(maxTotal / 2) * 2)

  // Weeks are discrete bands here (bars), not point positions on a line —
  // each gets an equal-width slot and the bar is centered within it.
  const bandStep = points.length > 0 ? innerW / points.length : 0
  const barWidth = Math.min(28, bandStep * 0.6)
  const xBandCenter = i => padding.left + bandStep * (i + 0.5)
  const yAt = h => padding.top + innerH - (h / yMax) * innerH

  const yTickCount = 4
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => Math.round((yMax / yTickCount) * i))

  const hovered = hoverIndex != null ? points[hoverIndex] : null
  const hoveredSegments = hovered ? SPORT_STACK.filter(s => (hovered.bySport[s.key] ?? 0) > 0) : []

  // The tooltip lists every sport that had time this week (plus a total
  // row), so — unlike the single-value tooltip above — its height depends on
  // how many rows that turns out to be.
  const TOOLTIP_ROW_H = 13
  const TOOLTIP_HEADER_H = 16
  const sportTooltipW = 106
  const sportTooltipH = hovered ? TOOLTIP_HEADER_H + (hoveredSegments.length + 1) * TOOLTIP_ROW_H + 6 : 0

  const tooltipCx = hoverIndex != null
    ? Math.min(Math.max(xBandCenter(hoverIndex), padding.left + sportTooltipW / 2), width - padding.right - sportTooltipW / 2)
    : 0
  const barTopY = hovered ? yAt(hovered.total) : 0
  const tooltipTop = barTopY - sportTooltipH - 12 < 2 ? barTopY + 12 : barTopY - sportTooltipH - 12

  return (
    <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} className="weekly-chart" role="img" aria-label={ariaLabel}>
      {yTicks.map(v => {
        const y = yAt(v)
        return (
          <g key={v}>
            <line x1={padding.left} y1={y} x2={width - padding.right} y2={y}
                  stroke="#eaecf0" strokeWidth="1" />
            <text x={padding.left - 8} y={y + 4} textAnchor="end" fontSize="10" fill="#6b7280">
              {v}h
            </text>
          </g>
        )
      })}

      {points.map((p, i) => {
        if (!shouldShowLabel(i)) return null
        return (
          <text key={i} x={xBandCenter(i)} y={height - padding.bottom + 18}
                textAnchor="middle" fontSize="9" fill="#6b7280">
            {p.label}
          </text>
        )
      })}

      {points.map((p, i) => {
        let cum = 0
        return (
          <g key={i}>
            {SPORT_STACK.map(({ key, color }) => {
              const val = p.bySport[key] ?? 0
              if (val <= 0) return null
              const yTop = yAt(cum + val)
              const yBottom = yAt(cum)
              cum += val
              return (
                <rect key={key} x={xBandCenter(i) - barWidth / 2} y={yTop}
                      width={barWidth} height={Math.max(0, yBottom - yTop)} fill={color} />
              )
            })}
          </g>
        )
      })}

      {/* Hit target spans the whole band (not just the bar) so hovering
          anywhere in a week's column — including the gap beside a short or
          empty bar — still shows its tooltip. */}
      {points.map((p, i) => (
        <rect
          key={i}
          x={padding.left + bandStep * i}
          y={padding.top}
          width={bandStep}
          height={innerH}
          fill="transparent"
          onMouseEnter={() => setHoverIndex(i)}
          onMouseLeave={() => setHoverIndex(null)}
          style={{ cursor: 'pointer' }}
        />
      ))}

      {hovered && (
        <g pointerEvents="none">
          <rect
            x={tooltipCx - sportTooltipW / 2}
            y={tooltipTop}
            width={sportTooltipW}
            height={sportTooltipH}
            rx="5"
            fill="#111827"
            opacity="0.92"
          />
          <text x={tooltipCx} y={tooltipTop + 12} textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
            {hovered.label}
          </text>
          {hoveredSegments.map((s, idx) => {
            const rowY = tooltipTop + TOOLTIP_HEADER_H + idx * TOOLTIP_ROW_H
            return (
              <g key={s.key}>
                <circle cx={tooltipCx - sportTooltipW / 2 + 10} cy={rowY + 5} r="3" fill={s.color} />
                <text x={tooltipCx - sportTooltipW / 2 + 18} y={rowY + 9} fontSize="9.5" fill="#e5e7eb">
                  {s.label}
                </text>
                <text x={tooltipCx + sportTooltipW / 2 - 10} y={rowY + 9} textAnchor="end" fontSize="9.5" fill="#e5e7eb">
                  {hovered.bySport[s.key]}h
                </text>
              </g>
            )
          })}
          {(() => {
            const rowY = tooltipTop + TOOLTIP_HEADER_H + hoveredSegments.length * TOOLTIP_ROW_H
            return (
              <>
                <text x={tooltipCx - sportTooltipW / 2 + 10} y={rowY + 9} fontSize="10" fontWeight="700" fill="#fff">
                  Total
                </text>
                <text x={tooltipCx + sportTooltipW / 2 - 10} y={rowY + 9} textAnchor="end" fontSize="10" fontWeight="700" fill="#fff">
                  {hovered.total}h
                </text>
              </>
            )
          })()}
        </g>
      )}
    </svg>
  )
}

export default function GraphsModal({ onClose }) {
  const [weekly3moBySport, setWeekly3moBySport] = useState(null)
  const [weeklyYear, setWeeklyYear] = useState(null)
  const [bests, setBests]           = useState(null)
  const [raceBests, setRaceBests]   = useState(null)
  const [error3mo, setError3mo]     = useState(null)
  const [errorYear, setErrorYear]   = useState(null)
  const [errorRaces, setErrorRaces] = useState(null)
  const [draggedRaceIndex, setDraggedRaceIndex] = useState(null)
  const close = useCallback(onClose, [onClose])

  // The year chart's own dimensions are derived (below) from these two
  // measurements so it renders at exactly the 3-month chart's height while
  // filling the full row width — rather than a hardcoded aspect ratio, which
  // would drift out of sync the next time either panel's width changes.
  const threeMoWrapRef = useRef(null)
  const yearWrapRef    = useRef(null)
  const [threeMoSize, setThreeMoSize] = useState(null) // { width, height } of the rendered 3-month chart
  const [yearWidth, setYearWidth]     = useState(null) // rendered width of the year panel

  useEffect(() => {
    const threeMoEl = threeMoWrapRef.current
    const yearEl = yearWrapRef.current
    if (!threeMoEl || !yearEl) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (entry.target === threeMoEl) setThreeMoSize({ width, height })
        else if (entry.target === yearEl) setYearWidth(width)
      }
    })
    ro.observe(threeMoEl)
    ro.observe(yearEl)
    return () => ro.disconnect()
  }, [weekly3moBySport])

  const scale = threeMoSize && threeMoSize.width ? threeMoSize.width / THREE_MO_VIEWBOX_WIDTH : null
  const yearViewBoxWidth  = scale && yearWidth ? yearWidth / scale : 700
  const yearViewBoxHeight = scale && threeMoSize ? threeMoSize.height / scale : 200

  // Below this width the layout switches to phone mode's single-column
  // stack (see the matching @media (max-width: 700px) rule in styles.css),
  // where the year chart becomes a fixed-size, horizontally scrollable SVG
  // instead of one that shrinks to fit its column.
  const [isPhone, setIsPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 700px)')
    const update = () => setIsPhone(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // scale, reused from above, already maps the 3-month chart's viewBox units
  // to its actual on-screen pixels — applying it to YEAR_VIEWBOX_WIDTH_MATCHED
  // gives the year chart the same per-week pixel size on this screen.
  const yearMatchedPixelWidth = scale ? scale * YEAR_VIEWBOX_WIDTH_MATCHED : null

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  useEffect(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const currentMonday = getMondayOf(today)

    const startMonday3mo = addWeeks(currentMonday, -(WEEKS_3MO - 1))
    api.list(toYMD(startMonday3mo), toYMD(addDays(currentMonday, 6)))
      .then(list => {
        setWeekly3moBySport(buildWeeklySportPoints(listToByDate(list), startMonday3mo, WEEKS_3MO))
        setBests(computeDistancePRs(list))
      })
      .catch(err => setError3mo(err.message))

    const startMondayYear = addWeeks(currentMonday, -(WEEKS_YEAR - 1))
    api.list(toYMD(startMondayYear), toYMD(addDays(currentMonday, 6)))
      .then(listToByDate)
      .then(byDate => setWeeklyYear(buildWeeklyPoints(byDate, startMondayYear, WEEKS_YEAR)))
      .catch(err => setErrorYear(err.message))

    api.getRaceBests()
      .then(setRaceBests)
      .catch(err => setErrorRaces(err.message))
  }, [])

  function handleSaveRaceBest(raceType, data) {
    api.updateRaceBest(raceType, data)
      .then(updated => setRaceBests(prev => prev.map(r => r.race_type === raceType ? updated : r)))
      .catch(err => setErrorRaces(err.message))
  }

  // Drag reordering of the race rows. The order updates live as the pointer
  // passes over another row (like the gym-exercises table), then persists once
  // on drop — a race row carries its own race_type, so a reorder only shuffles
  // display order and never touches the per-race values.
  function handleRaceDragOver(index) {
    if (draggedRaceIndex === null || draggedRaceIndex === index) return
    setRaceBests(rows => {
      const next = [...rows]
      const [moved] = next.splice(draggedRaceIndex, 1)
      next.splice(index, 0, moved)
      return next
    })
    setDraggedRaceIndex(index)
  }

  function handleRaceDragEnd() {
    setDraggedRaceIndex(null)
    if (raceBests) {
      api.reorderRaceBests(raceBests.map(r => r.race_type))
        .catch(err => setErrorRaces(err.message))
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) close()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal modal--wide" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">Graphs</h2>
          <button className="modal-close" onClick={close} aria-label="Close">✕</button>
        </div>

        <div className="graph-body graph-body--triple">
          <div
            className="graph-panel graph-panel--table-stack"
            style={threeMoSize ? { height: threeMoSize.height } : undefined}
          >
            <div className="graph-panel--table-block">
              <h3 className="graph-panel-title">Personal Bests — Races</h3>
              {errorRaces && <div className="modal-submit-error">Couldn't load data — {errorRaces}</div>}
              {!errorRaces && !raceBests && <div className="graph-loading">Loading…</div>}
              {raceBests && (
                <RaceBestsTable
                  records={raceBests}
                  onSave={handleSaveRaceBest}
                  draggedIndex={draggedRaceIndex}
                  onDragStart={setDraggedRaceIndex}
                  onDragOver={handleRaceDragOver}
                  onDragEnd={handleRaceDragEnd}
                />
              )}
            </div>

            <div className="graph-panel--table-block">
              <h3 className="graph-panel-title">Personal Bests — Last Three Months</h3>
              {error3mo && <div className="modal-submit-error">Couldn't load data — {error3mo}</div>}
              {!error3mo && !bests && <div className="graph-loading">Loading…</div>}
              {bests && <PersonalBestsTable records={bests} />}
            </div>
          </div>

          <div className="graph-panel graph-panel--chart graph-panel--chart-3mo">
            <h3 className="graph-panel-title">Weekly Duration by Sport — Last Three Months</h3>
            <div className="sport-legend">
              {SPORT_STACK.map(s => (
                <span className="sport-legend__item" key={s.key}>
                  <span className="sport-legend__dot" style={{ background: s.color }} />
                  {s.label}
                </span>
              ))}
            </div>
            {error3mo && <div className="modal-submit-error">Couldn't load data — {error3mo}</div>}
            {!error3mo && !weekly3moBySport && <div className="graph-loading">Loading…</div>}
            {weekly3moBySport && (
              <WeeklyDurationBySportChart
                points={weekly3moBySport}
                svgRef={threeMoWrapRef}
                ariaLabel="Total workout duration per week, broken down by sport, over the last three months"
              />
            )}
          </div>

          <div className="graph-panel graph-panel--chart graph-panel--chart-year" ref={yearWrapRef}>
            <h3 className="graph-panel-title">Weekly Duration — Last Year</h3>
            {errorYear && <div className="modal-submit-error">Couldn't load data — {errorYear}</div>}
            {!errorYear && !weeklyYear && <div className="graph-loading">Loading…</div>}
            {weeklyYear && (isPhone ? (
              threeMoSize ? (
                <div className="graph-year-scroll-wrap">
                  <WeeklyDurationChart
                    points={weeklyYear}
                    width={AXIS_PANEL_WIDTH}
                    height={260}
                    pixelWidth={AXIS_PANEL_WIDTH}
                    pixelHeight={threeMoSize.height}
                    boundaryIndex={YEAR_BOUNDARY_INDEX}
                    axisOnly
                  />
                  <div className="graph-year-scroll">
                    <WeeklyDurationChart
                      points={weeklyYear}
                      width={YEAR_VIEWBOX_WIDTH_MATCHED}
                      height={260}
                      pixelWidth={yearMatchedPixelWidth}
                      pixelHeight={threeMoSize.height}
                      boundaryIndex={YEAR_BOUNDARY_INDEX}
                      showYAxisLabels={false}
                      ariaLabel="Total workout duration per week, in hours, over the last year"
                    />
                  </div>
                </div>
              ) : (
                <div className="graph-loading">Loading…</div>
              )
            ) : (
              <WeeklyDurationChart
                points={weeklyYear}
                width={yearViewBoxWidth}
                height={yearViewBoxHeight}
                boundaryIndex={YEAR_BOUNDARY_INDEX}
                ariaLabel="Total workout duration per week, in hours, over the last year"
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
