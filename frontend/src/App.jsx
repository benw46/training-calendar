import { useRef, useState } from 'react'
import Calendar from './components/Calendar'
import WorkoutModal from './components/WorkoutModal'

export default function App() {
  const reloadRef = useRef(null)
  const [modal, setModal] = useState(null)
  // modal: null | { type: 'add', date: Date } | { type: 'edit', workout: object }

  function handleDayClick(date) {
    setModal({ type: 'add', date })
  }

  function handleCardClick(workout) {
    setModal({ type: 'edit', workout })
  }

  function handleMenuClick(workout) {
    setModal({ type: 'edit', workout })
  }

  function handleSaved() {
    setModal(null)
    reloadRef.current?.()
  }

  function handleDeleted() {
    setModal(null)
    reloadRef.current?.()
  }

  return (
    <div className="app">
      <Calendar
        reloadRef={reloadRef}
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
