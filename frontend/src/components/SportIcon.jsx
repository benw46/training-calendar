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
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" strokeLinecap="round">
      {/* Wheels */}
      <circle cx="3.5" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="12.5" cy="12" r="2.4" stroke="currentColor" strokeWidth="1.3"/>
      {/* Main frame */}
      <line x1="7.5" y1="12"  x2="6"    y2="8"   stroke="currentColor" strokeWidth="1.2"/>
      <line x1="6"   y1="8"   x2="11"   y2="7.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="7.5" y1="12"  x2="11.5" y2="9"   stroke="currentColor" strokeWidth="1.2"/>
      <line x1="11"  y1="7.5" x2="11.5" y2="9"   stroke="currentColor" strokeWidth="1.7"/>
      {/* Rear triangle */}
      <line x1="7.5" y1="12" x2="3.5" y2="12" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="6"   y1="8"  x2="3.5" y2="12" stroke="currentColor" strokeWidth="1.2"/>
      {/* Fork */}
      <line x1="11.5" y1="9" x2="12.5" y2="12" stroke="currentColor" strokeWidth="1.2"/>
      {/* Seat post + saddle */}
      <line x1="6"   y1="8"   x2="6"   y2="7"   stroke="currentColor" strokeWidth="1.1"/>
      <line x1="4.5" y1="7"   x2="7.5" y2="7"   stroke="currentColor" strokeWidth="1.5"/>
      {/* Stem + handlebar */}
      <line x1="11"  y1="7.5" x2="10.5" y2="5.8" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="9.5" y1="5.8" x2="12"   y2="5.8" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}

function RunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* Head */}
      <circle cx="11" cy="2.5" r="1.5" fill="currentColor"/>
      {/* Torso (forward lean) */}
      <line x1="10.5" y1="4" x2="9" y2="9" stroke="currentColor" strokeWidth="1.4"/>
      {/* Forward arm: elbow forward, forearm bends up toward chin */}
      <path d="M10 5.5 L12.5 6 L12 4" stroke="currentColor" strokeWidth="1.2"/>
      {/* Back arm: elbow back, forearm bends downward */}
      <path d="M10 5.5 L7.5 6.5 L7 8.5" stroke="currentColor" strokeWidth="1.2"/>
      {/* Front leg: knee swings forward, foot hangs below knee */}
      <path d="M9 9 L11 11.5 L10 14" stroke="currentColor" strokeWidth="1.4"/>
      {/* Back leg: pushing off behind */}
      <path d="M9 9 L6 11 L4 13.5" stroke="currentColor" strokeWidth="1.4"/>
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
