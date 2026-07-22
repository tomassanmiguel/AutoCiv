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
import { BUILDING_DEFS, buildingEffect, buildingHp } from '../../game/data/buildings.js'
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

// Side-tab icons (one per item group).
const TAB_ICON = {
  units: '/sprites/ui/unit.png',
  buildings: '/sprites/ui/building.png',
  policies: '/sprites/ui/policy.png',
  population: '/sprites/ui/pop.png',
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
    // Buildings show a Def stat; Supplements (Road) have no HP, so no Def.
    const buildingDef = def.supplement ? null : buildingHp(def, occ.level, civ.modifiers.buildingHpBonus)
    return { index, kind: 'item', silhouette: cat.silhouette, name: def.name, sub: cat.label, line: eff, tip: eff, def: buildingDef }
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
    // Effective per-pop output includes policy modifiers (e.g. Language → Citizen +1 progress).
    return { index, kind: 'pop', pop: POP_TYPES[key], outputs: game.popOutput(key), count: civ.pops[key] ?? 0, convert, flashSeq }
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
  // Basket Weaving / The Plough lower food thresholds — reflect that in the food bar.
  const foodThresholdMult = civ.modifiers.foodThresholdMult

  // Side tabs: all four always visible; the active one's content fills the body.
  // A replace forces the relevant tab active; otherwise it's the player's choice.
  const [activeTab, setActiveTab] = useState('units')
  const effectiveTab = replacing ? replacing.group : activeTab

  // When a roster slot is filled (advancement unlock), switch to its tab so the
  // fill "slam" animation is visible.
  const jf = game.data.justFilled
  const lastFillSeq = useRef(-1)
  useEffect(() => {
    if (jf && jf.seq !== lastFillSeq.current) {
      lastFillSeq.current = jf.seq
      setActiveTab(jf.group)
    }
  }, [jf])

  // When a build PICK begins, jump to a pickable tab (Units) if not already on one.
  const wasPicking = useRef(false)
  useEffect(() => {
    if (buildPicking && !wasPicking.current && activeTab !== 'units' && activeTab !== 'buildings') {
      setActiveTab('units')
    }
    wasPicking.current = buildPicking
  }, [buildPicking, activeTab])

  const groups = [
    { key: 'units', label: 'Units', slots: unitSlots(civ, era, civ.modifiers.unitHpBonus) },
    { key: 'buildings', label: 'Buildings', slots: buildingSlots(civ, era) },
    { key: 'policies', label: 'Policies', slots: policySlots(civ) },
    { key: 'population', label: 'Population', slots: populationSlots(civ, game, canConvert) },
  ]
  const active = groups.find((g) => g.key === effectiveTab) ?? groups[0]

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
        <ResourceBar icon={ICON.food} label="Food" res={civ.food} tip={RES_TIP.food} mult={foodThresholdMult} />
        <ResourceBar icon={ICON.production} label="Production" res={civ.production} tip={RES_TIP.production} />
        <ResourceBar icon={ICON.progress} label="Progress" res={civ.progress} tip={RES_TIP.progress} />
      </div>

      <div className="panel-tabbed">
        <div className="panel-tabs">
          {groups.map((g) => {
            const isActive = effectiveTab === g.key
            // During a build pick, highlight the pickable (Units/Buildings) tabs.
            const pickHl = buildPicking && (g.key === 'units' || g.key === 'buildings')
            return (
              <button
                key={g.key}
                className={`panel-tab${isActive ? ' active' : ''}${pickHl ? ' pick-hl' : ''}`}
                onClick={() => setActiveTab(g.key)}
                title={g.label}
                aria-label={g.label}
              >
                <img className="panel-tab-icon" src={TAB_ICON[g.key]} alt={g.label} />
              </button>
            )
          })}
        </div>
        <NineSlice className="tab-body" src={FRAME.dark} slice={FRAME_SLICE} width={DROP_BORDER}>
          <SlotList
            slots={active.slots}
            candidates={replacing && replacing.group === active.key ? replacing.candidates : null}
            onReplace={(i) => game.resolveReplace(i)}
            pickable={buildPicking && (active.key === 'units' || active.key === 'buildings')}
            onPick={(i) => game.pickBuild(active.key, i)}
            slamIndex={jf && jf.group === active.key ? jf.index : -1}
          />
        </NineSlice>
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

function ResourceBar({ icon, label, res, tip, mult = 1 }) {
  const threshold = res.threshold * mult // effective (e.g. Basket Weaving lowers food 5%)
  const pct = threshold > 0 ? Math.min(100, (res.value / threshold) * 100) : 0
  return (
    <InfoTip title={label} text={tip}>
      <div className="res-bar-row">
        <img className="res-icon" src={icon} alt={label} />
        <span className="res-level" title="Thresholds reached">{res.level}</span>
        <div className="res-bar-track">
          <div className="res-bar-fill" style={{ width: `${pct}%` }} />
          <span className="res-bar-label">{Math.floor(res.value)}/{Math.ceil(threshold)}</span>
        </div>
        <span className="res-delta">{fmtDelta(res.output)}/t</span>
      </div>
    </InfoTip>
  )
}

/** The active tab's slots. A slot's interactive `mark`: 'replace' (red) for a
 *  replace candidate, 'pick' (yellow) for a buildable item during production. */
function SlotList({ slots, candidates, onReplace, pickable, onPick, slamIndex = -1 }) {
  const candidateSet = candidates ? new Set(candidates) : null
  const markOf = (s) => {
    if (candidateSet && candidateSet.has(s.index)) return 'replace'
    if (pickable && s.kind === 'item') return 'pick'
    return null
  }
  const activate = (s, mark) => (mark === 'pick' ? () => onPick(s.index) : () => onReplace(s.index))
  return (
    <div className="slot-list">
      {slots.map((s) => {
        const mark = markOf(s)
        const onActivate = mark ? activate(s, mark) : null
        // Key by occupant identity so a slot REMOUNTS when it's filled/replaced,
        // replaying the fill "slam" animation (but not on stat/count changes).
        const key = s.kind === 'pop' ? `${s.index}:${s.pop.key}` : `${s.index}:${s.name ?? s.kind}`
        const slam = s.index === slamIndex // only the just-filled slot plays the "slam"
        return s.kind === 'pop'
          ? <PopCard key={key} pop={s.pop} outputs={s.outputs} count={s.count} mark={mark} onActivate={onActivate} convert={s.convert} flashSeq={s.flashSeq} slam={slam} />
          : <SlotRow key={key} slot={s} mark={mark} onActivate={onActivate} slam={slam} />
      })}
    </div>
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
          : <>
              {slot.def != null && (
                <span className="slot-card-stats">
                  <span className="stat"><img src={STAT_ICON.def} alt={STAT_LABEL.def} title={STAT_LABEL.def} />{slot.def}</span>
                </span>
              )}
              {slot.line && <div className="slot-card-line"><IconText>{slot.line}</IconText></div>}
            </>}
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
function PopCard({ pop, outputs = pop.outputs, count, mark, onActivate, convert, flashSeq = 0, slam = false }) {
  const body = (
    <>
      <div className="pop-top">
        <div className="pop-main">
          <div className="pop-name">{pop.name}</div>
          <div className="pop-outputs">
            {Object.entries(outputs).map(([res, v]) => (
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
      {popTooltipText({ outputs })}
      {pop.note && <><br /><br /><IconText>{pop.note}</IconText></>}
      <br /><br />
      <strong>Total ({count}):</strong> {popTotalSummary({ outputs }, count).join(', ')} per tick.
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
