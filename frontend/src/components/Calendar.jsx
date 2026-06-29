import { useRef, useEffect } from 'react'
import WeekRow from './WeekRow'
import { getMondayOf, addWeeks, toYMD } from '../utils/dates'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Mock data — replaced by real API data in Stage 5
const MOCK_WORKOUTS = {
  '2026-06-22': [
    { id: 1, date: '2026-06-22', sport: 'bike', name: 'Easy Spin',
      planned_duration_minutes: 120, planned_distance_km: 45,
      actual_duration_minutes: 90, actual_distance_km: 36.4, completed: true },
  ],
  '2026-06-23': [
    { id: 2, date: '2026-06-23', sport: 'swim', name: 'Open Water Swim',
      planned_duration_minutes: 50, planned_distance_km: null,
      actual_duration_minutes: 50, actual_distance_km: 2.1, completed: true },
  ],
  '2026-06-24': [
    { id: 3, date: '2026-06-24', sport: 'run', name: 'Tempo Run',
      planned_duration_minutes: 45, planned_distance_km: 8,
      actual_duration_minutes: null, actual_distance_km: null, completed: false },
  ],
  '2026-06-25': [
    { id: 4, date: '2026-06-25', sport: 'bike', name: 'Brick — Easy Bike',
      planned_duration_minutes: 120, planned_distance_km: 45,
      actual_duration_minutes: 115, actual_distance_km: 42.5, completed: true },
    { id: 5, date: '2026-06-25', sport: 'run', name: 'Brick — Easy Run',
      planned_duration_minutes: 30, planned_distance_km: 5,
      actual_duration_minutes: 28, actual_distance_km: 4.8, completed: true },
  ],
  '2026-06-26': [
    { id: 6, date: '2026-06-26', sport: 'swim', name: 'Swim',
      planned_duration_minutes: 30, planned_distance_km: null,
      actual_duration_minutes: 15, actual_distance_km: 0.6, completed: false },
  ],
  '2026-06-28': [
    { id: 7, date: '2026-06-28', sport: 'bike', name: 'Easy Cycle',
      planned_duration_minutes: 120, planned_distance_km: 52.5,
      actual_duration_minutes: 116, actual_distance_km: 52.5, completed: true },
  ],
  '2026-06-29': [
    { id: 8, date: '2026-06-29', sport: 'run', name: 'Easy Run',
      planned_duration_minutes: 30, planned_distance_km: null,
      actual_duration_minutes: 28, actual_distance_km: 6.81, completed: true },
  ],
  '2026-06-30': [
    { id: 9,  date: '2026-06-30', sport: 'swim', name: 'Open Water Swim',
      planned_duration_minutes: 50, completed: false },
    { id: 10, date: '2026-06-30', sport: 'bike', name: 'Easy Spin',
      planned_duration_minutes: 90, completed: false },
  ],
  '2026-07-01': [
    { id: 11, date: '2026-07-01', sport: 'run',      name: 'Easy Run',             planned_duration_minutes: 30, completed: false },
    { id: 12, date: '2026-07-01', sport: 'strength', name: 'Gym Stretch & Strength', planned_duration_minutes: 30, completed: false },
  ],
  '2026-07-02': [
    { id: 13, date: '2026-07-02', sport: 'bike', name: 'Easy Spin',
      planned_duration_minutes: 60, completed: false },
  ],
  '2026-07-04': [
    { id: 14, date: '2026-07-04', sport: 'bike', name: 'Easy Spin',
      planned_duration_minutes: 120, completed: false },
    { id: 15, date: '2026-07-04', sport: 'swim', name: 'Open Water Swim',
      planned_duration_minutes: 60, completed: false },
  ],
  '2026-07-05': [
    { id: 16, date: '2026-07-05', sport: 'run', name: 'Easy Run',
      planned_duration_minutes: 60, completed: false },
  ],
}

export default function Calendar({ onDayClick, onCardClick, onMenuClick }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentMonday = getMondayOf(today)

  const weeks = Array.from({ length: 7 }, (_, i) => addWeeks(currentMonday, i - 3))

  const todayRef = useRef(null)
  useEffect(() => {
    todayRef.current?.scrollIntoView({ block: 'center' })
  }, [])

  return (
    <div className="calendar">
      <div className="calendar-day-names">
        {DAY_NAMES.map(name => (
          <div key={name} className="day-name">{name}</div>
        ))}
        <div className="day-name day-name--summary"></div>
      </div>
      <div className="calendar-body">
        {weeks.map((monday) => {
          const key = toYMD(monday)
          const isCurrentWeek = key === toYMD(currentMonday)
          return (
            <div key={key} ref={isCurrentWeek ? todayRef : null}>
              <WeekRow
                monday={monday}
                today={today}
                workoutsByDate={MOCK_WORKOUTS}
                onDayClick={onDayClick}
                onCardClick={onCardClick}
                onMenuClick={onMenuClick}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
