import { createContext, useContext, useMemo } from 'react'
import { resourceFor } from './api/workouts'

// Lets calendar components several levels below App (Calendar -> WeekRow ->
// DayColumn -> WorkoutCard) read the current mode and its CRUD resource
// without threading a prop through every layer.
const ModeContext = createContext({ mode: 'training', resource: resourceFor('training') })

export function ModeProvider({ mode, children }) {
  const value = useMemo(() => ({ mode, resource: resourceFor(mode) }), [mode])
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>
}

export function useMode() {
  return useContext(ModeContext)
}
