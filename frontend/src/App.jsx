import { useRef } from 'react'
import Calendar from './components/Calendar'

export default function App() {
  const reloadRef = useRef(null)

  function handleDayClick(date) {
    // Opens add-workout modal — wired up in Stage 6
    console.log('day clicked', date)
  }

  function handleCardClick(workout) {
    // Opens edit-workout modal — wired up in Stage 6
    console.log('card clicked', workout)
  }

  function handleMenuClick(workout, e) {
    // Opens edit/delete menu — wired up in Stage 6
    console.log('menu clicked', workout)
  }

  return (
    <div className="app">
      <Calendar
        reloadRef={reloadRef}
        onDayClick={handleDayClick}
        onCardClick={handleCardClick}
        onMenuClick={handleMenuClick}
      />
    </div>
  )
}
