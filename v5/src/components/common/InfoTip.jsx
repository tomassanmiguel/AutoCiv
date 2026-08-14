import { createContext, useContext, useRef, useState, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import IconText from './IconText.jsx'
import './InfoTip.css'

// Clearance from the anchor's edge. Also covers the on-tile card's hover-scale
// growth (it scales 1.42x from center, so its edge moves out ~14px) so the
// tooltip never ends up over the card.
const GAP = 16
const EST_W = 300 // ~tooltip max-width + margin, used only to decide the edge flip
// An INTERACTIVE tooltip must survive the cursor crossing the GAP between the
// anchor and the tooltip. Short, because the common case is moving to ANOTHER
// anchor — and that closes this one instantly through the registry below, so
// the delay only ever shows when leaving for empty space.
const CLOSE_DELAY = 90

/** How deeply nested this tooltip is: 0 on the page, 1 inside a tooltip, … */
const TipDepth = createContext(0)

/**
 * ONE open tooltip per nesting depth.
 *
 * Without this, an interactive tooltip's grace timer kept it on screen while the
 * next anchor's tooltip was already up — two tooltips at once, and the whole
 * thing felt sticky. Opening at depth `d` now closes anything open at `d` or
 * deeper immediately, so moving between anchors SWAPS. Depth is what keeps
 * nesting working: a definition chip opens at depth 1 and leaves its parent at
 * depth 0 alone.
 */
const openAt = new Map()

/**
 * Wraps its children and shows a floating tooltip on hover. The tooltip is
 * `position: fixed` and PORTALED to <body> (so a transformed ancestor — e.g. the
 * hover-scaled on-tile card — can't become its containing block and mis-place it).
 *
 * It is anchored to the hovered element's BOUNDING BOX, not the cursor, and opens
 * just beside it (to the left, flipping right near the screen edge) so it never
 * covers the card/slot it describes.
 *
 * `interactive` makes the tooltip itself hoverable — pointer events on, plus the
 * grace timer. That is what lets a tooltip hold its own hover targets, e.g. the
 * progress web's definition chips.
 */
export default function InfoTip({ title, text, className = '', tipClassName = '', interactive = false, children, ...rest }) {
  const depth = useContext(TipDepth)
  const anchorRef = useRef(null)
  const [pos, setPos] = useState(null)
  const timerRef = useRef(null)

  const cancelClose = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  // A per-instance token, so the registry can tell "mine" from "someone else's"
  // without comparing function identity (which changes every render).
  const meRef = useRef({})
  const isMine = () => openAt.get(depth)?.token === meRef.current

  const hideNow = () => {
    cancelClose()
    setPos(null)
    if (isMine()) openAt.delete(depth)
  }

  useEffect(() => {
    const me = meRef.current
    return () => {
      cancelClose()
      if (openAt.get(depth)?.token === me) openAt.delete(depth)
    }
  }, [depth])

  const place = () => {
    const el = anchorRef.current
    if (!el) return
    cancelClose()
    // Anything open at this depth or deeper belongs to a different anchor now.
    for (const [d, entry] of [...openAt]) if (d >= depth && entry.token !== meRef.current) entry.close()
    openAt.set(depth, { token: meRef.current, close: hideNow })
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
    if (!interactive) { hideNow(); return }
    timerRef.current = setTimeout(hideNow, CLOSE_DELAY)
  }

  // Keep the (vertically-centered) tooltip inside the viewport — top-bar anchors
  // sit near y=0, so an un-clamped tooltip would spill above the screen.
  const tipRef = useRef(null)
  useLayoutEffect(() => {
    if (!pos || !tipRef.current) return
    const half = tipRef.current.offsetHeight / 2
    const M = 8
    let y = pos.y
    if (y - half < M) y = M + half
    else if (y + half > window.innerHeight - M) y = window.innerHeight - M - half
    tipRef.current.style.top = `${y}px`
  }, [pos])

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
        <TipDepth.Provider value={depth + 1}>
          <div
            ref={tipRef}
            className={`infotip ${pos.right ? 'open-right' : 'open-left'}${interactive ? ' interactive' : ''}${tipClassName ? ' ' + tipClassName : ''}`}
            style={{ left: pos.x, top: pos.y }}
            onMouseEnter={interactive ? cancelClose : undefined}
            onMouseLeave={interactive ? close : undefined}
            // ⚠️ A PORTAL still bubbles events through the REACT tree, so a
            // mousemove over anything inside this tooltip reaches the anchor's
            // onMouseMove and re-runs `place()` — which would then close the
            // nested tooltip that move just opened. Stop it here: pointer
            // movement inside a tooltip is none of the anchor's business.
            onMouseMove={(e) => e.stopPropagation()}
          >
            {title && <div className="infotip-title">{title}</div>}
            {/* String tooltips route through IconText so :token:s render as icons. */}
            <div className="infotip-body">{typeof text === 'string' ? <IconText>{text}</IconText> : text}</div>
          </div>
        </TipDepth.Provider>,
        document.body,
      )}
    </div>
  )
}
