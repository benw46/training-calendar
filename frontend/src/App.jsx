import { useRef, useState } from 'react'
import Calendar from './components/Calendar'
import WorkoutModal from './components/WorkoutModal'

export default function App() {
  const reloadRef       = useRef(null)
  const scrollToTodayRef = useRef(null)
  const [modal, setModal] = useState(null)

  function handleDayClick(date)    { setModal({ type: 'add', date }) }
  function handleCardClick(workout) { setModal({ type: 'edit', workout }) }
  function handleMenuClick(workout) { setModal({ type: 'edit', workout }) }
  function handleSaved()   { setModal(null); reloadRef.current?.() }
  function handleDeleted() { setModal(null); reloadRef.current?.() }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__title">Triathlon Calendar</span>
        <button
          className="app-header__today-btn"
          onClick={() => scrollToTodayRef.current?.()}
        >
          Today
        </button>
      </header>

      <Calendar
        reloadRef={reloadRef}
        scrollToTodayRef={scrollToTodayRef}
        onDayClick={handleDayClick}
        onCardClick={handleCardClick}
        onMenuClick={handleMenuClick}
      />

      {modal && (
        <WorkoutModal
          workout={modal.type === 'edit' ? modal.workout : null}
          initialDate={modal.type === 'add' ? modal.date : null}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
