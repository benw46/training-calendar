import { STATUS_BAR_COLOR } from '../utils/workouts'

const ROWS = [
  { status: 'done',      label: 'Done',      text: '≥80% of planned completed.' },
  { status: 'partial',   label: 'Partial',   text: 'Some of planned completed (≤80%).' },
  { status: 'missed',    label: 'Missed',    text: 'Nothing logged, plan not met.' },
  { status: 'unplanned', label: 'Unplanned', text: 'Imported from Garmin, no plan existed.' },
  { status: 'future',    label: 'Future',    text: "Hasn't happened yet." },
]

export default function ColorLegend() {
  return (
    <div className="color-legend" tabIndex={0}>
      <span className="color-legend__icon" aria-label="Workout color legend">ⓘ</span>
      <div className="color-legend__popover">
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
      </div>
    </div>
  )
}
