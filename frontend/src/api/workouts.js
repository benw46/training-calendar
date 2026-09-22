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
    // A 401 here means the session itself is bad (expired/invalid) — no
    // amount of retrying the request fixes that. Sign out so the app falls
    // back to the login screen (App.jsx's onAuthStateChange listener picks
    // this up) instead of leaving cryptic "Invalid or expired session"
    // errors scattered across whichever components happened to be fetching.
    if (res.status === 401) {
      supabase.auth.signOut()
    }
    throw new Error(detail || `API error ${res.status}`)
  }
  return res.json()
}

export const api = {
  list: (start, end) =>
    request(`/workouts/?start=${start}&end=${end}`),

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

  getPiStatus: () =>
    request('/garmin/status'),

  getRaceBests: () =>
    request('/race-bests/'),

  updateRaceBest: (raceType, data) =>
    request(`/race-bests/${raceType}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  reorderRaceBests: (order) =>
    request('/race-bests/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    }),

  getNotes: (mode = 'training') =>
    request(`/notes/?mode=${mode}`),

  createNote: (data = {}, mode = 'training') =>
    request('/notes/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, mode }),
    }),

  updateNote: (id, data) =>
    request(`/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteNote: (id) =>
    request(`/notes/${id}`, { method: 'DELETE' }),

  reorderNotes: (order, mode = 'training') =>
    request(`/notes/reorder?mode=${mode}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    }),

  listStudy: (start, end) =>
    request(`/study/?start=${start}&end=${end}`),

  createStudy: (data) =>
    request('/study/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateStudy: (id, data) =>
    request(`/study/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteStudy: (id) =>
    request(`/study/${id}`, { method: 'DELETE' }),
}

// A single { list, create, update, delete } surface so calendar components
// (Calendar, MobileDayView, DayColumn, WorkoutModal, SummaryPanel) don't need
// to branch on mode themselves — see ModeContext.
export function resourceFor(mode) {
  return mode === 'study'
    ? { list: api.listStudy, create: api.createStudy, update: api.updateStudy, delete: api.deleteStudy }
    : { list: api.list, create: api.create, update: api.update, delete: api.delete }
}
