import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/workouts'
import { addWeeks, toYMD } from '../utils/dates'
import { fmtRepsTime, repsTimeUnit, distanceExerciseUnit } from '../utils/workouts'

const SPORTS = ['swim', 'bike', 'run', 'strength', 'other', 'note', 'event', 'period']
// 'strength' is the sport's stable internal/DB value; "Gym" is only how it's
// labeled in the UI, so every other sport still falls back to a
// capitalized version of its own value.
const SPORT_LABELS = { strength: 'Gym' }
const MAX_DURATION_MINUTES = 100 * 60
const MAX_DISTANCE_KM = 500
const EMPTY_EXERCISE = { name: '', sets: '', reps: '', weight: '', bodyweight: false, is_time: false }
const EMPTY_DISTANCE_EXERCISE = { name: '', distance: '', reps: '' }

// With Time checked the Reps box holds m:ss / mm:ss instead of a count. It
// still leaves here as a plain integer — total seconds — so `reps` is one
// number downstream either way, with `is_time` marking which it is.
function parseRepsTime(str) {
  if (!str || !str.trim()) return null
  const [m, s] = str.trim().split(':')
  const mins = parseInt(m, 10)
  if (isNaN(mins)) return null
  const secs = parseInt(s, 10)
  return mins * 60 + (isNaN(secs) ? 0 : secs)
}

// Digits and a single colon only. The seconds aren't range-checked here —
// that waits for the blur below, so a half-typed "1:7" isn't rewritten out
// from under the cursor before the second digit arrives. Digits with no colon
// yet are still shorthand and may be a seconds count ("120"), so they get a
// third digit that the mm of a finished mm:ss doesn't need.
function sanitizeRepsTime(str) {
  const [mins, ...rest] = str.replace(/[^\d:]/g, '').split(':')
  if (!rest.length) return mins.slice(0, 3)
  return `${mins.slice(0, 2)}:${rest.join('').slice(0, 2)}`
}

