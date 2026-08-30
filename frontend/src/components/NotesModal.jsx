import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api/workouts'

// How long to wait after the last keystroke before saving content to the
// backend — short enough that a tab switch or close (both of which flush
// immediately, see below) rarely races it, long enough not to fire on every
// keystroke.
const SAVE_DEBOUNCE_MS = 800

export default function NotesModal({ onClose }) {
  const [notes, setNotes] = useState(null) // null while loading
  const [activeId, setActiveId] = useState(null)
  const [error, setError] = useState(null)
  const [renamingId, setRenamingId] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)
  const [draggedId, setDraggedId] = useState(null)
  const close = useCallback(onClose, [onClose])

  const saveTimerRef = useRef(null)
  const pendingContentRef = useRef(null) // { id, content } not yet flushed to the API

  useEffect(() => {
    api.getNotes()
      .then(list => {
        setNotes(list)
        if (list.length > 0) setActiveId(list[0].id)
      })
      .catch(err => setError(err.message))
  }, [])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  function flushPendingSave() {
    clearTimeout(saveTimerRef.current)
    const pending = pendingContentRef.current
    if (!pending) return
    pendingContentRef.current = null
    api.updateNote(pending.id, { content: pending.content }).catch(err => setError(err.message))
  }

  // Flush any unsaved content on unmount (e.g. closing the modal mid-edit)
  // rather than losing the last debounce window's keystrokes.
  useEffect(() => () => flushPendingSave(), [])

  function handleAddNote() {
    api.createNote({ title: 'Untitled' })
      .then(note => {
        setNotes(list => [...list, note])
        setActiveId(note.id)
      })
      .catch(err => setError(err.message))
  }

  function handleContentChange(id, content) {
    setNotes(list => list.map(n => (n.id === id ? { ...n, content } : n)))
    pendingContentRef.current = { id, content }
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS)
  }

  function handleSwitchTab(id) {
    flushPendingSave()
    setActiveId(id)
  }

  function startRename(note) {
    setRenamingId(note.id)
    setRenameDraft(note.title)
  }

  function commitRename() {
    const id = renamingId
    const title = renameDraft.trim() || 'Untitled'
    setRenamingId(null)
    setNotes(list => list.map(n => (n.id === id ? { ...n, title } : n)))
    api.updateNote(id, { title }).catch(err => setError(err.message))
  }

  function handleDelete(id) {
    setConfirmDeleteId(null)
    api.deleteNote(id)
      .then(() => {
        setNotes(list => {
          const next = list.filter(n => n.id !== id)
          if (activeId === id) setActiveId(next.length > 0 ? next[0].id : null)
          return next
        })
      })
      .catch(err => setError(err.message))
  }

  // Live reordering as the dragged tab passes over another, mirroring the
  // race-bests drag pattern in GraphsModal — the order updates as you drag,
  // then persists once on drop.
  function handleDragOver(overId) {
    if (draggedId === null || draggedId === overId) return
    setNotes(list => {
      const fromIndex = list.findIndex(n => n.id === draggedId)
      const toIndex = list.findIndex(n => n.id === overId)
      if (fromIndex === -1 || toIndex === -1) return list
      const next = [...list]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  function handleDragEnd() {
    setDraggedId(null)
    if (notes) {
      api.reorderNotes(notes.map(n => n.id)).catch(err => setError(err.message))
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget) close()
  }

  const activeNote = notes?.find(n => n.id === activeId) ?? null

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal modal--wide notes-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">Notes</h2>
          <button className="modal-close" onClick={close} aria-label="Close">✕</button>
        </div>

        {error && <div className="modal-submit-error">Couldn't load notes — {error}</div>}

        {!error && !notes && <div className="graph-loading">Loading…</div>}

        {notes && (
          <>
            <div className="notes-tabbar">
              {notes.map(note => (
                <div
                  key={note.id}
                  className={`notes-tab${note.id === activeId ? ' notes-tab--active' : ''}${draggedId === note.id ? ' notes-tab--dragging' : ''}`}
                  draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggedId(note.id) }}
                  onDragOver={e => { e.preventDefault(); handleDragOver(note.id) }}
                  onDrop={e => e.preventDefault()}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleSwitchTab(note.id)}
                  onDoubleClick={() => startRename(note)}
                >
                  {renamingId === note.id ? (
                    <input
                      type="text"
                      className="notes-tab__rename-input"
                      value={renameDraft}
                      autoFocus
                      onChange={e => setRenameDraft(e.target.value)}
                      onBlur={commitRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setRenamingId(null)
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <span className="notes-tab__title">{note.title}</span>
                  )}
                  <span
                    className="notes-tab__close"
                    role="button"
                    aria-label={`Delete ${note.title}`}
                    onClick={e => { e.stopPropagation(); setConfirmDeleteId(note.id) }}
                  >
                    ✕
                  </span>
                </div>
              ))}
              <button type="button" className="notes-tab__add" onClick={handleAddNote} aria-label="Add note">
                +
              </button>
            </div>

            <div className="notes-body">
              {activeNote ? (
                <textarea
                  key={activeNote.id}
                  className="notes-textarea"
                  value={activeNote.content}
                  onChange={e => handleContentChange(activeNote.id, e.target.value)}
                  placeholder="Start typing…"
                  autoFocus
                />
              ) : (
                <div className="notes-empty">
                  <p>No notes yet.</p>
                  <button type="button" className="btn btn--secondary" onClick={handleAddNote}>
                    + Add a note
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {confirmDeleteId != null && (
          <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setConfirmDeleteId(null) }}>
            <div className="modal modal--confirm" role="alertdialog" aria-modal="true">
              <div className="modal-header">
                <h2 className="modal-title">Delete Note</h2>
                <button className="modal-close" onClick={() => setConfirmDeleteId(null)} aria-label="Close">✕</button>
              </div>
              <div className="modal-confirm-body">
                <p>
                  Delete "{notes.find(n => n.id === confirmDeleteId)?.title}"? This can't be undone.
                </p>
                <div className="modal-actions">
                  <div className="modal-actions__right">
                    <button type="button" className="btn btn--secondary" onClick={() => setConfirmDeleteId(null)}>
                      Cancel
                    </button>
                    <button type="button" className="btn btn--danger" onClick={() => handleDelete(confirmDeleteId)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
