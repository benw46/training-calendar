import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/workouts'

const SPORTS = ['swim', 'bike', 'run', 'strength', 'other', 'note', 'event']

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

// A bare integer typed into a duration field is shorthand: 1-10 means
// hours, 11-1000 means minutes. Anything else (including h:mm) is left
// untouched so the normal h:mm entry path still works.
function expandDurationShorthand(str) {
  const trimmed = str.trim()
  if (!/^\d+$/.test(trimmed)) return str
  const n = parseInt(trimmed, 10)
  if (n >= 11 && n <= 1000) return fmtDurationInput(n)
  if (n >= 1 && n <= 10) return `${n}:00`
  return str
}

// A native <input type="date"> displays its value in the browser/OS locale
// (e.g. "11/06/2026", ambiguous day-vs-month), so the field below shows this
// unambiguous formatted text instead and only reveals the native picker on click.
function formatDateDisplay(dateStr) {
  if (!dateStr) return 'Select date'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
      description:        workout.description ?? '',
      planned_duration:   fmtDurationInput(workout.planned_duration_minutes),
      planned_distance:   workout.planned_distance_km ?? '',
      actual_duration:    fmtDurationInput(workout.actual_duration_minutes),
      actual_distance:    workout.actual_distance_km ?? '',
    }
  }
  return {
    date:             toDateInputValue(initialDate),
    sport:            'run',
    name:             '',
    description:      '',
    planned_duration: '',
    planned_distance: '',
    actual_duration:  '',
    actual_distance:  '',
  }
}

export default function WorkoutModal({ workout, initialDate, onClose, onSaved, onDeleted }) {
  const isEdit = Boolean(workout)
  const [form, setForm] = useState(() => initForm(workout, initialDate))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  const isNote = form.sport === 'note'
  const isEvent = form.sport === 'event'
  const isNoteLike = isNote || isEvent
  const close = useCallback(onClose, [onClose])
  const dateInputRef = useRef(null)

  function openDatePicker() {
    const el = dateInputRef.current
    if (!el) return
    if (el.showPicker) el.showPicker()
    else el.focus()
  }

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
    setErrors(e => ({ ...e, [field]: null }))
  }

  function validate(values) {
    const errs = {}
    if (!values.date)  errs.date  = 'Required'
    if (!values.name.trim()) errs.name = 'Required'
    if (!isNoteLike) {
      if (values.planned_duration && parseDuration(values.planned_duration) === null)
        errs.planned_duration = 'Use h:mm'
      if (values.actual_duration && parseDuration(values.actual_duration) === null)
        errs.actual_duration = 'Use h:mm'
    }
    return errs
  }

  async function handleSave(e) {
    e.preventDefault()

    // Pressing Enter submits the form before the duration inputs' onBlur
    // has a chance to fire, so shorthand (e.g. "90") needs expanding here
    // too — otherwise validation sees the raw number and rejects it.
    const values = {
      ...form,
      planned_duration: isNoteLike ? form.planned_duration : expandDurationShorthand(form.planned_duration),
      actual_duration:  isNoteLike ? form.actual_duration  : expandDurationShorthand(form.actual_duration),
    }
    if (values.planned_duration !== form.planned_duration || values.actual_duration !== form.actual_duration) {
      setForm(values)
    }

    const errs = validate(values)
    if (Object.keys(errs).length) { setErrors(errs); return }

    const payload = {
      date:                    values.date,
      sport:                   values.sport,
      name:                    values.name.trim(),
      description:             values.description.trim() || null,
      planned_duration_minutes: isNoteLike ? null : parseDuration(values.planned_duration),
      planned_distance_km:     isNoteLike ? null : (values.planned_distance !== '' ? parseFloat(values.planned_distance) : null),
      actual_duration_minutes:  isNoteLike ? null : parseDuration(values.actual_duration),
      actual_distance_km:      isNoteLike ? null : (values.actual_distance !== '' ? parseFloat(values.actual_distance) : null),
    }

    setSaving(true)
    setSubmitError(null)
    try {
      if (isEdit) await api.update(workout.id, payload)
      else        await api.create(payload)
      onSaved()
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete this ${isEvent ? 'event' : isNote ? 'note' : 'workout'}?`)) return
    setDeleting(true)
    setSubmitError(null)
    try {
      await api.delete(workout.id)
      onDeleted()
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) close()
  }

  const typeLabel = isEvent ? 'Event' : isNote ? 'Note' : 'Workout'
  const modalTitle = `${isEdit ? 'Edit' : 'Add'} ${typeLabel}`

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">{modalTitle}</h2>
          <button className="modal-close" onClick={close} aria-label="Close">✕</button>
        </div>

        <form className="modal-form" onSubmit={handleSave} noValidate>
          <div className="form-row">
            <label className="form-label">Type</label>
            <select className="form-select" value={form.sport} onChange={e => set('sport', e.target.value)}>
              {SPORTS.map(s => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <label className="form-label">Date</label>
            <div className="form-date-field">
              <button
                type="button"
                className={`form-input form-date-display${errors.date ? ' form-input--error' : ''}`}
                onClick={openDatePicker}
              >
                {formatDateDisplay(form.date)}
              </button>
              <input
                type="date"
                ref={dateInputRef}
                className="form-date-input-hidden"
                value={form.date}
                onChange={e => set('date', e.target.value)}
              />
            </div>
            {errors.date && <span className="form-error">{errors.date}</span>}
          </div>

          <div className="form-row">
            <label className="form-label">{isNoteLike ? 'Title' : 'Title / Notes'}</label>
            <input
              type="text"
              className={`form-input${errors.name ? ' form-input--error' : ''}`}
              placeholder={isEvent ? 'e.g. Race Day' : isNote ? 'e.g. Rest day' : 'e.g. Easy Spin'}
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

          <div className="form-row">
            <label className="form-label">Description</label>
            <textarea
              className="form-input form-textarea"
              placeholder="Add any details here…"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
            />
          </div>

          {!isNoteLike && (
            <>
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
                    onBlur={e => set('planned_duration', expandDurationShorthand(e.target.value))}
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
                    onBlur={e => set('actual_duration', expandDurationShorthand(e.target.value))}
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
            </>
          )}

          {submitError && <div className="modal-submit-error">{submitError}</div>}

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
