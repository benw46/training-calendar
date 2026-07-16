import { useState, useRef, useEffect } from 'react'
import WorkoutCard from './WorkoutCard'
import { isSameDay, formatDayHeader, toYMD } from '../utils/dates'
import { sortDayWorkouts } from '../utils/workouts'
import { api } from '../api/workouts'

const BRICK_RAIL_INSET = 8 // px in from the day-body's right edge, where every connector's vertical segment lines up
const BRICK_DASH_UNIT = 6 // nominal dash+gap length in px, before being fitted to each path's exact length
const BRICK_DASH_FRACTION = 0.55 // dash portion of each unit; the rest is gap
const BRICK_LABEL_OFFSET = 6 // px the "BRICK" label sits off to the side of the line, so it doesn't sit on top of the dashes

export default function DayColumn({ date, today, workouts = [], onDayClick, onCardClick, onReordered, hideHeader = false }) {
  const isToday = isSameDay(date, today)
  const { primary, secondary } = formatDayHeader(date, today)
  const sorted = sortDayWorkouts(workouts)
  const hasEvent = workouts.some(w => w.sport === 'event')

  // A bike marked "Brick" with a run directly under it gets a dotted line
  // routed from its title, right to a rail aligned with the cards' right
  // edge, down past whatever's in between, then left into the run's title
  // — see the measuring effect below.
  const brickPairs = sorted
    .map((w, i) => [w, sorted[i + 1]])
    .filter(([bike, run]) => bike.sport === 'bike' && bike.is_brick && run?.sport === 'run')

  const [draggedId, setDraggedId] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  // A click can fire right after a completed drag/drop gesture in some
  // browsers; this suppresses opening the edit modal for that stray click.
  const justDraggedRef = useRef(false)

  const bodyRef = useRef(null)
  const titleRowRefs = useRef(new Map()) // workout id -> .workout-card__top DOM node
  const [connectors, setConnectors] = useState([]) // [{ id, startX, startY, kickX, endX, endY }]

  const brickPairKey = brickPairs.map(([bike, run]) => `${bike.id}:${run.id}`).join(',')

  useEffect(() => {
    const bodyEl = bodyRef.current
    if (!bodyEl || !brickPairKey) { setConnectors([]); return }

    function recompute() {
      const bodyRect = bodyEl.getBoundingClientRect()
      const next = brickPairs.map(([bike, run]) => {
        const bikeEl = titleRowRefs.current.get(bike.id)
        const runEl = titleRowRefs.current.get(run.id)
        if (!bikeEl || !runEl) return null
        const bikeRect = bikeEl.getBoundingClientRect()
        const runRect = runEl.getBoundingClientRect()
        const startX = bikeRect.right - bodyRect.left
        const startY = bikeRect.top + bikeRect.height / 2 - bodyRect.top
        const endX = runRect.right - bodyRect.left
        const endY = runRect.top + runRect.height / 2 - bodyRect.top
        // Fixed per day (not derived from either title's width) so every
        // brick connector's vertical segment lines up along the same rail,
        // aligned to the right of the cards rather than drifting with
        // however long each title happens to be.
        const kickX = bodyRect.width - BRICK_RAIL_INSET

        // Fit the dash pattern to this exact path length so it always ends
        // on a complete dash+gap unit — otherwise whatever's left over at
        // the end renders as a visibly truncated partial dash or gap.
        const totalLength = Math.abs(kickX - startX) + Math.abs(endY - startY) + Math.abs(kickX - endX)
        const unitCount = Math.max(1, Math.round(totalLength / BRICK_DASH_UNIT))
        const unit = totalLength / unitCount
        const dash = unit * BRICK_DASH_FRACTION
        const gap = unit - dash

        // The label sits between the bend (at the bike title's height) and
        // the bike card's own bottom edge, centered so the gap above it
        // (down to the bend) matches the gap below it (down to the card's
        // bottom) — rather than the connector's overall midpoint, which can
        // land well past the bike card entirely once other cards sit
        // between the bike and the run.
        const bikeCardEl = bikeEl.closest('.workout-card')
        const bikeBottom = bikeCardEl ? bikeCardEl.getBoundingClientRect().bottom - bodyRect.top : endY
        const labelY = (startY + bikeBottom) / 2

        return { id: bike.id, startX, startY, kickX, endX, endY, labelY, dashArray: `${dash} ${gap}` }
      }).filter(Boolean)
      setConnectors(next)
    }

    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(bodyEl)
    return () => ro.disconnect()
    // Deliberately keyed on brickPairKey (which pair) + workouts (when the
    // day's data changes) rather than the freshly-recomputed brickPairs
    // array itself, which would re-run this effect (and its ResizeObserver
    // churn) on every render even when nothing about the pairs changed.
  }, [brickPairKey, workouts])

  function handleBodyClick(e) {
    if (e.target.closest('.workout-card')) return
    onDayClick?.(date)
  }

  function handleCardClick(workout) {
    if (justDraggedRef.current) return
    onCardClick?.(workout)
  }

  function handleDragStart(e, workout) {
    // Carry the whole workout (not just its id) via dataTransfer so a day
    // column other than the one the drag started in — which never sees this
    // component's local state — can still tell what's being dropped and
    // where it's coming from.
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/json', JSON.stringify(workout))
    setDraggedId(workout.id)
  }

  function handleDragOver(e, index) {
    e.preventDefault() // required to allow a drop
    e.stopPropagation() // let this card's index win over the day-body's own handler
    setDragOverIndex(index)
  }

  function handleBodyDragOver(e) {
    e.preventDefault()
    setDragOverIndex(sorted.length)
  }

  function handleBodyDragLeave(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return // still inside this column
    setDragOverIndex(null)
  }

  async function handleDrop(e, dropIndex) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverIndex(null)
    setDraggedId(null)

    let dragged
    try {
      dragged = JSON.parse(e.dataTransfer.getData('application/json'))
    } catch {
      return
    }
    if (!dragged) return

    const ymd = toYMD(date)
    const sameDay = dragged.date === ymd
    const draggedIndex = sorted.findIndex(w => w.id === dragged.id)
    if (sameDay && (draggedIndex === -1 || draggedIndex === dropIndex)) return

    const reordered = [...sorted]
    if (sameDay) {
      const [moved] = reordered.splice(draggedIndex, 1)
      reordered.splice(dropIndex, 0, moved)
    } else {
      reordered.splice(dropIndex, 0, { ...dragged, date: ymd })
    }

    // Persist sequential positions for the whole day (not just the moved
    // card) so a day is always fully unordered or fully ordered, never a
    // partial mix — see sortDayWorkouts in utils/workouts.js. A cross-day
    // move also carries the new date, but only for the moved card itself.
    try {
      await Promise.all(reordered.map((w, i) =>
        api.update(w.id, w.id === dragged.id ? { date: ymd, sort_order: i } : { sort_order: i })
      ))
    } catch {
      // A failed reorder is trivially recoverable (drag again); resync with
      // whatever the server actually has rather than surfacing an error.
    } finally {
      onReordered?.()
    }
  }

  function handleDragEnd() {
    setDraggedId(null)
    setDragOverIndex(null)
    justDraggedRef.current = true
    setTimeout(() => { justDraggedRef.current = false }, 0)
  }

  return (
    <div className="day-column">
      {!hideHeader && (
        <div
          className={`day-header${isToday ? ' day-header--today' : ''}`}
          onClick={() => onDayClick?.(date)}
        >
          <span className="day-header__primary">{primary}</span>
          {secondary && <span className="day-header__secondary">{secondary}</span>}
          {hasEvent && <span className="day-header__race-day">RACE DAY</span>}
        </div>
      )}
      <div
        className={`day-body${dragOverIndex === sorted.length ? ' day-body--drag-over' : ''}`}
        ref={bodyRef}
        onClick={handleBodyClick}
        onDragOver={handleBodyDragOver}
        onDragLeave={handleBodyDragLeave}
        onDrop={e => handleDrop(e, sorted.length)}
      >
        {sorted.map((w, index) => (
          <WorkoutCard
            key={w.id}
            workout={w}
            today={today}
            onClick={handleCardClick}
            isDragging={draggedId === w.id}
            isDragOver={dragOverIndex === index && draggedId !== w.id}
            onDragStart={e => handleDragStart(e, w)}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={e => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            titleRowRef={node => {
              if (node) titleRowRefs.current.set(w.id, node)
              else titleRowRefs.current.delete(w.id)
            }}
          />
        ))}
        {workouts.length === 0 && (
          <div className="day-body__add-hint" aria-hidden="true">+</div>
        )}
        {connectors.length > 0 && (
          <svg className="brick-connector-overlay" aria-hidden="true">
            {connectors.map(c => (
              <g key={c.id}>
                <path
                  d={`M ${c.startX} ${c.startY} L ${c.kickX} ${c.startY} L ${c.kickX} ${c.endY} L ${c.endX} ${c.endY}`}
                  fill="none" stroke="#9ca3af" strokeWidth="1" strokeDasharray={c.dashArray}
                />
                {/* Rotated around the label's own along-line position
                    (c.labelY, not the connector's full midpoint), but
                    offset to the side of it (via y, which becomes the
                    sideways direction once rotated) so the label sits
                    beside the dashes instead of directly on top of them —
                    on the card-content side of the rail, not the
                    outer-edge side. */}
                <text
                  x={c.kickX} y={c.labelY - BRICK_LABEL_OFFSET}
                  textAnchor="middle"
                  fontSize="7" fontWeight="700" fill="#9ca3af"
                  transform={`rotate(-90, ${c.kickX}, ${c.labelY})`}
                >
                  BRICK
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}
