const COLORS = {
  swim:     '#0ea5e9',
  bike:     '#8b5cf6',
  run:      '#22c55e',
  strength: '#f97316',
  other:    '#6b7280',
}

function SwimIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M1 5.5 Q3 3 5.5 5.5 Q8 8 10.5 5.5 Q13 3 15 5.5"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M1 9.5 Q3 7 5.5 9.5 Q8 12 10.5 9.5 Q13 7 15 9.5"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function BikeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="3.5" cy="11.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="12.5" cy="11.5" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3.5 11.5 L8 5.5 L12.5 11.5 M8 5.5 L10 3.5 L12 3.5"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function RunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="10" cy="2.5" r="1.5" fill="currentColor"/>
      <path d="M9 4.5 L7 8 L4 10.5 M9 4.5 L11.5 7.5 L14 8.5 M7 8 L8 12 L6 15 M9 9 L10 13 L12 15"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function StrengthIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="0.5" y="5.5" width="3" height="5" rx="1" fill="currentColor"/>
      <rect x="12.5" y="5.5" width="3" height="5" rx="1" fill="currentColor"/>
      <rect x="3.5" y="7" width="9" height="2" rx="0.5" fill="currentColor"/>
    </svg>
  )
}

function OtherIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M9 1.5 L4 8.5 H7.5 L7 14.5 L12 7.5 H8.5 Z" fill="currentColor"/>
    </svg>
  )
}

const ICONS = { swim: SwimIcon, bike: BikeIcon, run: RunIcon, strength: StrengthIcon, other: OtherIcon }

export default function SportIcon({ sport }) {
  const Icon = ICONS[sport] ?? OtherIcon
  return (
    <span className="sport-icon" style={{ color: COLORS[sport] ?? COLORS.other }}>
      <Icon />
    </span>
  )
}
