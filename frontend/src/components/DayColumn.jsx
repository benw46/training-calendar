import { useState, useRef, useEffect } from 'react'
import WorkoutCard from './WorkoutCard'
import { isSameDay, formatDayHeader, toYMD } from '../utils/dates'
import { sortDayWorkouts } from '../utils/workouts'
import { api } from '../api/workouts'

const BRICK_RAIL_INSET = 8 // px in from the day-body's right edge, where every connector's vertical segment lines up
const BRICK_DASH_UNIT = 6 // nominal dash+gap length in px, before being fitted to each path's exact length
const BRICK_DASH_FRACTION = 0.55 // dash portion of each unit; the rest is gap
const BRICK_LABEL_OFFSET = 6 // px the "BRICK" label sits off to the side of the line, so it doesn't sit on top of the dashes
const BRICK_TITLE_GAP = 3 // px of breathing room between a title's edge and where the dashed line starts/ends, so it doesn't touch the text

// The transition each brick-able sport leads into, mirroring triathlon's own
// T1 (swim -> bike) and T2 (bike -> run) transitions.
const BRICK_NEXT_SPORT = { swim: 'bike', bike: 'run' }

export default function DayColumn({ date, today, workouts = [], onDayClick, onCardClick, onReordered, hideHeader = false }) {
  const isToday = isSameDay(date, today)
  const { primary, secondary } = formatDayHeader(date, today)
  const sorted = sortDayWorkouts(workouts)
  const hasEvent = workouts.some(w => w.sport === 'event')

  // Consecutive runs of brick-linked workouts (e.g. a swim and bike both
  // marked Brick, followed by a run, forms one 3-long chain) — grouped so
  // the whole chain renders as a single connector rather than two separate
  // ones that would otherwise draw an identical, overlapping segment at
  // their shared middle card. See the measuring effect below.
  const brickChains = []
  {
    let chain = null
    for (let i = 0; i < sorted.length; i++) {
      const cur = sorted[i]
      const nextW = sorted[i + 1]
      if (cur.is_brick && nextW?.sport === BRICK_NEXT_SPORT[cur.sport]) {
        if (!chain) chain = [cur]
        chain.push(nextW)
      } else if (chain) {
        brickChains.push(chain)
        chain = null
      }
    }
    if (chain) brickChains.push(chain)
  }

  const [draggedId, setDraggedId] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  // A click can fire right after a completed drag/drop gesture in some
  // browsers; this suppresses opening the edit modal for that stray click.
  const justDraggedRef = useRef(false)

  const bodyRef = useRef(null)
  const titleRowRefs = useRef(new Map()) // workout id -> .workout-card__top DOM node
  const [connectors, setConnectors] = useState([]) // [{ id, d, kickX, dashArray, labels: [{ y }] }]

  const brickChainKey = brickChains.map(chain => chain.map(w => w.id).join('-')).join(',')

  useEffect(() => {
    const bodyEl = bodyRef.current
    if (!bodyEl || !brickChainKey) { setConnectors([]); return }

    function recompute() {
      const bodyRect = bodyEl.getBoundingClientRect()
      // One shared rail for every connector/chain in the day, so they all
      // stay vertically aligned rather than drifting with title width or
      // being staggered apart.
      const kickX = bodyRect.width - BRICK_RAIL_INSET

      const next = brickChains.map(chain => {
        const rects = chain.map(w => titleRowRefs.current.get(w.id)?.getBoundingClientRect())
        if (rects.some(r => !r)) return null

        const points = rects.map(r => ({
          // Stops a couple pixels shy of the title's actual edge (toward
          // the rail) rather than touching it exactly, so the dashes don't
          // run right up against the text.
          x: r.right - bodyRect.left + BRICK_TITLE_GAP,
          y: r.top + r.height / 2 - bodyRect.top,
        }))

        // Right from the first title to the rail, then for each following
        // title: down/up the rail to its height, in to touch its title,
        // and — unless it's the last one in the chain — back out to the
        // rail to continue toward the next. That "touch and retrace" is
        // what lets one continuous path visit every intermediate title
        // exactly once instead of needing a separate overlapping path per
        // pair.
        let d = `M ${points[0].x} ${points[0].y} L ${kickX} ${points[0].y}`
        let totalLength = Math.abs(kickX - points[0].x)
        for (let i = 1; i < points.length; i++) {
          d += ` L ${kickX} ${points[i].y} L ${points[i].x} ${points[i].y}`
          totalLength += Math.abs(points[i].y - points[i - 1].y) + Math.abs(kickX - points[i].x)
          if (i < points.length - 1) {
            d += ` L ${kickX} ${points[i].y}`
            totalLength += Math.abs(kickX - points[i].x)
          }
        }

        // Fit the dash pattern to this exact path length so it always ends
        // on a complete dash+gap unit — otherwise whatever's left over at
        // the end renders as a visibly truncated partial dash or gap.
        const unitCount = Math.max(1, Math.round(totalLength / BRICK_DASH_UNIT))
        const unit = totalLength / unitCount
        const dash = unit * BRICK_DASH_FRACTION
        const gap = unit - dash

        // One "BRICK" label per link in the chain, each sitting between
        // that link's "from" title and its own card's bottom edge — same
        // as before, just repeated per link instead of just once.
        const labels = chain.slice(0, -1).map((from, i) => {
          const fromCardEl = titleRowRefs.current.get(from.id)?.closest('.workout-card')
          const fromBottom = fromCardEl
            ? fromCardEl.getBoundingClientRect().bottom - bodyRect.top
            : points[i + 1].y
          return { y: (points[i].y + fromBottom) / 2 }
        })

        return { id: chain[0].id, d, kickX, dashArray: `${dash} ${gap}`, labels }
      }).filter(Boolean)
      setConnectors(next)
    }

    recompute()
    const ro = new ResizeObserver(recompute)
    ro.observe(bodyEl)
    return () => ro.disconnect()
    // Deliberately keyed on brickChainKey (which chains) + workouts (when
    // the day's data changes) rather than the freshly-recomputed
    // brickChains array itself, which would re-run this effect (and its
    // ResizeObserver churn) on every render even when nothing changed.
  }, [brickChainKey, workouts])

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
                <path d={c.d} fill="none" stroke="#9ca3af" strokeWidth="1" strokeDasharray={c.dashArray} />
                {c.labels.map((label, i) => (
                  // Rotated around the label's own along-line position
                  // (label.y, not the connector's full span), but offset to
                  // the side of it (via y, which becomes the sideways
                  // direction once rotated) so the label sits beside the
                  // dashes instead of directly on top of them — on the
                  // card-content side of the rail, not the outer-edge side.
                  <text
                    key={i}
                    x={c.kickX} y={label.y - BRICK_LABEL_OFFSET}
                    textAnchor="middle"
                    fontSize="7" fontWeight="700" fill="#9ca3af"
                    transform={`rotate(-90, ${c.kickX}, ${label.y})`}
                  >
                    BRICK
                  </text>
                ))}
              </g>
            ))}
          </svg>
        )}
      </div>
    </div>
  )
}
