import { supabase } from '../supabaseClient'

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

async function request(path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { ...opts.headers }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

  const res = await fetch(`${BASE}${path}`, { ...opts, headers })
  if (res.status === 204) return null
  if (!res.ok) {
    let detail = null
    try {
      detail = (await res.json())?.detail
    } catch {
      // response body wasn't JSON — fall back to the generic message below
    }
    if (Array.isArray(detail)) {
      detail = detail.map(d => d?.msg ?? JSON.stringify(d)).join('; ')
    }
    throw new Error(detail || `API error ${res.status}`)
  }
  return res.json()
}

export const api = {
  list: (start, end) =>
    request(`/workouts/?start=${start}&end=${end}`),

  getNextEvents: (limit = 3) =>
    request(`/workouts/next-events?limit=${limit}`),

  create: (data) =>
    request('/workouts/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  update: (id, data) =>
    request(`/workouts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  delete: (id) =>
    request(`/workouts/${id}`, { method: 'DELETE' }),

  syncGarmin: () =>
    request('/garmin/sync', { method: 'POST' }),

  getLastSync: () =>
    request('/garmin/last-sync'),

  getRaceBests: () =>
    request('/race-bests/'),

  updateRaceBest: (raceType, data) =>
    request(`/race-bests/${raceType}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
}
