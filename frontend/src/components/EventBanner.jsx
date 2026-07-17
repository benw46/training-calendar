import { useState, useEffect } from 'react'

const LINE_HEIGHT = 16 // px — must match .app-header__event-banner-line height in styles.css
const INTERVAL_MS = 6000

export default function EventBanner({ lines }) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
    if (lines.length <= 1) return
    const id = setInterval(() => {
      setIndex(i => (i + 1) % lines.length)
    }, INTERVAL_MS)
    return () => clearInterval(id)
  }, [lines])

  // The strip is stacked in reverse (last line physically on top) so that
  // translating it downward as `index` advances scrolls the current line
  // down and out of view while the next one scrolls down into place from
  // above it — a "scroll down" ticker rather than the more common scroll-up.
  const reversed = [...lines].reverse()
  const offset = (lines.length - 1 - index) * LINE_HEIGHT

  return (
    <span className="app-header__event-banner-wrap">
      <span className="app-header__event-banner">
        <span
          className="app-header__event-banner-strip"
          style={{ transform: `translateY(-${offset}px)` }}
        >
          {reversed.map((text, i) => (
            <span key={i} className="app-header__event-banner-line">{text}</span>
          ))}
        </span>
      </span>
    </span>
  )
}
