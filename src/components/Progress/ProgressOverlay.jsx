import { useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { ERAS } from '../../game/data/eras.js'
import { UNIT_DEFS, unitStats, unitRole } from '../../game/data/units.js'
import { BUILDING_DEFS, buildingEffect, buildingHp } from '../../game/data/buildings.js'
import { POLICY_DEFS, policyEffect } from '../../game/data/policies.js'
import { POP_TYPES } from '../../game/data/pops.js'
import { WONDER_DEFS } from '../../game/data/wonders.js'
import { UNIT_CATEGORIES, BUILDING_CATEGORIES } from '../../game/data/slots.js'
import IconText from '../common/IconText.jsx'
import './ProgressOverlay.css'

const STAT_ICON = {
  range: '/sprites/icons/range.png',
  pursuit: '/sprites/icons/speed.png',
  atk: '/sprites/icons/attack.png',
  def: '/sprites/icons/defense.png',
}

function Stat({ icon, children }) {
  return <span className="pc-stat"><img src={icon} alt="" />{children}</span>
}

const catLabel = (list, key) => list.find((c) => c.key === key)?.label ?? ''
const popRules = (pop) =>
  'Produces ' + Object.entries(pop.outputs).map(([res, v]) => `${v < 0 ? '' : '+'}${v} :${res}:`).join(', ') + ' per tick.'

/**
 * Structured card body for an advancement option. Always leads with "Unlocks <Name>"
 * and the type (or, for a passive bonus/modifier, just the effect), then the exact
 * rules text for that unlock — plus Speed/Atk/Def (units) or Def (buildings).
 */
function UnlockDetail({ opt, era }) {
  const u = opt.unlock
  if (!u) return <div className="pc-rules pc-todo">Not Yet Implemented</div>

  if (u.kind === 'modifier') {
    // Passive bonus: no "Unlocks" line, just the effect.
    return <div className="pc-rules"><IconText>{opt.description}</IconText></div>
  }

  if (u.kind === 'unit') {
    const def = UNIT_DEFS[u.key]
    const s = unitStats(def, 1)
    return (
      <>
        <div className="pc-unlocks">Unlocks {def.name}</div>
        <div className="pc-type"><IconText>{`:${def.types[0]}: ${catLabel(UNIT_CATEGORIES, def.types[0])} unit`}</IconText></div>
        <div className="pc-stats">
          <Stat icon={STAT_ICON.range}>{s.range}</Stat>
          {s.pursuit > 0 && <Stat icon={STAT_ICON.pursuit}>{s.pursuit}</Stat>}
          {unitRole(def) !== 'utility' && <Stat icon={STAT_ICON.atk}>{s.atk}</Stat>}
          <Stat icon={STAT_ICON.def}>{s.def}</Stat>
        </div>
        <div className="pc-rules"><IconText>{def.description}</IconText></div>
        {def.ability ? <div className="pc-rules"><strong>Ability:</strong> <IconText>{def.ability}</IconText></div> : null}
      </>
    )
  }

  if (u.kind === 'building') {
    const def = BUILDING_DEFS[u.key]
    const typeLabel = catLabel(BUILDING_CATEGORIES, def.types[0])
    // Underlapping buildings (Road) have no combat/HP: no Def stat shown.
    return (
      <>
        <div className="pc-unlocks">Unlocks {def.name}</div>
        <div className="pc-type"><IconText>{`:${def.types[0]}: ${typeLabel} building`}</IconText></div>
        {!def.underlap && (
          <div className="pc-stats">
            <Stat icon={STAT_ICON.def}>{buildingHp(def, 1)}</Stat>
          </div>
        )}
        <div className="pc-rules"><IconText>{buildingEffect(def, 1, era)}</IconText></div>
      </>
    )
  }

  if (u.kind === 'policy') {
    const def = POLICY_DEFS[u.key]
    return (
      <>
        <div className="pc-unlocks">Unlocks {def.name}</div>
        <div className="pc-type"><IconText>:policy: Policy</IconText></div>
        <div className="pc-rules"><IconText>{policyEffect(def)}</IconText></div>
      </>
    )
  }

  if (u.kind === 'pop') {
    const pop = POP_TYPES[u.key]
    return (
      <>
        <div className="pc-unlocks">Unlocks {pop.name}</div>
        <div className="pc-type"><IconText>:pop: Specialist</IconText></div>
        <div className="pc-rules"><IconText>{popRules(pop)}</IconText></div>
        {pop.note ? <div className="pc-rules"><IconText>{pop.note}</IconText></div> : null}
      </>
    )
  }

  if (u.kind === 'wonder') {
    const def = WONDER_DEFS[u.key]
    return (
      <>
        <div className="pc-unlocks">Unlocks {def.name}</div>
        <div className="pc-type"><IconText>:wonder: Wonder</IconText></div>
        <div className="pc-rules"><IconText>{def.effect}</IconText></div>
        <div className="pc-rules"><IconText>Build it like any structure: place it, then finish it over several :production: builds.</IconText></div>
      </>
    )
  }

  return null
}

/**
 * Advancement chooser, shown when a progress threshold is crossed (the game holds
 * paused). Three weighted cards; picking one unlocks its item into the roster.
 * Full-slot unlocks route through a confirm ("Are you sure?") and/or a slot-replace
 * prompt (the panel flashes the candidate slots red). "Hide" tucks the cards away
 * — the widget rail's flask re-summons them.
 */
export default function ProgressOverlay() {
  const game = useGame()
  const sel = game.data.selection
  const freeRerolls = game.data.civilization.freeRerolls ?? 0
  const rerollCost = game.rerollGoldCost()
  const canReroll = freeRerolls > 0 || game.data.civilization.gold.value >= rerollCost
  const [dontAsk, setDontAsk] = useState(false)
  if (!sel || sel.type !== 'progress') return null

  // Replace stage: the cards are hidden; a small prompt drives panel picking.
  if (sel.stage === 'replace') {
    return (
      <div className="progress-backdrop progress-backdrop--soft">
        <div className="replace-prompt frame-box">
          <div className="replace-prompt-title">Choose which slot to replace</div>
          <div className="replace-prompt-hint">Pick a flashing slot in the panel →</div>
          <button className="progress-btn frame-box-dark" onClick={() => game.cancelReplace()}>Cancel</button>
        </div>
      </div>
    )
  }

  // Confirm stage: an extra "are you sure" before overwriting a full slot.
  if (sel.stage === 'confirm') {
    return (
      <div className="progress-backdrop">
        <div className="confirm-window frame-box">
          <div className="confirm-title">Replace an existing item?</div>
          <div className="confirm-text">Its slot is already full. Choosing this will overwrite what you have.</div>
          <label className="confirm-check">
            <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
            Don&apos;t ask again
          </label>
          <div className="confirm-actions">
            <button className="progress-btn frame-box-dark" onClick={() => game.cancelReplace()}>Cancel</button>
            <button className="progress-btn frame-box-dark" onClick={() => game.confirmReplace(dontAsk)}>Confirm</button>
          </div>
        </div>
      </div>
    )
  }

  // Choose stage. Hidden -> nothing here (the widget rail restores it).
  if (sel.hidden) return null

  return (
    <div className="progress-backdrop">
      <div className="progress-window">
        <h2 className="progress-heading">Progress!</h2>
        <div className="progress-cards">
          {sel.options.map((opt, i) => (
            <button
              key={opt.id}
              className={`progress-card frame-box ${opt.implemented ? '' : 'not-impl'}`}
              onClick={() => game.chooseProgress(i)}
            >
              <div className="progress-card-corner">
                {opt.silhouette
                  ? <img src={opt.silhouette} alt="" />
                  : <span className="progress-card-glyph">{opt.glyph}</span>}
              </div>
              <div className="progress-card-era">{ERAS[opt.eraIndex].name}</div>
              <div className="progress-card-name">{opt.name}</div>
              <div className="progress-card-body">
                <UnlockDetail opt={opt} era={game.era} />
              </div>
            </button>
          ))}
        </div>
        <div className="progress-actions">
          <button className="progress-btn frame-box-dark progress-hide" onClick={() => game.hideSelection()}>
            Hide
          </button>
          <button
            className="progress-btn frame-box-dark progress-reroll"
            disabled={!canReroll}
            onClick={() => game.rerollAdvancement()}
          >
            Reroll{freeRerolls > 0
              ? ` (${freeRerolls} free)`
              : <span className="reroll-cost"><img src="/sprites/icons/gold.png" alt="gold" />{rerollCost}</span>}
          </button>
        </div>
      </div>
    </div>
  )
}
