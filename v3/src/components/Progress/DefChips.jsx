import { DEFINITIONS } from '../../game/data/definitions.js'
import InfoTip from '../common/InfoTip.jsx'
import './DefChips.css'

/**
 * The SECOND layer of a progress node's explanation.
 *
 * A node says "unlocks the guildhall" or "outposts get +2 :gold:" without room
 * to say what a guildhall or an outpost is. Each term it leans on becomes a
 * chip here, and each chip is its own InfoTip — so hovering one opens a
 * definition tooltip on top of the node's tooltip. Definitions live once in
 * `data/definitions.js`, however many nodes point at them.
 *
 * ⚠️ For this to work inside another tooltip, the OUTER tooltip must be
 * `interactive` — otherwise it has `pointer-events: none` and closes the moment
 * the cursor leaves the node.
 */
export default function DefChips({ keys = [], className = '' }) {
  const defs = keys.map((k) => [k, DEFINITIONS[k]]).filter(([, d]) => d)
  if (!defs.length) return null
  return (
    <div className={`def-chips${className ? ' ' + className : ''}`}>
      {defs.map(([k, d]) => (
        <InfoTip key={k} className="def-chip" title={d.name} text={d.text}>
          {d.name}
        </InfoTip>
      ))}
    </div>
  )
}
