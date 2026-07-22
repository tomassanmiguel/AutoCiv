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
 */
export default function TileCard({ occupant, era, hpBonus = 0, combat = false, side = 'player' }) {
  const occ = occupant
  const damaged = occ.damaged
  const isUnit = occ.kind === 'unit'
  const def = isUnit ? UNIT_DEFS[occ.key] : BUILDING_DEFS[occ.key]
  const type = catLabel(isUnit ? UNIT_CATEGORIES : BUILDING_CATEGORIES, def.types[0])

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
    <InfoTip className="tile-card-anchor" title={def.name + (damaged ? ' (damaged)' : '')} text={tip}>
      <div className={`tile-card ${isUnit ? 'unit' : 'building'} ${side} ${damaged ? 'damaged' : ''}`}>
        <div className="tc-level">{occ.level}</div>
        <div className="tc-name">{def.name}</div>
        <div className="tc-type">{type}</div>
        <div className="tc-stats">
          {isUnit && <IconVal src={STAT_ICON.speed}>{stats.speed}</IconVal>}
          {isUnit && <IconVal src={STAT_ICON.atk}>{stats.atk}</IconVal>}
          <IconVal src={STAT_ICON.def} style={defStyle}>{shownDef}</IconVal>
          {outs.map((o, i) => <IconVal key={i} src={RES_ICON[o.res]}>{o.amount}</IconVal>)}
        </div>
        {cdFrac != null && (
          <div className="tc-cooldown"><div className="tc-cooldown-fill" style={{ width: `${cdFrac * 100}%` }} /></div>
        )}
      </div>
    </InfoTip>
  )
}
