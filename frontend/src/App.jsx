import { useRef, useState } from 'react'
import Calendar from './components/Calendar'
import WorkoutModal from './components/WorkoutModal'

export default function App() {
  const reloadRef        = useRef(null)
  const scrollToTodayRef = useRef(null)
  const jumpToDateRef    = useRef(null)

  const [modal, setModal]           = useState(null)
  const [visibleYear, setVisibleYear] = useState(new Date().getFullYear())

  function handleDayClick(date)     { setModal({ type: 'add', date }) }
  function handleCardClick(workout) { setModal({ type: 'edit', workout }) }
  function handleMenuClick(workout) { setModal({ type: 'edit', workout }) }
  function handleSaved()   { setModal(null); reloadRef.current?.() }
  function handleDeleted() { setModal(null); reloadRef.current?.() }

  function handlePrevYear() {
    jumpToDateRef.current?.(new Date(visibleYear - 1, 0, 1))   // Jan 1 of prev year
  }
  function handleNextYear() {
    jumpToDateRef.current?.(new Date(visibleYear + 1, 11, 31)) // Dec 31 of next year
  }

  return (
    <div className="app">
      <header className="app-header">
        <span className="app-header__title">Triathlon Calendar</span>

        <div className="app-header__controls">
          <div className="year-nav">
            <button className="year-nav__btn" onClick={handlePrevYear} aria-label="Previous year">
              &lsaquo;
            </button>
            <span className="year-nav__label">{visibleYear}</span>
            <button className="year-nav__btn" onClick={handleNextYear} aria-label="Next year">
              &rsaquo;
            </button>
          </div>

          <button
            className="app-header__today-btn"
            onClick={() => scrollToTodayRef.current?.()}
          >
            Today
          </button>
        </div>
      </header>

      <Calendar
        reloadRef={reloadRef}
        scrollToTodayRef={scrollToTodayRef}
        jumpToDateRef={jumpToDateRef}
        onYearChange={setVisibleYear}
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
