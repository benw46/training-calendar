import { useState, useRef } from 'react'
import WorkoutCard from './WorkoutCard'
import { isSameDay, formatDayHeader, toYMD } from '../utils/dates'
import { sortDayWorkouts } from '../utils/workouts'
import { api } from '../api/workouts'

export default function DayColumn({ date, today, workouts = [], onDayClick, onCardClick, onMenuClick, onReordered, hideHeader = false }) {
  const isToday = isSameDay(date, today)
  const { primary, secondary } = formatDayHeader(date, today)
  const sorted = sortDayWorkouts(workouts)
  const hasEvent = workouts.some(w => w.sport === 'event')

  const [draggedId, setDraggedId] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  // A click can fire right after a completed drag/drop gesture in some
  // browsers; this suppresses opening the edit modal for that stray click.
  const justDraggedRef = useRef(false)

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
            onMenuClick={onMenuClick}
            isDragging={draggedId === w.id}
            isDragOver={dragOverIndex === index && draggedId !== w.id}
            onDragStart={e => handleDragStart(e, w)}
            onDragOver={e => handleDragOver(e, index)}
            onDrop={e => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
          />
        ))}
        {workouts.length === 0 && (
          <div className="day-body__add-hint" aria-hidden="true">+</div>
        )}
      </div>
    </div>
  )
}
