const BASE = 'http://localhost:8000'

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, opts)
  if (res.status === 204) return null
  if (!res.ok) throw new Error(`API error ${res.status}`)
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
}
