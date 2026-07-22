import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { ERA_INDEX } from '../../game/data/eras.js'
import {
  UNIT_CATEGORIES,
  BUILDING_CATEGORIES,
  POLICY_INFO,
  POPULATION_INFO,
} from '../../game/data/slots.js'
import { UNIT_DEFS, unitStats } from '../../game/data/units.js'
import { BUILDING_DEFS, buildingEffect } from '../../game/data/buildings.js'
import { POLICY_DEFS } from '../../game/data/policies.js'
import { POP_TYPES, popTooltipText, popTotalSummary } from '../../game/data/pops.js'
import NineSlice from '../common/NineSlice.jsx'
import InfoTip from '../common/InfoTip.jsx'
import IconText from '../common/IconText.jsx'
import './UIPanel.css'

const ICON = {
  legitimacy: '/sprites/icons/legitimacy.png',
  gold: '/sprites/icons/gold.png',
  food: '/sprites/icons/food.png',
  production: '/sprites/icons/production.png',
  progress: '/sprites/icons/progress.png',
}

// Unit/building stat icons (Speed = cooldown, Atk = damage, Def = health).
const STAT_ICON = {
  speed: '/sprites/icons/speed.png',
  atk: '/sprites/icons/attack.png',
  def: '/sprites/icons/defense.png',
}
const STAT_LABEL = { speed: 'Speed', atk: 'Attack', def: 'Defense' }

/** A row of stat icon+value pairs (order: Speed, Atk, Def). */
function StatIcons({ stats, className = 'slot-card-stats' }) {
  return (
    <span className={className}>
      {['speed', 'atk', 'def'].map((k) => (
        <span key={k} className="stat">
          <img src={STAT_ICON[k]} alt={STAT_LABEL[k]} title={STAT_LABEL[k]} />
          {stats[k]}
        </span>
      ))}
    </span>
  )
}

// 9-slice frames: light box wraps the whole panel, dark box wraps each dropdown.
const FRAME = { light: '/sprites/ui/box.png', dark: '/sprites/ui/box-dark.png' }
const FRAME_SLICE = 205 // border inset in source px (frames are 1254x1254)
const PANEL_BORDER = 40
const DROP_BORDER = 16

// Hover descriptions for the top resource section.
const RES_TIP = {
  legitimacy: 'A measure of the integrity of your civilization. Should this fall to zero, your civilization will collapse.',
  gold: 'A measure of the wealth of your civilization. Spend :gold: to repair damaged units and buildings, hire mercenaries, upgrade units and buildings, or create specialists.',
  food: 'A measure of the expansion of your civilization. :food: will create new citizens and specialists to power your economy.',
  production: 'A measure of the industry of your civilization. :production: will allow you to deploy new units and buildings.',
  progress: 'A measure of the ingenuity of your civilization. :progress: will unlock new units, buildings, policies, and specialists.',
}

const fmtDelta = (n) => (n > 0 ? `+${n}` : `${n}`)

// Keyboard activation for the div-based (role="button") replace-candidate slots.
const activateKey = (e, fn) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() }
}

// --- Build the per-group list of slot descriptors ---
// Each descriptor: { index, cat?, occupant, kind, silhouette, name, sub, line, tip }
function unitSlots(civ, era, hpBonus) {
  return UNIT_CATEGORIES.map((cat, index) => ({ cat, index, occ: civ.units[index] }))
    .filter((s) => ERA_INDEX[s.cat.unlock] <= era) // only categories unlocked this era
    .map(({ cat, index, occ }) => {
      if (!occ) return { index, kind: 'empty', silhouette: cat.silhouette, name: cat.label, tip: cat.description }
      const def = UNIT_DEFS[occ.key]
      return {
        index, kind: 'item', silhouette: cat.silhouette,
        name: def.name, sub: cat.label, stats: unitStats(def, occ.level, hpBonus),
        tip: unitTip(def, occ.level, hpBonus),
      }
    })
}
function buildingSlots(civ, era) {
  return BUILDING_CATEGORIES.map((cat, index) => {
    const occ = civ.buildings[index]
    if (!occ) return { index, kind: 'empty', silhouette: cat.silhouette, name: cat.label, tip: cat.description }
    const def = BUILDING_DEFS[occ.key]
    const eff = buildingEffect(def, occ.level, era) // current era/level value
    return { index, kind: 'item', silhouette: cat.silhouette, name: def.name, sub: cat.label, line: eff, tip: eff }
  })
}
function policySlots(civ) {
  return civ.policies.map((occ, index) => {
    if (!occ) return { index, kind: 'empty', silhouette: POLICY_INFO.silhouette, name: POLICY_INFO.label, tip: POLICY_INFO.description }
    const def = POLICY_DEFS[occ.key]
    return { index, kind: 'item', silhouette: POLICY_INFO.silhouette, name: def.name, sub: def.type, line: def.effect, tip: def.effect }
  })
}
function populationSlots(civ, game, canConvert) {
  return civ.population.map((key, index) => {
    if (!key || !POP_TYPES[key]) {
      return { index, kind: 'empty', silhouette: POPULATION_INFO.silhouette, name: POPULATION_INFO.label, tip: POPULATION_INFO.description }
    }
    // Specialists can be bought (era+1 citizens -> this type) for gold.
    let convert = null
    if (canConvert && POP_TYPES[key].specialist) {
      const info = game.specialistConvertInfo(key)
      convert = {
        count: info.count,
        cost: info.cost,
        enabled: info.enoughCitizens && info.canAfford,
        enoughCitizens: info.enoughCitizens,
        onClick: () => game.convertSpecialistWithGold(key),
      }
    }
    const flashSeq = game.data.popFx && game.data.popFx.key === key ? game.data.popFx.seq : 0
    return { index, kind: 'pop', pop: POP_TYPES[key], count: civ.pops[key] ?? 0, convert, flashSeq }
  })
}

