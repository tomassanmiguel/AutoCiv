import { useState } from 'react'
import { UNIT_DEFS, unitStats, unitRole } from '../../game/data/units.js'
import { BUILDING_DEFS, buildingEffect, buildingOutputs, buildingHp } from '../../game/data/buildings.js'
import { TERRAIN, terrainDefBonus } from '../../game/data/terrain.js'
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
 * gold-cost button on the card. Hovering an `upgrade` action previews the NEXT
 * level in the tooltip (tinted green). `onGrab` starts a reposition drag.
 * `terrain` is the tile's terrain key (for the Forest combat-def note).
 */
export default function TileCard({ occupant, era, hpBonus = 0, buildingHpBonus = 0, combat = false, side = 'player', action = null, onGrab, terrain, slide = null, combatSeq = -1, anchorClass = '', strip = false }) {
  const occ = occupant
  const [preview, setPreview] = useState(false) // upgrade-hover: show next level
  const damaged = occ.damaged
  const isUnit = occ.kind === 'unit'
  const def = isUnit ? UNIT_DEFS[occ.key] : BUILDING_DEFS[occ.key]

  // Underlapping buildings (Road): a minimal name-only card in its own bottom strip, no
  // stats/combat/actions. Its own tooltip still explains the effect.
  if (!isUnit && def.underlap) {
    return (
      <InfoTip className="underlap-anchor" title={def.name} text={buildingEffect(def, occ.level, era)}>
        <div className="tile-card underlap"><span className="tc-name">{def.name}</span></div>
      </InfoTip>
    )
  }

  const cats = isUnit ? UNIT_CATEGORIES : BUILDING_CATEGORIES
  const type = catLabel(cats, def.types[0])
  const typeIcon = cats.find((c) => c.key === def.types[0])?.silhouette
  const wb = occ.warband ?? 0
  const showAtk = isUnit && unitRole(def) !== 'utility' // utility units don't attack

  const maxHp = occ.maxHp ?? (isUnit ? unitStats(def, occ.level, hpBonus, wb).def : occ.hp)
  const shownDef = combat ? occ.hp : maxHp
  const shownAtk = isUnit ? (occ.atk ?? unitStats(def, occ.level, hpBonus, wb).atk) : null
  const ratio = clamp01((occ.hp ?? maxHp) / maxHp)
  const defStyle = combat && ratio < 1 ? { color: defColor(ratio) } : undefined

  // v2 units show RANGE (Manhattan diamond) in the first stat slot. A cooldown bar
  // only appears for units that actually recharge after firing (Siege = 2 turns).
  const rangeVal = isUnit ? (def.range ?? 1) : 0
  const cdMax = isUnit ? (def.cooldown ?? 0) : 0
  const cdFrac = combat && isUnit && cdMax > 0 && occ.cdTimer != null ? clamp01(occ.cdTimer / cdMax) : null

  const outs = isUnit ? [] : buildingOutputs(def, occ.level, era)
  const tickOut = isUnit ? null : occ.tickOutput // live per-tick output (Ranch/Kiln/Mine)
  const stored = occ.storedProgress // Cave Painting's banked progress, if any

  // Effective unit stats at a level (Clothes + Warband, then Brewery aura), matching
  // the manager's pipeline (Forest is combat-only, so omitted from the dev preview).
  const statsAt = (lvl) => {
    // Include occ.permDef (Baker's def buff) and occ.packAtk (Legion's atk bonus) so the
    // preview matches the live stats. permDef only affects def; packAtk only affects atk.
    const s = unitStats(def, lvl, hpBonus + wb + (occ.permDef ?? 0), wb + (occ.packAtk ?? 0))
    const b = occ.inBrewery
    const atkMult = occ.atkMult ?? (b ? 1.1 : 1) // Brewery × Brothel (positional)
    const caste = occ.casteActive && lvl > 1 ? 1.25 : 1 // upgraded-unit bonus applies at the previewed level
    return {
      range: s.range,
      atk: Math.round(s.atk * atkMult * caste),
      def: Math.round(s.def * (b ? 0.9 : 1)),
    }
  }

  const renderTip = (isPrev) => {
    const lvl = isPrev ? occ.level + 1 : occ.level
    const ps = isUnit && isPrev ? statsAt(lvl) : null
    const bOuts = isUnit ? [] : buildingOutputs(def, lvl, era)
    const dispSpeed = isUnit ? (isPrev ? ps.range : rangeVal) : null
    const dispAtk = isUnit ? (isPrev ? ps.atk : shownAtk) : null
    const dispDef = isUnit
      ? (isPrev ? ps.def : (combat ? `${occ.hp}/${maxHp}` : maxHp))
      : (isPrev ? buildingHp(def, lvl, buildingHpBonus) : maxHp)
    return (
      <>
        {isPrev && <div className="tc-tip-upg">Upgrade → Lv {lvl}</div>}
        <IconText>{`:${def.types[0]}:`}</IconText> {type}
        <br /><IconText>{isUnit ? def.description : buildingEffect(def, lvl, era)}</IconText>
        {isUnit && def.ability ? <><br /><br /><strong>Ability:</strong> <IconText>{def.ability}</IconText></> : null}
        <br /><br />
        <span className="tc-tip-stats">
          {isUnit && <IconVal src={STAT_ICON.speed}>{dispSpeed}</IconVal>}
          {showAtk && <IconVal src={STAT_ICON.atk}>{dispAtk}</IconVal>}
          <IconVal src={STAT_ICON.def} style={isPrev ? undefined : defStyle}>{dispDef}</IconVal>
          {bOuts.map((o, i) => <IconVal key={i} src={RES_ICON[o.res]}>{o.amount}/{o.per}</IconVal>)}
          {tickOut && !isPrev && <IconVal src={RES_ICON[tickOut.res]}>{Math.floor(tickOut.amount)}/t</IconVal>}
          {stored != null && !isPrev && <IconVal src={RES_ICON.progress}>{stored}</IconVal>}
        </span>
        <span className="tc-tip-lv"> · Lv {lvl}</span>
        {/* Terrain / aura notes (current view only). */}
        {!isPrev && terrainDefBonus(terrain) > 0 && <><br /><IconText>{`+${terrainDefBonus(terrain)} :defense: in combat (${TERRAIN[terrain]?.name}).`}</IconText></>}
        {!isPrev && isUnit && occ.inBrewery && <><br /><IconText>{'+10% :attack:, −10% :defense: (Brewery).'}</IconText></>}
        {!isPrev && isUnit && (occ.cdReduce ?? 0) > 0 && <><br /><IconText>{'−0.5s cooldown & bonus :attack: (Brothel).'}</IconText></>}
        {!isPrev && isUnit && occ.casteActive && occ.level > 1 && <><br /><IconText>{'+25% :attack: (Caste System).'}</IconText></>}
        {!isPrev && isUnit && occ.dmgBonus > 0 && <><br /><IconText>{`+${Math.round(occ.dmgBonus * 100)}% :attack: (doctrines/policies).`}</IconText></>}
        {!isPrev && isUnit && wb > 0 && <><br /><IconText>{`+${wb} :attack: & :defense: (Tribalism).`}</IconText></>}
        {!isPrev && isUnit && (occ.packAtk ?? 0) > 0 && <><br /><IconText>{`+${occ.packAtk} :attack: (Legion).`}</IconText></>}
        {!isUnit && !isPrev && (bOuts[0] || tickOut) && <><br />Total produced: {Math.floor(occ.lifetimeOutput ?? 0)} <img className="itext-icon" src={RES_ICON[bOuts[0]?.res ?? tickOut.res]} alt="" /></>}
      </>
    )
  }

  // City-tile buildings (and the primary occupant) render as compact, name-only
  // "road style" strips — details on hover (the same rich tooltip as a full card).
  // The primary occupant still carries its gold action (repair/upgrade) as a small
  // trailing icon button, since it can be combat-damaged; extras pass no action.
  if (strip) {
    return (
      <InfoTip
        className="tile-card-anchor city-strip-anchor"
        title={def.name + (damaged ? ' (damaged)' : occ.mercenary ? ' (mercenary)' : '')}
        text={renderTip(false)}
        onMouseDown={onGrab}
      >
        <div className={`tile-card strip ${isUnit ? 'unit' : 'building'} ${side} ${damaged ? 'damaged' : ''}`}>
          <span className="tc-name">{def.name}</span>
          <span className="tc-level">{occ.level}</span>
          {action && (
            <button
              type="button"
              className={`tc-action strip ${action.kind}${action.affordable ? '' : ' disabled'}`}
              disabled={!action.affordable}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); action.onClick() }}
              title={`${action.kind} (${action.cost} gold)`}
            >
              <img className="tc-action-icon" src={ACTION_ICON[action.kind]} alt={action.kind} />
            </button>
          )}
        </div>
      </InfoTip>
    )
  }

  // Derive the preview from LIVE action state so a disabled/unmounted Upgrade
  // button (which can't fire onMouseLeave) can't leave the preview stuck on.
  const showPreview = preview && action?.kind === 'upgrade' && action.affordable

  return (
    <InfoTip
      className={`tile-card-anchor ${anchorClass}`}
      tipClassName={showPreview ? 'upgrade-preview' : ''}
      title={def.name + (damaged ? ' (damaged)' : occ.mercenary ? ' (mercenary)' : '')}
      text={renderTip(showPreview)}
      onMouseDown={onGrab}
    >
      {/* Slide layer: when the unit changed tiles this render (`slide` = old-minus-new
          pixel offset), it mounts here and animates from the old cell to this one
          (combat reposition / Wolf shift / shift-back / drag) instead of teleporting. */}
      <div
        className={`tc-slide${slide ? ' animate' : ''}`}
        style={slide ? { '--sx': `${slide.dx}px`, '--sy': `${slide.dy}px` } : undefined}
      >
        {/* Keyed by lastAttackSeq so the wrapper REMOUNTS on each attack, replaying
            the "thrust" lunge — but only ANIMATES when the unit actually attacked THIS
            step (`attacking`), so entering/leaving combat no longer jerks every card. */}
        <div className={`tc-lunge ${side}${combat && occ.lastAttackSeq != null && occ.lastAttackSeq === combatSeq ? ' attacking' : ''}`} key={occ.lastAttackSeq ?? 0}>
        {/* fx wrapper — remounts when fxSeq changes, replaying the upgrade/repair/
            hire "pop" (green flash + scale). Suppressed in combat so the per-attack
            lunge remount (which also remounts this wrapper) doesn't re-flash it. */}
        <div className={`tc-fx${!combat && occ.fxSeq ? ' animate ' + (occ.fxKind ?? '') : ''}`} key={`fx-${occ.fxSeq ?? 0}`}>
          <div className={`tile-card ${isUnit ? 'unit' : 'building'} ${side} ${damaged ? 'damaged' : ''} ${occ.mercenary ? 'mercenary' : ''}`}>
            {/* Visual content — grayed out when damaged. The action button lives
                OUTSIDE this wrapper so the grayscale filter never dims it. */}
            <div className="tc-body">
              {/* Name + level share a row (in-flow) so the level badge can't
                  overlap the name. */}
              <div className="tc-header">
                <span className="tc-name">{def.name}</span>
                <span className="tc-level">{occ.level}</span>
              </div>
              {typeIcon && <img className="tc-type-icon" src={typeIcon} alt={type} />}
              <div className="tc-stats">
                {isUnit && <IconVal src={STAT_ICON.speed}>{rangeVal}</IconVal>}
                {showAtk && <IconVal src={STAT_ICON.atk}>{shownAtk}</IconVal>}
                <IconVal src={STAT_ICON.def} style={defStyle}>{shownDef}</IconVal>
                {outs.map((o, i) => <IconVal key={i} src={RES_ICON[o.res]}>{o.amount}</IconVal>)}
                {tickOut && <IconVal src={RES_ICON[tickOut.res]}>{Math.floor(tickOut.amount)}</IconVal>}
                {stored != null && <IconVal src={RES_ICON.progress}>{stored}</IconVal>}
              </div>
            </div>
            {action && (
              <button
                type="button"
                className={`tc-action ${action.kind}${action.affordable ? '' : ' disabled'}`}
                disabled={!action.affordable}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); action.onClick() }}
                onMouseEnter={action.kind === 'upgrade' ? () => setPreview(true) : undefined}
                onMouseLeave={action.kind === 'upgrade' ? () => setPreview(false) : undefined}
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
      </div>
    </InfoTip>
  )
}
