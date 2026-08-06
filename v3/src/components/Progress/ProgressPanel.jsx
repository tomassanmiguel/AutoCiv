import { useGame } from '../../game/react/GameProvider.jsx'
import IconText from '../common/IconText.jsx'
import './ProgressPanel.css'

/**
 * WHAT YOU HAVE RESEARCHED — three columns, one per branch.
 *
 * This replaced a 297-node radial web, and the omissions are the point:
 *
 *   - no dependency graph. The pool is current-tier-only and almost nothing has
 *     a prerequisite, so a graph drew edges that carried no information.
 *   - no unchosen techs. You cannot browse the pool and plan a route to a distant
 *     node — what you skip is GONE when the branch advances. Showing the road not
 *     taken would be showing a road that no longer exists.
 *
 * What is left is the honest thing: what you hold, per branch, and how close each
 * branch is to its next era.
 */
export default function ProgressPanel({ onClose }) {
  const game = useGame()
  const branches = game.branches
  const taken = game.takenRows
  const held = game.heldWonder

  return (
    <div className="pp-backdrop" onClick={onClose}>
      <div className="pp-panel" onClick={(e) => e.stopPropagation()}>
        <header className="pp-head">
          <h2>Progress</h2>
          <span className="pp-sub">
            {taken.length} advancement{taken.length === 1 ? '' : 's'} · the map reveals to your
            furthest branch ({game.eraName})
          </span>
          <button className="pp-close" onClick={onClose} aria-label="Close">✕</button>
        </header>

        {held && (
          <div className="pp-wonder">
            <img src={held.icon} alt="" />
            <div>
              <b>{held.name}</b> is drafted but unbuilt — your next
              {' '}<img className="pp-inline" src="/sprites/icons/production.png" alt="production" />
              {' '}threshold builds it instead of founding a city.
            </div>
          </div>
        )}

        <div className="pp-cols">
          {branches.map((b) => {
            const rows = taken.filter((r) => r.quadrant === b.quadrant)
            return (
              <section key={b.quadrant} className={`pp-col q-${b.quadrant}`}>
                <div className="pp-col-head">
                  <span className="pp-branch">{b.quadrant}</span>
                  <span className="pp-era">{b.eraName}</span>
                </div>

                {/* How close this branch is to its own next era. Each branch
                    carries its own clock, so there are three of these. */}
                <div className="pp-meter" title={`${b.have} of ${b.need} toward the next era`}>
                  <div className="pp-meter-fill" style={{ width: `${b.need ? (b.have / b.need) * 100 : 100}%` }} />
                </div>
                <div className="pp-meter-label">
                  {b.need ? <>{b.have}/{b.need} to advance</> : 'final era'}
                  {b.stalled && <span className="pp-stalled">nothing left to draft</span>}
                </div>

                <ul className="pp-list">
                  {rows.map((r) => (
                    <li key={r.id} className={r.isWonder ? 'wonder' : ''}>
                      <img src={r.icon} alt="" />
                      <div>
                        <b>{r.name}</b>
                        <span className="pp-eff"><IconText>{r.description}</IconText></span>
                      </div>
                    </li>
                  ))}
                  {rows.length === 0 && <li className="pp-none">nothing yet</li>}
                </ul>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
