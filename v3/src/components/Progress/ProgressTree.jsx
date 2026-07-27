import { useRef, useState, useEffect } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import {
  LAID_OUT, LAID_OUT_BY_ID, QUADRANT_LIST, RING_UNLOCK, MAX_RING,
  NODE_SIZE, extentFor, ringRadius,
} from '../../game/data/progress.js'
import InfoTip from '../common/InfoTip.jsx'
import IconText from '../common/IconText.jsx'
import './ProgressTree.css'

/**
 * The progress web: a radial tree that grows outward.
 *
 * Rings unlock by count (RING_UNLOCK nodes taken from the ring inside), and a
 * ring that has not unlocked is not drawn at all — so the web literally expands
 * as the civ develops. The four quadrants (Society / Technology / Economy /
 * Military) each own a 90° sector.
 *
 * State colours: green = taken, blue = available, grey = locked. A locked node
 * is either missing its prerequisite or shut out by a fork it lost.
 */
export default function ProgressTree({ onClose }) {
  const game = useGame()
  const visibleRing = game.visibleRing
  const viewportRef = useRef(null)
  const [scale, setScale] = useState(1)

  // Only ever draw rings that have opened; the content extent grows with them,
  // and the scale eases so the web appears to expand rather than jump.
  // Not memoised on purpose: it is 52 nodes, and useGame() already re-renders
  // this component whenever the manager emits, so a memo would only add a way
  // to go stale.
  const shown = LAID_OUT.filter((n) => game.progressState(n) !== 'hidden')
  const extent = extentFor(visibleRing)

  useEffect(() => {
    const vp = viewportRef.current
    if (!vp) return
    const fit = () => {
      const s = Math.min(vp.clientWidth, vp.clientHeight) / (extent * 2)
      setScale(Math.min(1.15, s * 0.94))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(vp)
    return () => ro.disconnect()
  }, [extent])

  // Edges from each prereq to its node. Drawn under the nodes; an edge is "live"
  // when the prereq is taken, so satisfied routes light up.
  const edges = []
  for (const n of shown) {
    for (const pid of n.prereqs) {
      const p = LAID_OUT_BY_ID.get(pid)
      if (!p) continue
      edges.push({
        id: `${pid}->${n.id}`,
        x1: p.x, y1: p.y, x2: n.x, y2: n.y,
        live: game.progress.has(pid),
        dead: game.progressState(n) === 'locked' && !game.progress.has(pid),
      })
    }
  }

  const nextRing = visibleRing + 1
  const towardNext = game.chosenInRing(visibleRing)

  return (
    <div className="tree-backdrop">
      <div className="tree-head">
        <div>
          <h2>Progress</h2>
          <span className="tree-sub">
            {game.progress.size} taken
            {visibleRing < MAX_RING && (
              <> · ring {nextRing + 1} opens at {towardNext}/{RING_UNLOCK}</>
            )}
          </span>
        </div>
        <div className="tree-head-actions">
          <button className="tree-btn" onClick={() => game.resetProgress()}>Reset</button>
          <button className="tree-btn" onClick={onClose}>Close</button>
        </div>
      </div>

      <div className="tree-viewport" ref={viewportRef}>
        <div
          className="tree-content"
          style={{ width: extent * 2, height: extent * 2, transform: `scale(${scale})` }}
        >
          <svg className="tree-edges" viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}>
            {/* quadrant dividers + ring guides */}
            {[0, 90, 180, 270].map((deg) => {
              const a = (deg * Math.PI) / 180
              return (
                <line
                  key={deg}
                  className="tree-divider"
                  x1={0} y1={0}
                  x2={Math.cos(a) * extent} y2={Math.sin(a) * extent}
                />
              )
            })}
            {Array.from({ length: visibleRing + 1 }, (_, r) => (
              <circle key={r} className="tree-ring" cx={0} cy={0} r={ringRadius(r)} />
            ))}
            {edges.map((e) => (
              <line
                key={e.id}
                className={`tree-edge${e.live ? ' live' : ''}${e.dead ? ' dead' : ''}`}
                x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2}
              />
            ))}
          </svg>

          {QUADRANT_LIST.map((q) => {
            const mid = ((q.from + q.to) / 2) * (Math.PI / 180)
            const R = ringRadius(visibleRing) + NODE_SIZE * 1.1
            return (
              <div
                key={q.key}
                className={`tree-quadrant-label q-${q.key}`}
                style={{
                  left: extent + Math.cos(mid) * R,
                  top: extent + Math.sin(mid) * R,
                }}
              >{q.name}</div>
            )
          })}

          <div className="tree-hub" style={{ left: extent, top: extent }}>
            <span>Palace</span>
          </div>

          {shown.map((n) => {
            const state = game.progressState(n)
            return (
              <InfoTip
                key={n.id}
                className={`tree-node-anchor q-${n.quadrant}`}
                style={{ left: extent + n.x, top: extent + n.y }}
                title={n.name}
                text={
                  <div className="tree-tip">
                    <div className="tree-tip-kind">{n.kind}</div>
                    <div className="tree-tip-unlocks">Unlocks <b>{n.unlocks}</b></div>
                    <div className="tree-tip-effect"><IconText>{n.effect}</IconText></div>
                    {n.excludes.length > 0 && (
                      <div className="tree-tip-fork">
                        Taking this rules out{' '}
                        {n.excludes.map((id) => LAID_OUT_BY_ID.get(id)?.name).join(', ')}
                      </div>
                    )}
                    <div className={`tree-tip-state s-${state}`}>
                      {state === 'unlocked' ? 'Already taken'
                        : state === 'available' ? 'Click to take'
                          : 'Locked'}
                    </div>
                  </div>
                }
              >
                <button
                  className={`tree-node s-${state}`}
                  style={{ width: NODE_SIZE, height: NODE_SIZE * 0.866 }}
                  onClick={() => game.chooseProgress(n)}
                  disabled={state !== 'available'}
                >
                  <img src={n.icon} alt={n.kind} />
                </button>
                <span className="tree-node-name">{n.name}</span>
              </InfoTip>
            )
          })}
        </div>
      </div>
    </div>
  )
}
