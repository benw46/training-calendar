import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { STATUS_BAR_COLOR } from '../utils/workouts'

const ROWS = [
  { status: 'done',      label: 'Done',      text: '≥80% of planned completed.' },
  { status: 'partial',   label: 'Partial',   text: 'Some of planned completed (≤80%).' },
  { status: 'missed',    label: 'Missed',    text: 'Nothing logged, plan not met.' },
  { status: 'unplanned', label: 'Unplanned', text: 'Imported from Garmin, no plan existed.' },
  { status: 'future',    label: 'Future',    text: "Hasn't happened yet." },
]

const POPOVER_WIDTH = 350
const VIEWPORT_MARGIN = 12 // px kept clear on each side so the popover never runs off-screen

export default function ColorLegend() {
  const [pos, setPos] = useState(null) // { top, left, width } in viewport (fixed-position) coordinates; null = closed
  const triggerRef = useRef(null)
  const closeTimer = useRef(null)

  function open() {
    clearTimeout(closeTimer.current)
    const rect = triggerRef.current.getBoundingClientRect()
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
    // Right-edge-aligned with the icon by default (matches the old
    // absolute-positioned layout), clamped so it can't run off either edge
    // of the viewport — this is the fixed-position equivalent of the
    // narrow-screen width/centering override that used to live in a media
    // query, now needed at any width since the popover no longer inherits
    // its position from a CSS-positioned ancestor.
    const left = Math.min(
      Math.max(rect.right - width, VIEWPORT_MARGIN),
      window.innerWidth - width - VIEWPORT_MARGIN
    )
    setPos({ top: rect.bottom + 8, left, width })
  }

  // A short delay (rather than closing immediately) survives the moment the
  // pointer is between the icon and the portaled popover — they're no
  // longer DOM ancestor/descendant once portaled, so a single :hover-style
  // rule can't cover both; this re-implements "stays open while hovering
  // either" with a grace period instead. Cancelled by either element's own
  // open() call if the pointer/focus lands back before it fires.
  function scheduleClose() {
    closeTimer.current = setTimeout(() => setPos(null), 150)
  }

  return (
    <div className="color-legend-group">
      <button
        type="button"
        className="color-legend-group__reload"
        aria-label="Reload page"
        title="Reload page"
        onClick={() => window.location.reload()}
      >
        {/* Arc traces the same r=8 circle as .color-legend__icon's ⓘ below,
            so the two read as the same diameter instead of relying on
            matching font metrics across two different glyphs. */}
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
          <path
            d="M 15.14 3.87 A 8 8 0 1 1 4.86 3.87"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          {/* Open chevron, same stroke weight as the arc, so the
              arrowhead reads as a continuation of the line rather than
              a separate filled shape sitting on top of it. */}
          <path
            d="M 5.20 5.65 L 6.25 3.07 L 3.49 2.70"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div
        className="color-legend"
        tabIndex={0}
        ref={triggerRef}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
        onFocus={open}
        onBlur={scheduleClose}
      >
        <span className="color-legend__icon" aria-label="Workout color legend">
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
            <circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="10" cy="6.3" r="1" fill="currentColor" />
            <line x1="10" y1="9.2" x2="10" y2="14.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        {pos && createPortal(
        <div
          className="color-legend__popover"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
          onMouseEnter={open}
          onMouseLeave={scheduleClose}
        >
          <div className="color-legend__section-title">Inputting a number into a duration field:</div>
          <ul className="color-legend__list">
            <li>A number 1–10 is read as hours (e.g. 2 → 2:00).</li>
            <li>11–1000 is read as minutes (e.g. 90 → 1:30).</li>
            <li>Or you can directly input in the format h:mm.</li>
          </ul>

          <div className="color-legend__divider" />

          <div className="color-legend__section-title">Activity Card Colours</div>
          {ROWS.map(({ status, label, text }) => (
            <div key={status} className="color-legend__row">
              <span
                className={`color-legend__dot${status === 'future' ? ' color-legend__dot--outline' : ''}`}
                style={{ background: STATUS_BAR_COLOR[status] }}
              />
              <span className="color-legend__label">{label}</span>
              <span className="color-legend__text">{text}</span>
            </div>
          ))}

          <div className="color-legend__divider" />

          <p className="color-legend__credit">
            This Application has been written by Benjamin Watts with the assistance of Claude Code.
          </p>
        </div>,
        document.body
      )}
      </div>
    </div>
  )
}