function unitTip(def, level, hpBonus) {
  const s = unitStats(def, level, hpBonus)
  return (
    <>
      <IconText>{def.description}</IconText>
      {def.ability ? <><br /><br /><strong>Ability:</strong> <IconText>{def.ability}</IconText></> : null}
      <br /><br />
      <StatIcons stats={s} className="tip-stats" />
      <span className="stat-lv"> · Lv {level}</span>
    </>
  )
}

/** Right-hand civilization panel: resource readouts + item dropdowns. */
export default function UIPanel() {
  const game = useGame()
  const civ = game.data.civilization
  const era = game.era
  const sel = game.data.selection
  const replacing = sel && sel.type === 'progress' && sel.stage === 'replace' ? sel.pending : null
  const buildPicking = !!(sel && sel.type === 'production' && sel.stage === 'pick')
  const phase = game.data.phase
  const combat = phase === 'battle' // pulse gold/legitimacy as they change
  // Specialist gold-conversion is offered during development + preparation.
  const canConvert = !sel && (phase === 'development' || phase === 'prep') && !game.data.won && !game.data.defeated

  // Accordion: at most one group open at a time. Replace mode forces the relevant
  // group open; otherwise the player's chosen group (or none).
  const [openGroup, setOpenGroup] = useState('units')
  const effectiveOpen = replacing ? replacing.group : openGroup

  // When a roster slot is filled (advancement unlock), open its tab so the
  // fill "slam" animation is visible.
  const jf = game.data.justFilled
  const lastFillSeq = useRef(-1)
  useEffect(() => {
    if (jf && jf.seq !== lastFillSeq.current) {
      lastFillSeq.current = jf.seq
      setOpenGroup(jf.group)
    }
  }, [jf])

  // When a build PICK begins, default to a pickable group (Units) so its yellow
  // slots are visible; the player can still collapse and switch to Buildings.
  const wasPicking = useRef(false)
  useEffect(() => {
    if (buildPicking && !wasPicking.current && openGroup !== 'units' && openGroup !== 'buildings') {
      setOpenGroup('units')
    }
    wasPicking.current = buildPicking
  }, [buildPicking, openGroup])

  const groups = [
    { key: 'units', label: 'Units', slots: unitSlots(civ, era, civ.modifiers.unitHpBonus) },
    { key: 'buildings', label: 'Buildings', slots: buildingSlots(civ, era) },
    { key: 'policies', label: 'Policies', slots: policySlots(civ) },
    { key: 'population', label: 'Population', slots: populationSlots(civ, game, canConvert) },
  ]

  // While a group is expanded, HIDE the other three entirely so the open group
  // claims the whole area and its cards fit (collapse it via its header to bring
  // the tabs back). Applies during a build pick too — collapse to switch groups.
  const soloOpen = !!effectiveOpen

  return (
    <NineSlice className="ui-panel" src={FRAME.light} slice={FRAME_SLICE} width={PANEL_BORDER}>
      <div className="resources">
        <InfoTip title="Legitimacy" text={RES_TIP.legitimacy}>
          <div className="legitimacy">
            <img className="legit-icon" src={ICON.legitimacy} alt="Legitimacy" />
            <PulseNum className="legit-value" value={civ.legitimacy.value} active={combat} />
          </div>
        </InfoTip>

        <ResourceLine icon={ICON.gold} label="Gold" value={Math.floor(civ.gold.value)} output={civ.gold.output} tip={RES_TIP.gold} active={combat} />
        <ResourceBar icon={ICON.food} label="Food" res={civ.food} tip={RES_TIP.food} />
        <ResourceBar icon={ICON.production} label="Production" res={civ.production} tip={RES_TIP.production} />
        <ResourceBar icon={ICON.progress} label="Progress" res={civ.progress} tip={RES_TIP.progress} />
      </div>

      <div className="accordions">
        {groups.map((g) => {
          const isOpen = effectiveOpen === g.key
          if (soloOpen && !isOpen) return null // hide the other dropdowns while one is expanded
          return (
            <Accordion
              key={g.key}
              label={g.label}
              slots={g.slots}
              open={isOpen}
              onToggle={() => setOpenGroup((cur) => (cur === g.key ? null : g.key))}
              candidates={replacing && replacing.group === g.key ? replacing.candidates : null}
              onReplace={(i) => game.resolveReplace(i)}
              pickable={buildPicking && (g.key === 'units' || g.key === 'buildings')}
              onPick={(i) => game.pickBuild(g.key, i)}
              slamIndex={jf && jf.group === g.key ? jf.index : -1}
            />
          )
        })}
      </div>
    </NineSlice>
  )
}