// Fills in what m:ss shorthand leaves out, once the field is left: a lone
// seconds digit pads ("1:5" → "1:05") and anything past a minute clamps
// ("1:75" → "1:59"). A bare number with no colon is minutes up to 10
// ("3" → "3:00"); past that it's read as seconds ("45" → "0:45", "90" →
// "1:30"), mirroring how expandDurationShorthand splits hours from minutes
// by magnitude in the duration fields above.
function normalizeRepsTime(str) {
  const trimmed = str.trim()
  if (!trimmed) return ''
  const [m, s] = trimmed.split(':')
  const mins = parseInt(m, 10)
  if (isNaN(mins)) return ''
  if (!s) return mins > 10 ? fmtRepsTime(mins) : `${mins}:00`
  const secs = Math.min(parseInt(s, 10) || 0, 59)
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function parseDuration(str) {
  if (!str || !str.trim()) return null
  const parts = str.trim().split(':')
  if (parts.length !== 2) return null
  const h = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  if (isNaN(h) || isNaN(m) || h < 0 || m < 0 || m > 59) return null
  return h * 60 + m
}

function fmtDurationInput(minutes) {
  if (minutes == null) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

// Pace is derived from actual duration/distance rather than stored, so it
// stays live as either input changes — including for manually-entered runs
// that never came from Garmin.
function formatPace(durationMinutes, distanceKm) {
  if (!durationMinutes || !distanceKm) return '—'
  const paceMinPerKm = durationMinutes / distanceKm
  let mins = Math.floor(paceMinPerKm)
  let secs = Math.round((paceMinPerKm - mins) * 60)
  if (secs === 60) { mins += 1; secs = 0 }
  return `${mins}:${String(secs).padStart(2, '0')} /km`
}

// Cycling is normally read as speed rather than pace — same
// duration/distance inputs as formatPace, just expressed as km/h.
function formatSpeed(durationMinutes, distanceKm) {
  if (!durationMinutes || !distanceKm) return '—'
  const kmh = distanceKm / (durationMinutes / 60)
  return `${kmh.toFixed(1)} km/h`
}

// Total elevation gain, straight from Garmin — only ever comes from the
// sync (see sync_garmin.py); there's no form field that writes it. Never
// negative, unlike the per-split net figure below.
function formatElevation(elevationGainM) {
  if (elevationGainM == null) return '—'
  return `${Math.round(elevationGainM)} m`
}

// Net elevation change for one split (gain minus loss, matching how Strava
// shows it — can be negative for a net-downhill split), split into
// sign/digits/unit so the splits table can lay them out in fixed-width
// columns — the digits line up vertically down the table regardless of
// whether a row has a "-" or not, rather than the whole string just being
// right-aligned as one block.
function elevationParts(elevationNetM) {
  if (elevationNetM == null) return { sign: '', value: '—', unit: '' }
  const rounded = Math.round(elevationNetM)
  return { sign: rounded < 0 ? '−' : '', value: Math.abs(rounded), unit: 'm' }
}

// Every split is a full km except (usually) the last one, which covers
// whatever distance was left when the run ended — label that one by its own
// distance (e.g. "0.34") instead of the next whole km number, since it isn't
// actually a full kilometre.
function splitKmLabel(distanceKm, index) {
  if (distanceKm >= 0.995) return String(index + 1)
  return String(Math.round(distanceKm * 100) / 100)
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

function initExercises(gymExercises) {
  if (!gymExercises || !gymExercises.length) return []
  return gymExercises.map(ex => ({
    name:       ex.name ?? '',
    sets:       ex.sets ?? '',
    reps:       ex.is_time ? fmtRepsTime(ex.reps) : (ex.reps ?? ''),
    weight:     ex.weight ?? '',
    bodyweight: ex.bodyweight ?? false,
    is_time:    ex.is_time ?? false,
  }))
}

// Shared by run/bike/swim — all three store their interval breakdown as the
// same {name, distance, reps} shape, just in their own sport-specific
// column (see IntervalExercise in backend/models.py), since a workout is
// only ever one sport at a time.
function initDistanceExercises(exercises) {
  if (!exercises || !exercises.length) return []
  return exercises.map(ex => ({
    name:     ex.name ?? '',
    distance: ex.distance ?? '',
    reps:     ex.reps ?? '',
  }))
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
      period_plan:        'build-3',
      is_brick:           workout.is_brick ?? false,
      gym_exercises:      initExercises(workout.gym_exercises),
      // Only one of these three is ever populated for a given workout (its
      // sport picks which), so whichever isn't null/undefined is the one to
      // seed the shared editable list with.
      distance_exercises: initDistanceExercises(workout.run_exercises ?? workout.bike_exercises ?? workout.swim_exercises),
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
    period_plan:      'build-3',
    is_brick:         false,
    gym_exercises:    [],
    distance_exercises: [],
  }
}

// Drops rows the user never filled in at all, and coerces sets/reps/weight
// to numbers (or null) for the API. Weight is meaningless (and cleared in
// the UI) once Bodyweight is checked, so it's forced to null here too.
function buildGymExercises(rows) {
  return rows
    .filter(ex => ex.name.trim() || ex.sets !== '' || ex.reps !== '' || ex.weight !== '' || ex.bodyweight)
    .map(ex => ({
      name:       ex.name.trim(),
      sets:       ex.sets !== '' ? parseInt(ex.sets, 10) : null,
      reps:       ex.is_time ? parseRepsTime(ex.reps) : (ex.reps !== '' ? parseInt(ex.reps, 10) : null),
      weight:     !ex.bodyweight && ex.weight !== '' ? parseInt(ex.weight, 10) : null,
      bodyweight: ex.bodyweight,
      is_time:    ex.is_time,
    }))
}

// Mirrors buildGymExercises above: drops fully-empty rows, coerces
// distance/reps to numbers (or null) for the API.
function buildDistanceExercises(rows) {
  return rows
    .filter(ex => ex.name.trim() || ex.distance !== '' || ex.reps !== '')
    .map(ex => ({
      name:     ex.name.trim(),
      distance: ex.distance !== '' ? parseFloat(ex.distance) : null,
      reps:     ex.reps !== '' ? parseInt(ex.reps, 10) : null,
    }))
}

export default function WorkoutModal({ workout, initialDate, onClose, onSaved, onDeleted }) {
  const isEdit = Boolean(workout)
  const [form, setForm] = useState(() => initForm(workout, initialDate))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  const [draggedExerciseIndex, setDraggedExerciseIndex] = useState(null)
  const [draggedDistanceExerciseIndex, setDraggedDistanceExerciseIndex] = useState(null)

  const isNote = form.sport === 'note'
  const isEvent = form.sport === 'event'
  const isNoteLike = isNote || isEvent
  const isStrength = form.sport === 'strength'
  const isRun = form.sport === 'run'
  const isBike = form.sport === 'bike'
  const isSwim = form.sport === 'swim'
  // Run/Bike/Swim all get the same interval-breakdown "Exercises" table —
  // see IntervalExercise in backend/models.py — just stored in their own
  // sport-specific column.
  const isDistanceExercisesSport = isRun || isBike || isSwim
  const isPeriod = form.sport === 'period'
  // Swim and Bike are the two disciplines a brick transitions out of
  // (mirroring triathlon's T1/T2) — see DayColumn's BRICK_NEXT_SPORT.
  const isBrickable = form.sport === 'swim' || form.sport === 'bike'
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

  function addExercise() {
    setForm(f => ({ ...f, gym_exercises: [...f.gym_exercises, { ...EMPTY_EXERCISE }] }))
  }

  function setExercise(index, field, value) {
    setForm(f => {
      const rows = [...f.gym_exercises]
      rows[index] = { ...rows[index], [field]: value }
      return { ...f, gym_exercises: rows }
    })
  }

  // Weight is digits-only, capped at 3 of them (so max 999kg) — stripped
  // here rather than relying on <input type="number">, whose built-in
  // filtering still lets through things like "e" (scientific notation).
  function setExerciseWeight(index, value) {
    setExercise(index, 'weight', value.replace(/\D/g, '').slice(0, 3))
  }

  // Grows the Activity textarea to fit its wrapped content, so long
  // exercise names wrap instead of scrolling, without affecting the
  // fixed-width sets/reps/weight columns in the same row.
  function autoResizeTextarea(el) {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  // Bodyweight and a numeric added weight are mutually exclusive, so
  // checking the box clears whatever was typed in the weight field.
  function toggleExerciseBodyweight(index, checked) {
    setForm(f => {
      const rows = [...f.gym_exercises]
      rows[index] = { ...rows[index], bodyweight: checked, weight: checked ? '' : rows[index].weight }
      return { ...f, gym_exercises: rows }
    })
  }

  // The Reps box means two different things either side of this checkbox, so
  // flipping it converts what's already typed rather than leaving a number to
  // be silently reread: checking it treats a bare count as that many minutes,
  // unchecking it keeps only the minutes.
  function toggleExerciseTime(index, checked) {
    setForm(f => {
      const rows = [...f.gym_exercises]
      const current = String(rows[index].reps)
      const reps = checked ? normalizeRepsTime(current) : current.split(':')[0]
      rows[index] = { ...rows[index], is_time: checked, reps }
      return { ...f, gym_exercises: rows }
    })
  }

  function removeExercise(index) {
    setForm(f => ({ ...f, gym_exercises: f.gym_exercises.filter((_, i) => i !== index) }))
  }

  // Drag handle only (not the whole row) is draggable — the row itself is
  // full of text inputs, and marking it draggable too would fight with
  // clicking/selecting text inside them.
  function handleExerciseDragStart(e, index) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    setDraggedExerciseIndex(index)
  }

  // Reorders live as the drag passes over another row — rather than just
  // marking a drop target and waiting for the drop to move anything, the
  // dragged exercise swaps into whatever row it's currently over right
  // away, and every row between its old and new spot shifts to make room,
  // so the list itself visibly makes way for it as it moves.
  function handleExerciseDragOver(e, index) {
    e.preventDefault() // required to allow a drop
    if (draggedExerciseIndex === null || draggedExerciseIndex === index) return
    setForm(f => {
      const rows = [...f.gym_exercises]
      const [moved] = rows.splice(draggedExerciseIndex, 1)
      rows.splice(index, 0, moved)
      return { ...f, gym_exercises: rows }
    })
    setDraggedExerciseIndex(index)
  }

  function handleExerciseDrop(e) {
    e.preventDefault() // the reorder already happened live in dragover — this just accepts the drop
  }

  function handleExerciseDragEnd() {
    setDraggedExerciseIndex(null)
  }

  function addDistanceExercise() {
    setForm(f => ({ ...f, distance_exercises: [...f.distance_exercises, { ...EMPTY_DISTANCE_EXERCISE }] }))
  }

  function setDistanceExercise(index, field, value) {
    setForm(f => {
      const rows = [...f.distance_exercises]
      rows[index] = { ...rows[index], [field]: value }
      return { ...f, distance_exercises: rows }
    })
  }

  function removeDistanceExercise(index) {
    setForm(f => ({ ...f, distance_exercises: f.distance_exercises.filter((_, i) => i !== index) }))
  }

  function handleDistanceExerciseDragStart(e, index) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
    setDraggedDistanceExerciseIndex(index)
  }

  function handleDistanceExerciseDragOver(e, index) {
    e.preventDefault() // required to allow a drop
    if (draggedDistanceExerciseIndex === null || draggedDistanceExerciseIndex === index) return
    setForm(f => {
      const rows = [...f.distance_exercises]
      const [moved] = rows.splice(draggedDistanceExerciseIndex, 1)
      rows.splice(index, 0, moved)
      return { ...f, distance_exercises: rows }
    })
    setDraggedDistanceExerciseIndex(index)
  }

  function handleDistanceExerciseDrop(e) {
    e.preventDefault() // the reorder already happened live in dragover — this just accepts the drop
  }

  function handleDistanceExerciseDragEnd() {
    setDraggedDistanceExerciseIndex(null)
  }

  function validateDuration(str) {
    if (!str) return null
    const parsed = parseDuration(str)
    if (parsed === null) return 'Use h:mm'
    if (parsed > MAX_DURATION_MINUTES) return 'Max 100h'
    return null
  }

  // The distance inputs are type="number" min="0", but the form is
  // noValidate (so the shorthand-duration/date-picker fields aren't fought
  // by the browser's own validation UI) — which also switches off min="0"
  // enforcement, so both bounds have to be checked here instead.
  function validateDistance(str) {
    if (str === '') return null
    const v = parseFloat(str)
    if (isNaN(v) || v < 0) return 'Can’t be negative'
    if (v > MAX_DISTANCE_KM) return 'Max 500km'
    return null
  }

  function validate(values) {
    const errs = {}
    if (!values.date)  errs.date  = 'Required'
    if (!isPeriod && !values.name.trim()) errs.name = 'Required'
    if (!isNoteLike && !isPeriod) {
      const plannedDurationErr = validateDuration(values.planned_duration)
      if (plannedDurationErr) errs.planned_duration = plannedDurationErr
      const actualDurationErr = validateDuration(values.actual_duration)
      if (actualDurationErr) errs.actual_duration = actualDurationErr
      if (!isStrength) {
        const plannedDistanceErr = validateDistance(values.planned_distance)
        if (plannedDistanceErr) errs.planned_distance = plannedDistanceErr
        const actualDistanceErr = validateDistance(values.actual_distance)
        if (actualDistanceErr) errs.actual_distance = actualDistanceErr
      }
    }
    return errs
  }

  async function handleSave(e) {
    e.preventDefault()

    // Period never persists as its own workout — it's a generator that
    // fans out into a run of plain 'note' workouts (one per build week,
    // plus a trailing rest week — skipped for a taper, which is just the
    // build weeks with no rest week after) and then closes, so it skips
    // the normal validate/payload path entirely.
    if (isPeriod) {
      if (!form.date) { setErrors({ date: 'Required' }); return }

      const [planKind, weekCountStr] = form.period_plan.split('-')
      const isTaper = planKind === 'taper'
      const buildWeeks = parseInt(weekCountStr, 10)
      const label = isTaper ? 'Taper' : 'Period'
      const baseDate = new Date(form.date + 'T00:00:00')
      const notes = Array.from({ length: buildWeeks }, (_, i) => ({
        date: toYMD(addWeeks(baseDate, i)),
        name: `${label} Week ${i + 1}`,
      }))
      if (!isTaper) {
        notes.push({ date: toYMD(addWeeks(baseDate, buildWeeks)), name: 'Rest Week' })
      }

      setSaving(true)
      setSubmitError(null)
      try {
        await Promise.all(notes.map(n => api.create({
          date:                     n.date,
          sport:                    'note',
          name:                     n.name,
          description:              null,
          planned_duration_minutes: null,
          planned_distance_km:      null,
          actual_duration_minutes:  null,
          actual_distance_km:       null,
        })))
        onSaved()
      } catch (err) {
        setSubmitError(err.message)
      } finally {
        setSaving(false)
      }
      return
    }

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
      planned_distance_km:     isNoteLike || isStrength ? null : (values.planned_distance !== '' ? parseFloat(values.planned_distance) : null),
      actual_duration_minutes:  isNoteLike ? null : parseDuration(values.actual_duration),
      actual_distance_km:      isNoteLike || isStrength ? null : (values.actual_distance !== '' ? parseFloat(values.actual_distance) : null),
      is_brick:                isBrickable ? values.is_brick : false,
      gym_exercises:            isStrength ? buildGymExercises(values.gym_exercises) : null,
      run_exercises:            isRun  ? buildDistanceExercises(values.distance_exercises) : null,
      bike_exercises:           isBike ? buildDistanceExercises(values.distance_exercises) : null,
      swim_exercises:           isSwim ? buildDistanceExercises(values.distance_exercises) : null,
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

  // Duplicates the workout being edited onto the same day, carrying over
  // whatever's currently in the form (so an in-progress edit gets copied too)
  // except the Actual side, which starts blank on the copy — a copy is a new
  // plan, not a record of what already happened. The original is untouched;
  // this only creates a new one alongside it.
  async function handleCopy() {
    const values = {
      ...form,
      planned_duration: expandDurationShorthand(form.planned_duration),
    }
    const errs = validate(values)
    if (Object.keys(errs).length) { setErrors(errs); return }

    const payload = {
      date:                     values.date,
      sport:                    values.sport,
      name:                     values.name.trim(),
      description:              values.description.trim() || null,
      planned_duration_minutes: isNoteLike ? null : parseDuration(values.planned_duration),
      planned_distance_km:      isNoteLike || isStrength ? null : (values.planned_distance !== '' ? parseFloat(values.planned_distance) : null),
      actual_duration_minutes:  null,
      actual_distance_km:       null,
      is_brick:                 isBrickable ? values.is_brick : false,
      gym_exercises:            isStrength ? buildGymExercises(values.gym_exercises) : null,
      run_exercises:            isRun  ? buildDistanceExercises(values.distance_exercises) : null,
      bike_exercises:           isBike ? buildDistanceExercises(values.distance_exercises) : null,
      swim_exercises:           isSwim ? buildDistanceExercises(values.distance_exercises) : null,
    }

    setCopying(true)
    setSubmitError(null)
    try {
      await api.create(payload)
      onSaved()
    } catch (err) {
      setSubmitError(err.message)
    } finally {
      setCopying(false)
    }
  }

  async function handleDelete() {
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

  const typeLabel = isEvent ? 'Event' : isNote ? 'Note' : isPeriod ? 'Period' : 'Workout'
  const modalTitle = `${isEdit ? 'View' : 'Add'} ${typeLabel}`

  // Period fans out into separate note workouts rather than persisting as
  // its own entity (see handleSave), so editing an existing workout can't
  // sensibly be turned into one — offer it only when adding fresh.
  const sportOptions = SPORTS.filter(s => s !== 'period' || !isEdit)

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
              {sportOptions.map(s => (
                <option key={s} value={s}>{SPORT_LABELS[s] ?? (s.charAt(0).toUpperCase() + s.slice(1))}</option>
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

          {!isPeriod && (
            <div className="form-row">
              <label className="form-label">Title</label>
              <input
                type="text"
                className={`form-input${errors.name ? ' form-input--error' : ''}`}
                placeholder={isEvent ? 'e.g. Race Day' : isNote ? 'e.g. Rest day' : 'e.g. Easy Spin'}
                value={form.name}
                onChange={e => set('name', e.target.value)}
              />
              {errors.name && <span className="form-error">{errors.name}</span>}
            </div>
          )}

          {!isPeriod && (
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
          )}

          {isStrength && (
            <div className="form-row">
              <label className="form-label">Exercises</label>
              <div className="gym-exercises">
                <div className="gym-exercises__scroll">
                  <table className="gym-exercises__table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Activity</th>
                        <th>Sets</th>
                        <th>Reps</th>
                        <th>Weight</th>
                        <th className="gym-exercises__th--center">Time</th>
                        <th className="gym-exercises__th--center">Bodyweight</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.gym_exercises.map((ex, i) => (
                        <tr
                          key={i}
                          className={draggedExerciseIndex === i ? 'gym-exercises__row--dragging' : ''}
                          onDragOver={e => handleExerciseDragOver(e, i)}
                          onDrop={handleExerciseDrop}
                        >
                          <td className="gym-exercises__td--center">
                            <span
                              className="gym-exercises__drag-handle"
                              draggable
                              onDragStart={e => handleExerciseDragStart(e, i)}
                              onDragEnd={handleExerciseDragEnd}
                              aria-label="Drag to reorder"
                              title="Drag to reorder"
                            >
                              <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
                                <circle cx="3" cy="3" r="1.3" fill="currentColor" />
                                <circle cx="7" cy="3" r="1.3" fill="currentColor" />
                                <circle cx="3" cy="8" r="1.3" fill="currentColor" />
                                <circle cx="7" cy="8" r="1.3" fill="currentColor" />
                                <circle cx="3" cy="13" r="1.3" fill="currentColor" />
                                <circle cx="7" cy="13" r="1.3" fill="currentColor" />
                              </svg>
                            </span>
                          </td>
                          <td className="gym-exercises__td--name">
                            <textarea
                              rows={1}
                              className="form-input gym-exercises__input gym-exercises__input--name"
                              placeholder="e.g. Bench Press"
                              value={ex.name}
                              ref={autoResizeTextarea}
                              onChange={e => { setExercise(i, 'name', e.target.value); autoResizeTextarea(e.target) }}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              className="form-input gym-exercises__input gym-exercises__input--num"
                              value={ex.sets}
                              onChange={e => setExercise(i, 'sets', e.target.value)}
                            />
                          </td>
                          <td>
                            {ex.is_time ? (
                              <div className="gym-exercises__reps-cell">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  className="form-input gym-exercises__input gym-exercises__input--time"
                                  placeholder="m:ss"
                                  value={ex.reps}
                                  onChange={e => setExercise(i, 'reps', sanitizeRepsTime(e.target.value))}
                                  onBlur={e => setExercise(i, 'reps', normalizeRepsTime(e.target.value))}
                                />
                                <span className="gym-exercises__reps-unit">{repsTimeUnit(parseRepsTime(ex.reps))}</span>
                              </div>
                            ) : (
                              <input
                                type="number"
                                min="0"
                                className="form-input gym-exercises__input gym-exercises__input--num"
                                value={ex.reps}
                                onChange={e => setExercise(i, 'reps', e.target.value)}
                              />
                            )}
                          </td>
                          <td>
                            {!ex.bodyweight && (
                              <div className="gym-exercises__weight-cell">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  maxLength={3}
                                  className="form-input gym-exercises__input gym-exercises__input--weight"
                                  value={ex.weight}
                                  onChange={e => setExerciseWeight(i, e.target.value)}
                                />
                                <span className="gym-exercises__weight-unit">kg</span>
                              </div>
                            )}
                          </td>
                          <td className="gym-exercises__td--center">
                            <input
                              type="checkbox"
                              className="gym-exercises__time-checkbox"
                              checked={ex.is_time}
                              onChange={e => toggleExerciseTime(i, e.target.checked)}
                            />
                          </td>
                          <td className="gym-exercises__td--center">
                            <input
                              type="checkbox"
                              className="gym-exercises__bodyweight-checkbox"
                              checked={ex.bodyweight}
                              onChange={e => toggleExerciseBodyweight(i, e.target.checked)}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="gym-exercises__remove"
                              onClick={() => removeExercise(i)}
                              aria-label="Remove exercise"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn btn--secondary gym-exercises__add" onClick={addExercise}>
                  + Add Exercise
                </button>
              </div>
            </div>
          )}

          {isDistanceExercisesSport && (
            <div className="form-row">
              <label className="form-label">Exercises</label>
              <div className="gym-exercises">
                <div className="gym-exercises__scroll">
                  <table className="gym-exercises__table">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Activity</th>
                        <th>Distance</th>
                        <th>Reps</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.distance_exercises.map((ex, i) => (
                        <tr
                          key={i}
                          className={draggedDistanceExerciseIndex === i ? 'gym-exercises__row--dragging' : ''}
                          onDragOver={e => handleDistanceExerciseDragOver(e, i)}
                          onDrop={handleDistanceExerciseDrop}
                        >
                          <td className="gym-exercises__td--center">
                            <span
                              className="gym-exercises__drag-handle"
                              draggable
                              onDragStart={e => handleDistanceExerciseDragStart(e, i)}
                              onDragEnd={handleDistanceExerciseDragEnd}
                              aria-label="Drag to reorder"
                              title="Drag to reorder"
                            >
                              <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
                                <circle cx="3" cy="3" r="1.3" fill="currentColor" />
                                <circle cx="7" cy="3" r="1.3" fill="currentColor" />
                                <circle cx="3" cy="8" r="1.3" fill="currentColor" />
                                <circle cx="7" cy="8" r="1.3" fill="currentColor" />
                                <circle cx="3" cy="13" r="1.3" fill="currentColor" />
                                <circle cx="7" cy="13" r="1.3" fill="currentColor" />
                              </svg>
                            </span>
                          </td>
                          <td className="gym-exercises__td--name">
                            <textarea
                              rows={1}
                              className="form-input gym-exercises__input gym-exercises__input--name"
                              placeholder="e.g. Strides"
                              value={ex.name}
                              ref={autoResizeTextarea}
                              onChange={e => { setDistanceExercise(i, 'name', e.target.value); autoResizeTextarea(e.target) }}
                            />
                          </td>
                          <td>
                            <div className="gym-exercises__weight-cell">
                              <input
                                type="number"
                                min="0"
                                step="0.1"
                                className="form-input gym-exercises__input gym-exercises__input--distance"
                                value={ex.distance}
                                onChange={e => setDistanceExercise(i, 'distance', e.target.value)}
                              />
                              <span className="gym-exercises__weight-unit">{distanceExerciseUnit(ex.distance)}</span>
                            </div>
                          </td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              className="form-input gym-exercises__input gym-exercises__input--num"
                              value={ex.reps}
                              onChange={e => setDistanceExercise(i, 'reps', e.target.value)}
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="gym-exercises__remove"
                              onClick={() => removeDistanceExercise(i)}
                              aria-label="Remove exercise"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button type="button" className="btn btn--secondary gym-exercises__add" onClick={addDistanceExercise}>
                  + Add Exercise
                </button>
              </div>
            </div>
          )}

          {isPeriod && (
            <div className="form-row">
              <label className="form-label">Period Length</label>
              <select
                className="form-select"
                value={form.period_plan}
                onChange={e => set('period_plan', e.target.value)}
              >
                <option value="build-3">Three Week Build, One Week Rest</option>
                <option value="build-4">Four Week Build, One Week Rest</option>
                <option value="taper-3">Three Week Taper</option>
                <option value="taper-4">Four Week Taper</option>
              </select>
            </div>
          )}

          {!isNoteLike && !isPeriod && (
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
                {!isStrength && (
                  <div className="form-field">
                    <label className="form-label">Distance (km)</label>
                    <input
                      type="number"
                      className={`form-input${errors.planned_distance ? ' form-input--error' : ''}`}
                      placeholder="0.0"
                      min="0"
                      max={MAX_DISTANCE_KM}
                      step="0.1"
                      value={form.planned_distance}
                      onChange={e => set('planned_distance', e.target.value)}
                    />
                    {errors.planned_distance && <span className="form-error">{errors.planned_distance}</span>}
                  </div>
                )}
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
                {!isStrength && (
                  <div className="form-field">
                    <label className="form-label">Distance (km)</label>
                    <input
                      type="number"
                      className={`form-input${errors.actual_distance ? ' form-input--error' : ''}`}
                      placeholder="0.0"
                      min="0"
                      max={MAX_DISTANCE_KM}
                      step="0.1"
                      value={form.actual_distance}
                      onChange={e => set('actual_distance', e.target.value)}
                    />
                    {errors.actual_distance && <span className="form-error">{errors.actual_distance}</span>}
                  </div>
                )}
              </div>

              {(isRun || isBike) && (() => {
                // Cycling is normally read as speed, running as pace — same
                // duration/distance inputs, just a different unit.
                const paceLabel = isBike ? 'Speed' : 'Pace'
                const formatPaceOrSpeed = isBike ? formatSpeed : formatPace
                const splits = isBike ? workout?.bike_splits : workout?.run_splits
                return (
                  <>
                    <div className="form-row form-row--inline">
                      <div className="form-field">
                        <label className="form-label">{paceLabel}</label>
                        <input
                          type="text"
                          className="form-input"
                          value={formatPaceOrSpeed(parseDuration(form.actual_duration), parseFloat(form.actual_distance))}
                          disabled
                        />
                      </div>
                      <div className="form-field">
                        <label className="form-label">Elevation Gain</label>
                        <input
                          type="text"
                          className="form-input"
                          value={formatElevation(workout?.elevation_gain_m)}
                          disabled
                        />
                      </div>
                    </div>

                    {splits?.length > 0 && (
                      <div className="form-row">
                        <label className="form-label">Splits</label>
                        <div className="run-splits">
                          <table className="run-splits__table">
                            <thead>
                              <tr>
                                <th>Km</th>
                                <th>{paceLabel}</th>
                                <th>Elev</th>
                              </tr>
                            </thead>
                            <tbody>
                              {splits.map((split, i) => {
                                const elev = elevationParts(split.elevation_net_m)
                                return (
                                  <tr key={i}>
                                    <td>{splitKmLabel(split.distance_km, i)}</td>
                                    <td>{formatPaceOrSpeed(split.duration_s / 60, split.distance_km)}</td>
                                    <td>
                                      <span className="run-splits__elev">
                                        <span className="run-splits__elev-sign">{elev.sign}</span>
                                        <span className="run-splits__elev-value">{elev.value}</span>
                                        <span className="run-splits__elev-unit">{elev.unit}</span>
                                      </span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )
              })()}
            </>
          )}

          {isBrickable && (
            <div className="form-row form-checkbox-row">
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={form.is_brick}
                  onChange={e => set('is_brick', e.target.checked)}
                />
                Brick Workout
              </label>
            </div>
          )}

          {submitError && <div className="modal-submit-error">{submitError}</div>}

          <div className="modal-actions">
            {isEdit && (
              <div className="modal-actions__left">
                <button
                  type="button"
                  className="btn btn--danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
                {!isNoteLike && (
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={handleCopy}
                    disabled={copying}
                  >
                    {copying ? 'Copying…' : 'Copy'}
                  </button>
                )}
              </div>
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
