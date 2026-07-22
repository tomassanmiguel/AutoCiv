import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import IconText from './IconText.jsx'
import './InfoTip.css'

// Clearance from the anchor's edge. Also covers the on-tile card's hover-scale
// growth (it scales 1.42x from center, so its edge moves out ~14px) so the
// tooltip never ends up over the card even mid-animation.
const GAP = 16
const EST_W = 300 // ~tooltip max-width + margin, used only to decide the edge flip

/**
 * Wraps its children and shows a floating tooltip on hover. The tooltip is
 * `position: fixed` and PORTALED to <body> (so a transformed ancestor — e.g. the
 * hover-scaled on-tile card — can't become its containing block and mis-place it).
 *
 * It is anchored to the hovered element's BOUNDING BOX, not the cursor, and opens
 * just beside it (to the left, flipping right near the screen edge) so it never
 * covers the card/slot it describes.
 */
export default function InfoTip({ title, text, className = '', children, ...rest }) {
  const anchorRef = useRef(null)
  const [pos, setPos] = useState(null)
  const place = () => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const openRight = r.left < EST_W // not enough room on the left -> open to the right
    setPos({
      x: openRight ? r.right + GAP : r.left - GAP,
      y: r.top + r.height / 2,
      right: openRight,
    })
  }
  return (
    <div
      ref={anchorRef}
      className={`infotip-anchor${className ? ' ' + className : ''}`}
      onMouseEnter={place}
      onMouseMove={place}
      onMouseLeave={() => setPos(null)}
      {...rest}
    >
      {children}
      {pos && createPortal(
        <div className={`infotip ${pos.right ? 'open-right' : 'open-left'}`} style={{ left: pos.x, top: pos.y }}>
          {title && <div className="infotip-title">{title}</div>}
          {/* String tooltips route through IconText so :token:s render as icons. */}
          <div className="infotip-body">{typeof text === 'string' ? <IconText>{text}</IconText> : text}</div>
        </div>,
        document.body,
      )}
    </div>
  )
}