// A number that pulses (remounts, replaying the CSS pulse) each time it changes
// while `active` — used for gold/legitimacy during combat.
function PulseNum({ value, active, className = '' }) {
  return <span key={active ? value : 'static'} className={`${className}${active ? ' pulse-change' : ''}`}>{value}</span>
}

function ResourceLine({ icon, label, value, output, tip, active }) {
  return (
    <InfoTip title={label} text={tip}>
      <div className="res-line">
        <img className="res-icon" src={icon} alt={label} />
        <PulseNum className="res-value" value={value} active={active} />
        <span className="res-delta">{fmtDelta(output)}/t</span>
      </div>
    </InfoTip>
  )
}

function ResourceBar({ icon, label, res, tip }) {
  const pct = res.threshold > 0 ? Math.min(100, (res.value / res.threshold) * 100) : 0
  return (
    <InfoTip title={label} text={tip}>
      <div className="res-bar-row">
        <img className="res-icon" src={icon} alt={label} />
        <span className="res-level" title="Thresholds reached">{res.level}</span>
        <div className="res-bar-track">
          <div className="res-bar-fill" style={{ width: `${pct}%` }} />
          <span className="res-bar-label">{Math.floor(res.value)}/{Math.ceil(res.threshold)}</span>
        </div>
        <span className="res-delta">{fmtDelta(res.output)}/t</span>
      </div>
    </InfoTip>
  )
}

function Accordion({ label, slots, open, onToggle, candidates, onReplace, pickable, onPick, slamIndex = -1 }) {
  // Closed groups collapse to a slim clickable tab so the OPEN group's framed body
  // can claim (almost) the whole panel height — every card then has room to fit.
  if (!open) {
    return (
      <button className="accordion-tab" onClick={onToggle}>
        <span className="accordion-caret">▸</span>
        <span className="accordion-label">{label}</span>
      </button>
    )
  }

  const candidateSet = candidates ? new Set(candidates) : null
  // A slot's interactive mark: 'replace' (red) for a replace candidate, 'pick'
  // (yellow) for a buildable item during production. Empty slots never mark.
  const markOf = (s) => {
    if (candidateSet && candidateSet.has(s.index)) return 'replace'
    if (pickable && s.kind === 'item') return 'pick'
    return null
  }
  const activate = (s, mark) => (mark === 'pick' ? () => onPick(s.index) : () => onReplace(s.index))
  return (
    <NineSlice
      className="accordion open"
      src={FRAME.dark}
      slice={FRAME_SLICE}
      width={DROP_BORDER}
    >
      <button className="accordion-header" onClick={onToggle}>
        <span className="accordion-caret">▸</span>
        <span className="accordion-label">{label}</span>
      </button>
      <div className="accordion-body">
        <div className="slot-list">
          {slots.map((s) => {
            const mark = markOf(s)
            const onActivate = mark ? activate(s, mark) : null
            // Key by occupant identity so a slot REMOUNTS when it's filled/replaced,
            // replaying the fill "slam" animation (but not on stat/count changes).
            const key = s.kind === 'pop' ? `${s.index}:${s.pop.key}` : `${s.index}:${s.name ?? s.kind}`
            const slam = s.index === slamIndex // only the just-filled slot plays the "slam"
            return s.kind === 'pop'
              ? <PopCard key={key} pop={s.pop} count={s.count} mark={mark} onActivate={onActivate} convert={s.convert} flashSeq={s.flashSeq} slam={slam} />
              : <SlotRow key={key} slot={s} mark={mark} onActivate={onActivate} slam={slam} />
          })}
        </div>
      </div>
    </NineSlice>
  )
}

