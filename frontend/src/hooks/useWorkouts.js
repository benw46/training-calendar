import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/workouts'

export function useWorkouts(start, end) {
  const [workoutsByDate, setWorkoutsByDate] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.list(start, end)
      const byDate = {}
      for (const w of list) {
        if (!byDate[w.date]) byDate[w.date] = []
        byDate[w.date].push(w)
      }
      setWorkoutsByDate(byDate)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => { load() }, [load])

  return { workoutsByDate, loading, error, reload: load }
}
