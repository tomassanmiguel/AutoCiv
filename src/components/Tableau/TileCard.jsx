import { UNIT_DEFS, unitStats } from '../../game/data/units.js'
import { BUILDING_DEFS, buildingEffect, buildingOutputs } from '../../game/data/buildings.js'
import { UNIT_CATEGORIES, BUILDING_CATEGORIES } from '../../game/data/slots.js'
import InfoTip from '../common/InfoTip.jsx'
import IconText from '../common/IconText.jsx'
import './TileCard.css'

const STAT_ICON = {
  speed: '/sprites/icons/speed.png',
  atk: '/sprites/icons/attack.png',
  def: '/sprites/icons/defense.png',
}
const RES_ICON = {
  food: '/sprites/icons/food.png',
  gold: '/sprites/icons/gold.png',
  production: '/sprites/icons/production.png',
  progress: '/sprites/icons/progress.png',
  legitimacy: '/sprites/icons/legitimacy.png',
}
const ACTION_ICON = { repair: '/sprites/icons/repair.png', upgrade: '/sprites/icons/upgrade.png' }
const catLabel = (list, typeKey) => list.find((c) => c.key === typeKey)?.label ?? ''
const clamp01 = (v) => Math.max(0, Math.min(1, v))

function IconVal({ src, children, cls = 'tc-stat', style }) {
  return <span className={cls} style={style}><img src={src} alt="" />{children}</span>
}

// Def number reddens as HP is lost (full = normal light, empty = red).
function defColor(ratio) {
  return `color-mix(in srgb, #ff5a5a ${Math.round((1 - ratio) * 100)}%, #f1e7d1)`
}

/**
 * A deployed unit/building rendered on its cell (~70%, centered; enlarges to fill
 * on hover). Level badge; rich tooltip. During combat (`combat`) the Def stat shows
 * REMAINING HP (reddening as it drops) and a cooldown bar ticks below. `side`
 * ('player'|'enemy') styles the frame; damaged instances gray out.
 *
 * `action` ({ kind:'repair'|'upgrade', cost, affordable, onClick }) renders a
 * gold-cost button on the card (repair a damaged instance / upgrade a healthy one).
 * `onGrab` (player units) starts a reposition drag from this card.
 */
export default function TileCard({ occupant, era, hpBonus = 0, combat = false, side = 'player', action = null, onGrab }) {
  const occ = occupant
  const damaged = occ.damaged
  const isUnit = occ.kind === 'unit'
  const def = isUnit ? UNIT_DEFS[occ.key] : BUILDING_DEFS[occ.key]
  const cats = isUnit ? UNIT_CATEGORIES : BUILDING_CATEGORIES
  const type = catLabel(cats, def.types[0])
  const typeIcon = cats.find((c) => c.key === def.types[0])?.silhouette

  const maxHp = occ.maxHp ?? (isUnit ? unitStats(def, occ.level, hpBonus).def : occ.hp)
  const shownDef = combat ? occ.hp : maxHp
  const ratio = clamp01((occ.hp ?? maxHp) / maxHp)
  const defStyle = combat && ratio < 1 ? { color: defColor(ratio) } : undefined

  // Cooldown bar (units only, during combat): ticks down from full to attack.
  const cooldown = isUnit ? Math.max(1, def.cooldown) : 0
  const cdFrac = combat && isUnit && occ.cdTimer != null ? clamp01(occ.cdTimer / cooldown) : null

  const outs = isUnit ? [] : buildingOutputs(def, occ.level, era)
  const stats = isUnit ? unitStats(def, occ.level, hpBonus) : null

  const tip = (
    <>
      <IconText>{`:${def.types[0]}:`}</IconText> {type}
      <br /><IconText>{isUnit ? def.description : buildingEffect(def, occ.level, era)}</IconText>
      {isUnit && def.ability ? <><br /><br /><strong>Ability:</strong> <IconText>{def.ability}</IconText></> : null}
      <br /><br />
      <span className="tc-tip-stats">
        {isUnit && <IconVal src={STAT_ICON.speed}>{stats.speed}</IconVal>}
        {isUnit && <IconVal src={STAT_ICON.atk}>{stats.atk}</IconVal>}
        <IconVal src={STAT_ICON.def} style={defStyle}>{combat ? `${occ.hp}/${maxHp}` : maxHp}</IconVal>
        {outs.map((o, i) => <IconVal key={i} src={RES_ICON[o.res]}>{o.amount}/{o.per}</IconVal>)}
      </span>
      <span className="tc-tip-lv"> · Lv {occ.level}</span>
      {!isUnit && <><br />Total produced: {occ.lifetimeOutput ?? 0} {outs[0] && <img className="itext-icon" src={RES_ICON[outs[0].res]} alt="" />}</>}
    </>
  )

  return (
    <InfoTip
      className="tile-card-anchor"
      title={def.name + (damaged ? ' (damaged)' : occ.mercenary ? ' (mercenary)' : '')}
      text={tip}
      onMouseDown={onGrab}
    >
      {/* Keyed by lastAttackSeq so the wrapper REMOUNTS on each attack, replaying
          the "thrust" lunge toward the enemy. */}
      <div className={`tc-lunge ${side}`} key={combat ? (occ.lastAttackSeq ?? 0) : 'idle'}>
        {/* fx wrapper — remounts when fxSeq changes, replaying the upgrade/repair/
            hire "pop" (green flash + scale). Suppressed in combat so the per-attack
            lunge remount (which also remounts this wrapper) doesn't re-flash it. */}
        <div className={`tc-fx${!combat && occ.fxSeq ? ' animate ' + (occ.fxKind ?? '') : ''}`} key={`fx-${occ.fxSeq ?? 0}`}>
          <div className={`tile-card ${isUnit ? 'unit' : 'building'} ${side} ${damaged ? 'damaged' : ''} ${occ.mercenary ? 'mercenary' : ''}`}>
            <div className="tc-level">{occ.level}</div>
            <div className="tc-name">{def.name}</div>
            {typeIcon && <img className="tc-type-icon" src={typeIcon} alt={type} />}
            <div className="tc-stats">
              {isUnit && <IconVal src={STAT_ICON.speed}>{stats.speed}</IconVal>}
              {isUnit && <IconVal src={STAT_ICON.atk}>{stats.atk}</IconVal>}
              <IconVal src={STAT_ICON.def} style={defStyle}>{shownDef}</IconVal>
              {outs.map((o, i) => <IconVal key={i} src={RES_ICON[o.res]}>{o.amount}</IconVal>)}
            </div>
            {action && (
              <button
                type="button"
                className={`tc-action ${action.kind}${action.affordable ? '' : ' disabled'}`}
                disabled={!action.affordable}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); action.onClick() }}
              >
                <img className="tc-action-icon" src={ACTION_ICON[action.kind]} alt={action.kind} />
                <span className="tc-action-cost"><img src={RES_ICON.gold} alt="" />{action.cost}</span>
              </button>
            )}
            {cdFrac != null && (
              <div className="tc-cooldown"><div className="tc-cooldown-fill" style={{ width: `${cdFrac * 100}%` }} /></div>
            )}
          </div>
        </div>
      </div>
    </InfoTip>
  )
}