/**
 * One slot. Empty -> centered category silhouette. Filled -> a compact item card
 * (name + type + stat/effect line) with the full description on hover. `mark`
 * ('replace' = red / 'pick' = yellow) makes it flash and become clickable.
 */
function SlotRow({ slot, mark, onActivate, slam = false }) {
  const filled = slot.kind === 'item'
  const inner = filled ? (
    <div className={`slot-card${slam ? ' slam' : ''}`}>
      <div className="slot-card-body">
        {/* Type shown as an ICON next to the name (no "MELEE"/"POLICY" text). */}
        <div className="slot-card-head">
          {slot.silhouette && <img className="slot-card-type" src={slot.silhouette} alt="" />}
          <span className="slot-card-name">{slot.name}</span>
        </div>
        {slot.stats
          ? <StatIcons stats={slot.stats} />
          : slot.line && <div className="slot-card-line"><IconText>{slot.line}</IconText></div>}
      </div>
    </div>
  ) : (
    slot.silhouette && <img className="slot-silhouette" src={slot.silhouette} alt={slot.name} />
  )

  if (mark) {
    // Keep the tooltip (so the player sees the item) and support keyboard
    // activation, while flashing + clickable.
    return (
      <InfoTip
        className={`slot-row filled ${mark}-target`}
        title={slot.name}
        text={slot.tip}
        onClick={onActivate}
        onKeyDown={(e) => activateKey(e, onActivate)}
        role="button"
        tabIndex={0}
      >
        {inner}
      </InfoTip>
    )
  }
  return (
    <InfoTip className={`slot-row ${filled ? 'filled' : 'empty'}`} title={slot.name} text={slot.tip}>
      {inner}
    </InfoTip>
  )
}

/**
 * A population pop card: name + per-pop output icons and the count. Hover shows
 * per-pop and total output. A replacement candidate (`mark`) flashes and is
 * clickable. Specialists carry a `convert` button (spend gold to turn era+1
 * citizens into this type); `flashSeq` replays a green flash when just converted.
 */
function PopCard({ pop, count, mark, onActivate, convert, flashSeq = 0, slam = false }) {
  const body = (
    <>
      <div className="pop-top">
        <div className="pop-main">
          <div className="pop-name">{pop.name}</div>
          <div className="pop-outputs">
            {Object.entries(pop.outputs).map(([res, v]) => (
              <span key={res} className="pop-output">
                <img src={ICON[res]} alt={res} />+{v}
              </span>
            ))}
          </div>
        </div>
        <div className="pop-count">{count}</div>
      </div>
      {convert && (
        <button
          type="button"
          className={`pop-convert${convert.enabled ? '' : ' disabled'}`}
          disabled={!convert.enabled}
          onClick={(e) => { e.stopPropagation(); convert.onClick() }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span className="pop-convert-label">Convert +{convert.count}</span>
          <span className="pop-convert-cost"><img src={ICON.gold} alt="" />{convert.cost}</span>
        </button>
      )}
      {flashSeq ? <span key={flashSeq} className="pop-flash-overlay" /> : null}
    </>
  )

  const tip = (
    <>
      {popTooltipText(pop)}
      <br /><br />
      <strong>Total ({count}):</strong> {popTotalSummary(pop, count).join(', ')} per tick.
      {convert && (
        <><br /><br /><strong>Convert:</strong> {convert.count} citizen{convert.count === 1 ? '' : 's'} → {pop.name} for {convert.cost} gold
          {convert.enoughCitizens ? '' : ' (need more citizens)'}.</>
      )}
    </>
  )

  if (mark) {
    return (
      <InfoTip
        className={`pop-card ${mark}-target${slam ? ' slam' : ''}`}
        title={pop.name}
        text={tip}
        onClick={onActivate}
        onKeyDown={(e) => activateKey(e, onActivate)}
        role="button"
        tabIndex={0}
      >
        {body}
      </InfoTip>
    )
  }
  return <InfoTip className={`pop-card${slam ? ' slam' : ''}`} title={pop.name} text={tip}>{body}</InfoTip>
}
