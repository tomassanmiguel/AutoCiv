import { useState } from 'react'
import './InfoTip.css'

/**
 * Wraps its children and shows a floating tooltip on hover. The tooltip is
 * `position: fixed` (follows the cursor) so it is not clipped by the panel's
 * `overflow: hidden`. Opens to the left of the cursor to stay on-screen for the
 * right-hand panel.
 */
export default function InfoTip({ title, text, className = '', children }) {
  const [pos, setPos] = useState(null)
  const track = (e) => setPos({ x: e.clientX, y: e.clientY })
  return (
    <div
      className={`infotip-anchor${className ? ' ' + className : ''}`}
      onMouseEnter={track}
      onMouseMove={track}
      onMouseLeave={() => setPos(null)}
    >
      {children}
      {pos && (
        <div className="infotip" style={{ left: pos.x, top: pos.y }}>
          {title && <div className="infotip-title">{title}</div>}
          <div className="infotip-body">{text}</div>
        </div>
      )}
    </div>
  )
}
