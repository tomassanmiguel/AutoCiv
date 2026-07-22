import { UNIT_DEFS, unitStats } from '../../game/data/units.js'
import { BUILDING_DEFS, buildingEffect, buildingOutputs } from '../../game/data/buildings.js'
import { UNIT_CATEGORIES, BUILDING_CATEGORIES } from '../../game/data/slots.js'
import InfoTip from '../common/InfoTip.jsx'
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

function IconVal({ src, children, cls = 'tc-stat' }) {
  return <span className={cls}><img src={src} alt="" />{children}</span>
}

/**
 * A deployed unit/building rendered on its tile (~70% of the tile, centered;
 * enlarges to fill on hover). Level badge in the corner; a rich tooltip on hover.
 * Damaged instances are grayed and flagged "(damaged)".
 */
export default function TileCard({ occupant, era, hpBonus }) {
  const occ = occupant
  const damaged = occ.damaged

  if (occ.kind === 'unit') {
    const def = UNIT_DEFS[occ.key]
    const s = unitStats(def, occ.level, hpBonus)
    const type = catLabel(UNIT_CATEGORIES, def.types[0])
    const tip = (
      <>
        {type}
        <br />{def.description}
        {def.ability ? <><br /><br /><strong>Ability:</strong> {def.ability}</> : null}
        <br /><br />
        <span className="tc-tip-stats">
          <IconVal src={STAT_ICON.speed}>{s.speed}</IconVal>
          <IconVal src={STAT_ICON.atk}>{s.atk}</IconVal>
          <IconVal src={STAT_ICON.def}>{occ.hp}/{occ.maxHp}</IconVal>
        </span>
        <span className="tc-tip-lv"> · Lv {occ.level}</span>
      </>
    )
    return (
      <InfoTip className="tile-card-anchor" title={def.name + (damaged ? ' (damaged)' : '')} text={tip}>
        <div className={`tile-card unit ${damaged ? 'damaged' : ''}`}>
          <div className="tc-level">{occ.level}</div>
          <div className="tc-name">{def.name}</div>
          <div className="tc-type">{type}</div>
          <div className="tc-stats">
            <IconVal src={STAT_ICON.speed}>{s.speed}</IconVal>
            <IconVal src={STAT_ICON.atk}>{s.atk}</IconVal>
            <IconVal src={STAT_ICON.def}>{s.def}</IconVal>
          </div>
        </div>
      </InfoTip>
    )
  }

  // building
  const def = BUILDING_DEFS[occ.key]
  const type = catLabel(BUILDING_CATEGORIES, def.types[0])
  const outs = buildingOutputs(def, occ.level, era)
  const tip = (
    <>
      {type}
      <br />{buildingEffect(def, occ.level, era)}
      <br /><br />
      <span className="tc-tip-stats">
        <IconVal src={STAT_ICON.def}>{occ.hp}/{occ.maxHp}</IconVal>
        {outs.map((o, i) => <IconVal key={i} src={RES_ICON[o.res]}>{o.amount}/{o.per}</IconVal>)}
      </span>
      <span className="tc-tip-lv"> · Lv {occ.level}</span>
      <br />Total produced: {occ.lifetimeOutput ?? 0}
    </>
  )
  return (
    <InfoTip className="tile-card-anchor" title={def.name + (damaged ? ' (damaged)' : '')} text={tip}>
      <div className={`tile-card building ${damaged ? 'damaged' : ''}`}>
        <div className="tc-level">{occ.level}</div>
        <div className="tc-name">{def.name}</div>
        <div className="tc-type">{type}</div>
        <div className="tc-stats">
          <IconVal src={STAT_ICON.def}>{occ.hp}</IconVal>
          {outs.map((o, i) => <IconVal key={i} src={RES_ICON[o.res]}>{o.amount}</IconVal>)}
        </div>
      </div>
    </InfoTip>
  )
}
