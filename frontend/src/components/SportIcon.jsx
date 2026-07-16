import { SPORT_COLORS } from '../utils/workouts'

function SwimIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <path d="M1 5.5 Q3 3 5.5 5.5 Q8 8 10.5 5.5 Q13 3 15 5.5"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M1 9.5 Q3 7 5.5 9.5 Q8 12 10.5 9.5 Q13 7 15 9.5"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  )
}

function BikeIcon() {
  return (
    <svg width="22" height="22" viewBox="-1 -1 18 18" fill="none" strokeLinecap="round">
      {/* viewBox padded by 1 unit on every side (vs. the other icons' tight
          0 0 16 16) — the wheels' radius + stroke now extend fractionally
          past the original 16x16 box, which clipped them there. */}
      {/* Wheels — set further apart (a longer wheelbase) for the more
          stretched-out stance of a triathlon/TT bike vs. a compact road
          bike; same size and stroke as each other. */}
      <circle cx="2.8" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      <circle cx="13.2" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
      {/* Main frame */}
      <line x1="7.4" y1="12"  x2="5.7"  y2="8"   stroke="currentColor" strokeWidth="1.2"/>
      <line x1="5.7" y1="8"   x2="11.5" y2="7.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="7.4" y1="12"  x2="12"   y2="9"   stroke="currentColor" strokeWidth="1.2"/>
      <line x1="11.5" y1="7.5" x2="12"  y2="9"   stroke="currentColor" strokeWidth="1.7"/>
      {/* Rear triangle */}
      <line x1="7.4" y1="12" x2="2.8" y2="12" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="5.7" y1="8"  x2="2.8" y2="12" stroke="currentColor" strokeWidth="1.2"/>
      {/* Fork */}
      <line x1="12" y1="9" x2="13.2" y2="12" stroke="currentColor" strokeWidth="1.2"/>
      {/* Seat post + saddle — raised higher than the aero bar tip (y=5.2),
          the more aggressive saddle-above-bars position typical of a
          triathlon bike's aero fit */}
      <line x1="5.7" y1="8"   x2="5.7" y2="4.5" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="4.2" y1="4.5" x2="7.2" y2="4.5" stroke="currentColor" strokeWidth="1.5"/>
      {/* Stem + base bar */}
      <line x1="11.5" y1="7.5" x2="10.9" y2="5.8" stroke="currentColor" strokeWidth="1.1"/>
      <line x1="9.7"  y1="5.8" x2="12.6" y2="5.8" stroke="currentColor" strokeWidth="1.5"/>
      {/* Aero bar extension — the feature that reads as "triathlon/TT
          bike" rather than a standard road bike */}
      <line x1="11" y1="5.8" x2="14.9" y2="5.2" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}

function RunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 100 100" fill="none" strokeLinecap="round" strokeLinejoin="round">
      {/* Head */}
      <circle cx="58" cy="8" r="8" fill="currentColor"/>
      {/* Torso — separate from arms, slight forward lean */}
      <line x1="56" y1="19" x2="50" y2="52" stroke="currentColor" strokeWidth="8"/>
      {/* Forward arm — from shoulder, elbow drives forward, forearm angles back up */}
      <path d="M56 22 L70 32 L78 20" stroke="currentColor" strokeWidth="7"/>
      {/* Back arm — from shoulder, elbow swings back, forearm drops */}
      <path d="M56 22 L42 32 L34 44" stroke="currentColor" strokeWidth="7"/>
      {/* Leading leg — knee and foot drive forward */}
      <path d="M50 52 L64 68 L72 84" stroke="currentColor" strokeWidth="8"/>
      {/* Trailing leg — thigh swings back, heel kicks up behind */}
      <path d="M50 52 L36 70 L28 58" stroke="currentColor" strokeWidth="8"/>
    </svg>
  )
}

function StrengthIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      {/* Bar */}
      <rect x="4.2" y="7.3" width="7.6" height="1.4" fill="currentColor"/>
      {/* Left plates: small collar, medium, large (outside to inside) */}
      <rect x="0.4" y="6.3" width="0.9" height="3.4" rx="0.3" fill="currentColor"/>
      <rect x="1.3" y="4.6" width="1.2" height="6.8" rx="0.4" fill="currentColor"/>
      <rect x="2.5" y="3"   width="1.7" height="10"  rx="0.5" fill="currentColor"/>
      {/* Right plates: mirrored */}
      <rect x="11.8" y="3"   width="1.7" height="10"  rx="0.5" fill="currentColor"/>
      <rect x="13.5" y="4.6" width="1.2" height="6.8" rx="0.4" fill="currentColor"/>
      <rect x="14.7" y="6.3" width="0.9" height="3.4" rx="0.3" fill="currentColor"/>
    </svg>
  )
}

function OtherIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="5" cy="8" r="1.1" fill="currentColor"/>
      <circle cx="8" cy="8" r="1.1" fill="currentColor"/>
      <circle cx="11" cy="8" r="1.1" fill="currentColor"/>
    </svg>
  )
}

function NoteIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none" strokeLinecap="round">
      <path d="M3 2 L10.5 2 L13 4.5 L13 14 L3 14 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
      <path d="M10.5 2 L10.5 4.5 L13 4.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      <line x1="5" y1="7" x2="11" y2="7" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="5" y1="9.5" x2="11" y2="9.5" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="5" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  )
}

function EventIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
      <rect x="1"  y="8"  width="4" height="6" rx="0.5" fill="currentColor"/>
      <rect x="6"  y="5"  width="4" height="9" rx="0.5" fill="currentColor"/>
      <rect x="11" y="10" width="4" height="4" rx="0.5" fill="currentColor"/>
    </svg>
  )
}

const ICONS = { swim: SwimIcon, bike: BikeIcon, run: RunIcon, strength: StrengthIcon, other: OtherIcon, note: NoteIcon, event: EventIcon }

export default function SportIcon({ sport }) {
  const Icon = ICONS[sport] ?? OtherIcon
  return (
    <span className="sport-icon" style={{ color: SPORT_COLORS[sport] ?? SPORT_COLORS.other }}>
      <Icon />
    </span>
  )
}
