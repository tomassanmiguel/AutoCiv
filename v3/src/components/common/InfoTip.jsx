import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import IconText from './IconText.jsx'
import './InfoTip.css'

// Clearance from the anchor's edge. Also covers the on-tile card's hover-scale
// growth (it scales 1.42x from center, so its edge moves out ~14px) so the
// tooltip never ends up over the card.
const GAP = 16
const EST_W = 300 // ~tooltip max-width + margin, used only to decide the edge flip
// An INTERACTIVE tooltip must survive the cursor crossing the GAP between the
// anchor and the tooltip, so closing waits this long and any re-entry cancels it.
const CLOSE_DELAY = 160

/**
 * Wraps its children and shows a floating tooltip on hover. The tooltip is
 * `position: fixed` and PORTALED to <body> (so a transformed ancestor — e.g. the
 * hover-scaled on-tile card — can't become its containing block and mis-place it).
 *
 * It is anchored to the hovered element's BOUNDING BOX, not the cursor, and opens
 * just beside it (to the left, flipping right near the screen edge) so it never
 * covers the card/slot it describes.
 *
 * `interactive` makes the tooltip itself hoverable — pointer events on, and a
 * grace timer so travelling into it doesn't close it. That is what lets a
 * tooltip hold its own hover targets, e.g. the progress web's definition chips,
 * each of which is another InfoTip that portals out on top of this one.
 */
export default function InfoTip({ title, text, className = '', tipClassName = '', interactive = false, children, ...rest }) {
  const anchorRef = useRef(null)
  const [pos, setPos] = useState(null)
  const timerRef = useRef(null)

  const cancelClose = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }
  useEffect(() => cancelClose, [])

  const place = () => {
    const el = anchorRef.current
    if (!el) return
    cancelClose()
    const r = el.getBoundingClientRect()
    const openRight = r.left < EST_W // not enough room on the left -> open to the right
    setPos({
      x: openRight ? r.right + GAP : r.left - GAP,
      y: r.top + r.height / 2,
      right: openRight,
    })
  }

  const close = () => {
    cancelClose()
    if (!interactive) { setPos(null); return }
    timerRef.current = setTimeout(() => setPos(null), CLOSE_DELAY)
  }

  return (
    <div
      ref={anchorRef}
      className={`infotip-anchor${className ? ' ' + className : ''}`}
      onMouseEnter={place}
      onMouseMove={place}
      onMouseLeave={close}
      {...rest}
    >
      {children}
      {pos && createPortal(
        <div
          className={`infotip ${pos.right ? 'open-right' : 'open-left'}${interactive ? ' interactive' : ''}${tipClassName ? ' ' + tipClassName : ''}`}
          style={{ left: pos.x, top: pos.y }}
          onMouseEnter={interactive ? cancelClose : undefined}
          onMouseLeave={interactive ? close : undefined}
        >
          {title && <div className="infotip-title">{title}</div>}
          {/* String tooltips route through IconText so :token:s render as icons. */}
          <div className="infotip-body">{typeof text === 'string' ? <IconText>{text}</IconText> : text}</div>
        </div>,
        document.body,
      )}
    </div>
  )
}
