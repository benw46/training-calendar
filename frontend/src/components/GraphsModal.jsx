import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/workouts'
import { listToByDate } from '../utils/workouts'
import { weekActualTotal } from '../utils/weeklyTotals'
import { getMondayOf, addWeeks, addDays, toYMD } from '../utils/dates'

const WEEKS_3MO  = 13 // ~3 months of weekly buckets, including the current week
const WEEKS_YEAR = 52
const THREE_MO_VIEWBOX_WIDTH = 340 // must match the default `width` used for the 3-month chart below
const TOOLTIP_W = 92
const TOOLTIP_H = 36
const PR_SPORTS = [
  { key: 'swim', label: 'Swim' },
  { key: 'bike', label: 'Bike' },
  { key: 'run',  label: 'Run'  },
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

const RACE_TYPE_KEYS = ['half_marathon', 'marathon', 'ironman']

const RACE_TIME_PATTERN = /^\d{1,2}:\d{2}:\d{2}$/

function RaceBestsTable({ records, onSave }) {
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
        {RACE_TYPE_KEYS.map(key => {
          const record = recordFor(key)
          return (
            <tr key={key}>
              <td>
                <input
                  type="text"
                  className="race-best-input race-best-input--name"
                  placeholder="Race name"
                  value={fieldValue(key, 'race_name')}
                  onChange={e => handleChange(key, 'race_name', e.target.value)}
                  onBlur={() => handleBlurText(key, 'race_name')}
                />
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
            <td>{r.distanceKm != null ? `${r.distanceKm} km` : '—'}</td>
            <td>{r.date ? formatFullDate(r.date) : '—'}</td>
            <td>{r.date ? timeSince(r.date) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function WeeklyDurationChart({ points, labelStep = 2, ariaLabel, width = 340, height = 260, svgRef }) {
  const [hoverIndex, setHoverIndex] = useState(null)

  const padding = { top: 16, right: 12, bottom: 34, left: 38 }
  const innerW = width - padding.left - padding.right
  const innerH = height - padding.top - padding.bottom

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

      {points.map((p, i) => (
        (i % labelStep === 0 || i === points.length - 1) && (
          <text key={i} x={xAt(i)} y={height - padding.bottom + 18}
                textAnchor="middle" fontSize="9" fill="#6b7280">
            {p.label}
          </text>
        )
      ))}

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

export default function GraphsModal({ onClose }) {
  const [weekly3mo, setWeekly3mo]   = useState(null)
  const [weeklyYear, setWeeklyYear] = useState(null)
  const [bests, setBests]           = useState(null)
  const [raceBests, setRaceBests]   = useState(null)
  const [error3mo, setError3mo]     = useState(null)
  const [errorYear, setErrorYear]   = useState(null)
  const [errorRaces, setErrorRaces] = useState(null)
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
  }, [weekly3mo])

  const scale = threeMoSize && threeMoSize.width ? threeMoSize.width / THREE_MO_VIEWBOX_WIDTH : null
  const yearViewBoxWidth  = scale && yearWidth ? yearWidth / scale : 700
  const yearViewBoxHeight = scale && threeMoSize ? threeMoSize.height / scale : 200

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
        setWeekly3mo(buildWeeklyPoints(listToByDate(list), startMonday3mo, WEEKS_3MO))
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
              <h3 className="graph-panel-title">Personal Bests - Races</h3>
              {errorRaces && <div className="modal-submit-error">Couldn't load data — {errorRaces}</div>}
              {!errorRaces && !raceBests && <div className="graph-loading">Loading…</div>}
              {raceBests && <RaceBestsTable records={raceBests} onSave={handleSaveRaceBest} />}
            </div>

            <div className="graph-panel--table-block">
              <h3 className="graph-panel-title">Personal Bests — Last Three Months</h3>
              {error3mo && <div className="modal-submit-error">Couldn't load data — {error3mo}</div>}
              {!error3mo && !bests && <div className="graph-loading">Loading…</div>}
              {bests && <PersonalBestsTable records={bests} />}
            </div>
          </div>

          <div className="graph-panel graph-panel--chart graph-panel--chart-3mo">
            <h3 className="graph-panel-title">Weekly Duration — Last Three Months</h3>
            {error3mo && <div className="modal-submit-error">Couldn't load data — {error3mo}</div>}
            {!error3mo && !weekly3mo && <div className="graph-loading">Loading…</div>}
            {weekly3mo && (
              <WeeklyDurationChart
                points={weekly3mo}
                labelStep={2}
                svgRef={threeMoWrapRef}
                ariaLabel="Total workout duration per week, in hours, over the last three months"
              />
            )}
          </div>

          <div className="graph-panel graph-panel--chart graph-panel--chart-year" ref={yearWrapRef}>
            <h3 className="graph-panel-title">Weekly Duration — Last Year</h3>
            {errorYear && <div className="modal-submit-error">Couldn't load data — {errorYear}</div>}
            {!errorYear && !weeklyYear && <div className="graph-loading">Loading…</div>}
            {weeklyYear && (
              <WeeklyDurationChart
                points={weeklyYear}
                labelStep={2}
                width={yearViewBoxWidth}
                height={yearViewBoxHeight}
                ariaLabel="Total workout duration per week, in hours, over the last year"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
