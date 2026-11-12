import { useState } from 'react'

const PHONE_DISPLAY = '+1 206 860 8292'
const PHONE_HREF = 'tel:+12068608292'

// The name in the middle of the page. Under a mouse it turns over to the phone
// number; on a touch screen the first tap turns it over and the second dials.
export function NameFlip() {
  const [flipped, setFlipped] = useState(false)

  return (
    <a
      href={PHONE_HREF}
      aria-label={`Kevin Traywick — phone ${PHONE_DISPLAY}`}
      className="name-flip font-instrument block text-black no-underline outline-none"
      onPointerEnter={e => { if (e.pointerType === 'mouse') setFlipped(true) }}
      onPointerLeave={e => { if (e.pointerType === 'mouse') setFlipped(false) }}
      onFocus={() => setFlipped(true)}
      onBlur={() => setFlipped(false)}
      onClick={e => {
        if (!flipped) {
          e.preventDefault()
          setFlipped(true)
        }
      }}
    >
      <span className="name-flip-card" data-flipped={flipped}>
        <span className="name-flip-face" aria-hidden={flipped}>Kevin Traywick</span>
        <span className="name-flip-face name-flip-back" aria-hidden={!flipped}>{PHONE_DISPLAY}</span>
      </span>
    </a>
  )
}
