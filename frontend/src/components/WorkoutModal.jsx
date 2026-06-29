import { useState, useEffect, useCallback } from 'react'
import { api } from '../api/workouts'

const SPORTS = ['swim', 'bike', 'run', 'strength', 'other']

function parseDuration(str) {
  if (!str || !str.trim()) return null
  const parts = str.trim().split(':')
  if (parts.length !== 2) return null
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (isNaN(h) || isNaN(m) || m < 0 || m > 59) return null
  return h * 60 + m
}

function fmtDurationInput(minutes) {
  if (minutes == null) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function toDateInputValue(date) {
  if (!date) return ''
  if (typeof date === 'string') return date
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function initForm(workout, initialDate) {
  if (workout) {
    return {
      date:               workout.date,
      sport:              workout.sport,
      name:               workout.name,
      planned_duration:   fmtDurationInput(workout.planned_duration_minutes),
      planned_distance:   workout.planned_distance_km ?? '',
      actual_duration:    fmtDurationInput(workout.actual_duration_minutes),
      actual_distance:    workout.actual_distance_km ?? '',
      completed:          workout.completed,
    }
  }
  return {
    date:             toDateInputValue(initialDate),
    sport:            'run',
    name:             '',
    planned_duration: '',
    planned_distance: '',
    actual_duration:  '',
    actual_distance:  '',
    completed:        false,
  }
}

export default function WorkoutModal({ workout, initialDate, onClose, onSaved, onDeleted }) {
  const isEdit = Boolean(workout)
  const [form, setForm] = useState(() => initForm(workout, initialDate))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const close = useCallback(onClose, [onClose])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: null }))
  }

  function validate() {
    const errs = {}
    if (!form.date)  errs.date  = 'Required'
    if (!form.name.trim()) errs.name = 'Required'
    if (form.planned_duration && parseDuration(form.planned_duration) === null)
      errs.planned_duration = 'Use h:mm'
    if (form.actual_duration && parseDuration(form.actual_duration) === null)
      errs.actual_duration = 'Use h:mm'
    return errs
  }

  async function handleSave(e) {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    const payload = {
      date:                    form.date,
      sport:                   form.sport,
      name:                    form.name.trim(),
      planned_duration_minutes: parseDuration(form.planned_duration),
      planned_distance_km:     form.planned_distance !== '' ? parseFloat(form.planned_distance) : null,
      actual_duration_minutes:  parseDuration(form.actual_duration),
      actual_distance_km:      form.actual_distance !== '' ? parseFloat(form.actual_distance) : null,
      completed:               form.completed,
    }

    setSaving(true)
    try {
      if (isEdit) await api.update(workout.id, payload)
      else        await api.create(payload)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this workout?')) return
    setDeleting(true)
    try {
      await api.delete(workout.id)
      onDeleted()
    } finally {
      setDeleting(false)
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) close()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">{isEdit ? 'Edit Workout' : 'Add Workout'}</h2>
          <button className="modal-close" onClick={close} aria-label="Close">✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSave} noValidate>
          <div className="form-row">
            <label className="form-label">Sport</label>
            <select className="form-select" value={form.sport} onChange={e => set('sport', e.target.value)}>
              {SPORTS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="form-label">Date</label>
            <input
              type="date"
              className={`form-input${errors.date ? ' form-input--error' : ''}`}
              value={form.date}
              onChange={e => set('date', e.target.value)}
            />
            {errors.date && <span className="form-error">{errors.date}</span>}
          </div>

          <div className="form-row">
            <label className="form-label">Name / Notes</label>
            <input
              type="text"
              className={`form-input${errors.name ? ' form-input--error' : ''}`}
              placeholder="e.g. Easy Spin"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          <div className="form-section-label">Planned</div>

          <div className="form-row form-row--inline">
            <div className="form-field">
              <label className="form-label">Duration</label>
              <input
                type="text"
                className={`form-input${errors.planned_duration ? ' form-input--error' : ''}`}
                placeholder="h:mm"
                value={form.planned_duration}
                onChange={e => set('planned_duration', e.target.value)}
              />
              {errors.planned_duration && <span className="form-error">{errors.planned_duration}</span>}
            </div>
            <div className="form-field">
              <label className="form-label">Distance (km)</label>
              <input
                type="number"
                className="form-input"
                placeholder="0.0"
                min="0"
                step="0.1"
                value={form.planned_distance}
                onChange={e => set('planned_distance', e.target.value)}
              />
            </div>
          </div>

          <div className="form-section-label">Actual</div>

          <div className="form-row form-row--inline">
            <div className="form-field">
              <label className="form-label">Duration</label>
              <input
                type="text"
                className={`form-input${errors.actual_duration ? ' form-input--error' : ''}`}
                placeholder="h:mm"
                value={form.actual_duration}
                onChange={e => set('actual_duration', e.target.value)}
              />
              {errors.actual_duration && <span className="form-error">{errors.actual_duration}</span>}
            </div>
            <div className="form-field">
              <label className="form-label">Distance (km)</label>
              <input
                type="number"
                className="form-input"
                placeholder="0.0"
                min="0"
                step="0.1"
                value={form.actual_distance}
                onChange={e => set('actual_distance', e.target.value)}
              />
            </div>
          </div>

          <div className="form-row form-row--checkbox">
            <label className="form-checkbox-label">
              <input
                type="checkbox"
                checked={form.completed}
                onChange={e => set('completed', e.target.checked)}
              />
              Mark as done
            </label>
          </div>

          <div className="modal-actions">
            {isEdit && (
              <button
                type="button"
                className="btn btn--danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            )}
            <div className="modal-actions__right">
              <button type="button" className="btn btn--secondary" onClick={close}>Cancel</button>
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
