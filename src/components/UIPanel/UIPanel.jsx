import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { ERA_INDEX } from '../../game/data/eras.js'
import {
  UNIT_CATEGORIES,
  BUILDING_CATEGORIES,
  POLICY_INFO,
  POPULATION_INFO,
} from '../../game/data/slots.js'
import { UNIT_DEFS, unitStats, unitRole } from '../../game/data/units.js'
import { BUILDING_DEFS, buildingEffect, buildingHp, defOf } from '../../game/data/buildings.js'
import { POLICY_DEFS, policyEffect } from '../../game/data/policies.js'
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
  military: '/sprites/ui/defense.png',
  policies: '/sprites/ui/policy.png',
  population: '/sprites/ui/pop.png',
  wonder: '/sprites/ui/wonder.png',
}

// The Buildings roster is split across TWO tabs in the UI (one tab was too crowded): "Buildings"
// (economy) and "Military" (defense/trap/command/spawner). Both map to the SINGLE model group
// 'buildings' (civ.buildings stays one index-aligned array) — the split is purely presentational.
const MILITARY_BUILDING_KEYS = new Set(['defense', 'trap', 'command', 'spawner'])
const MILITARY_IDX = new Set(BUILDING_CATEGORIES.flatMap((c, i) => (MILITARY_BUILDING_KEYS.has(c.key) ? [i] : [])))
const buildingSubTab = (index) => (MILITARY_IDX.has(index) ? 'military' : 'buildings')
// Render-tab key → the model group it talks to (both building tabs and the wonder tab translate back).
const TAB_GROUP = { units: 'units', buildings: 'buildings', military: 'buildings', policies: 'policies', population: 'population', wonder: 'wonder' }

// Unit/building stat icons. v2: the first slot shows RANGE (Manhattan diamond); the
// speed icon is reused for it until a dedicated range icon exists. Atk = damage, Def = health.
const STAT_ICON = {
  speed: '/sprites/icons/speed.png',
  atk: '/sprites/icons/attack.png',
  def: '/sprites/icons/defense.png',
}
const STAT_LABEL = { speed: 'Range', atk: 'Attack', def: 'Defense' }

/** A row of stat icon+value pairs (Atk, Def). Utility units pass keys without 'atk'
 *  since they don't attack. Range is intentionally omitted from unit cards. */
function StatIcons({ stats, keys = ['atk', 'def'], className = 'slot-card-stats' }) {
  return (
    <span className={className}>
      {keys.map((k) => (
        <span key={k} className="stat">
          <img src={STAT_ICON[k]} alt={STAT_LABEL[k]} title={STAT_LABEL[k]} />
          {stats[k]}
        </span>
      ))}
    </span>
  )
}

const unitStatKeys = (def) => (unitRole(def) === 'utility' ? ['def'] : ['atk', 'def'])

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

// Per-tick output is shown rounded DOWN (outputs are floats internally, e.g. Slavery's
// ±% multipliers) — but to one decimal, so a small fractional rate (0.95) reads "+0.9",
// not "+0" while its bar visibly fills.
const fmtDelta = (n) => {
  const f = Math.floor(n * 10) / 10
  const s = Number.isInteger(f) ? String(f) : f.toFixed(1)
  return f > 0 ? `+${s}` : s
}

// Keyboard activation for the div-based (role="button") replace-candidate slots.
const activateKey = (e, fn) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn() }
}

// --- Build the per-group list of slot descriptors ---
// Each descriptor: { index, cat?, occupant, kind, silhouette, name, sub, line, tip }
// A category slot may hold several unlocked tiers — expose ◄ N ► to cycle the active one.
function slotCycle(game, group, index) {
  const n = game.rosterSlotOptions(group, index).length
  if (n <= 1) return null
  return { count: n, onPrev: () => game.cycleRosterSlot(group, index, -1), onNext: () => game.cycleRosterSlot(group, index, 1) }
}
function unitSlots(civ, era, hpBonus, game) {
  return UNIT_CATEGORIES.map((cat, index) => ({ cat, index, occ: civ.units[index] }))
    .filter((s) => ERA_INDEX[s.cat.unlock] <= era) // only categories unlocked this era
    .map(({ cat, index, occ }) => {
      if (!occ) return { index, kind: 'empty', silhouette: cat.silhouette, name: cat.label, tip: cat.description }
      const def = UNIT_DEFS[occ.key]
      return {
        index, kind: 'item', silhouette: cat.silhouette,
        name: def.name, sub: cat.label, stats: unitStats(def, occ.level, hpBonus), statKeys: unitStatKeys(def),
        tip: unitTip(def, occ.level, hpBonus), cycle: slotCycle(game, 'units', index),
      }
    })
}
// `which`: 'buildings' (economy categories) or 'military' (defense/trap/command/spawner). The
// descriptors keep their REAL civ.buildings index, so pick/replace/slam route unchanged.
function buildingSlots(civ, era, which = 'buildings', game) {
  return BUILDING_CATEGORIES
    .map((cat, index) => ({ cat, index }))
    .filter(({ index }) => (which === 'military' ? MILITARY_IDX.has(index) : !MILITARY_IDX.has(index)))
    .map(({ cat, index }) => {
      const sil = which === 'military' ? '/sprites/ui/unit.png' : cat.silhouette // Military reuses the unit icon for now
      const occ = civ.buildings[index]
      if (!occ) return { index, kind: 'empty', silhouette: sil, name: cat.label, tip: cat.description }
      const def = BUILDING_DEFS[occ.key]
      const eff = buildingEffect(def, occ.level, era) // current era/level value
      // Buildings show a Def stat; underlapping buildings (Road) have no HP, so no Def.
      const buildingDef = def.underlap ? null : buildingHp(def, occ.level, civ.modifiers.buildingHpBonus)
      return { index, kind: 'item', silhouette: sil, name: def.name, sub: cat.label, line: eff, tip: eff, def: buildingDef, cycle: slotCycle(game, 'buildings', index) }
    })
}
// The in-flight wonder as a single pickable slot (its own tab, shown only while a wonder is
// unlocked). Picking it during production PLACES it; once placed you click it on the map to
// advance. civ.wonder lives outside the fixed civ.buildings array, hence a synthetic slot.
function wonderSlots(civ) {
  if (!civ.wonder) return []
  const w = civ.wonder
  const def = defOf(w.key)
  const damaged = w.placed && w.inst?.damaged
  const line = !w.placed
    ? 'Choose it during production to place it.'
    : damaged
      ? 'Destroyed — repair it, then click it on the map to continue.'
      : `Placed — click it on the map to build (${w.buildsLeft} left).`
  return [{ index: 0, kind: 'item', silhouette: '/sprites/ui/wonder.png', name: def.name, sub: 'Wonder', line, tip: def.effect }]
}
function policySlots(civ) {
  return civ.policies.map((occ, index) => {
    if (!occ) return { index, kind: 'empty', silhouette: POLICY_INFO.silhouette, name: POLICY_INFO.label, tip: POLICY_INFO.description }
    const def = POLICY_DEFS[occ.key]
    const eff = policyEffect(def) // effect ?? description (early policies use `effect`, later use `description`)
    return { index, kind: 'item', silhouette: POLICY_INFO.silhouette, name: def.name, sub: def.type, line: eff, tip: eff }
  })
}
function populationSlots(civ, game, canConvert) {
  return civ.population.map((key, index) => {
    if (!key || !POP_TYPES[key]) {
      return { index, kind: 'empty', silhouette: POPULATION_INFO.silhouette, name: POPULATION_INFO.label, tip: POPULATION_INFO.description }
    }
    // Specialists can be bought (era+1 citizens -> this type) for gold.
    let convert = null
    let upgrade = null
    if (canConvert && POP_TYPES[key].specialist) {
      const info = game.specialistConvertInfo(key)
      convert = {
        count: info.count,
        cost: info.cost,
        enabled: info.enoughCitizens && info.canAfford,
        enoughCitizens: info.enoughCitizens,
        onClick: () => game.convertSpecialistWithGold(key),
      }
      // v2: upgrade this whole pop type up its chain (Astrologer → Scholar) for gold.
      const uinfo = game.specialistUpgradeInfo(key)
      if (uinfo) upgrade = { nextName: uinfo.nextName, cost: uinfo.cost, enabled: uinfo.canAfford, onClick: () => game.upgradeSpecialistChain(key) }
    }
    const flashSeq = game.data.popFx && game.data.popFx.key === key ? game.data.popFx.seq : 0
    // Effective per-pop output includes policy modifiers (e.g. Language → Citizen +1 progress).
    return { index, kind: 'pop', pop: POP_TYPES[key], outputs: game.popOutput(key), count: civ.pops[key] ?? 0, convert, upgrade, flashSeq }
  })
}

function unitTip(def, level, hpBonus) {
  const s = unitStats(def, level, hpBonus)
  return (
    <>
      <IconText>{def.description}</IconText>
      {def.ability ? <><br /><br /><strong>Ability:</strong> <IconText>{def.ability}</IconText></> : null}
      <br /><br />
      <StatIcons stats={s} keys={unitStatKeys(def)} className="tip-stats" />
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
  // Threshold-lowering modifiers (Basket Weaving/Plough → food, Alphabet → progress).
  const foodThresholdMult = civ.modifiers.foodThresholdMult
  const progressThresholdMult = civ.modifiers.progressThresholdMult

  // Side tabs: all four always visible; the active one's content fills the body.
  // A replace forces the relevant tab active; otherwise it's the player's choice.
  const [activeTab, setActiveTab] = useState('units')
  // A building replace forces the correct sub-tab (military vs economy) active.
  const effectiveTab = replacing
    ? (replacing.group === 'buildings'
        ? (replacing.candidates.every((i) => MILITARY_IDX.has(i)) ? 'military' : 'buildings')
        : replacing.group)
    : activeTab

  // When a roster slot is filled (advancement unlock), switch to its tab so the
  // fill "slam" animation is visible. A building routes to its sub-tab (economy vs military).
  const jf = game.data.justFilled
  const lastFillSeq = useRef(-1)
  useEffect(() => {
    if (jf && jf.seq !== lastFillSeq.current) {
      lastFillSeq.current = jf.seq
      setActiveTab(jf.group === 'buildings' ? buildingSubTab(jf.index) : jf.group)
    }
  }, [jf])

  // When a build PICK begins, jump to a pickable tab (Units) unless already on one.
  const wasPicking = useRef(false)
  useEffect(() => {
    if (buildPicking && !wasPicking.current && !['units', 'buildings', 'military', 'wonder'].includes(activeTab)) {
      setActiveTab('units')
    }
    wasPicking.current = buildPicking
  }, [buildPicking, activeTab])

  // The wonder slot is pickable (to PLACE it) only while it's unlocked, unplaced, and not destroyed.
  const wonderPickable = buildPicking && !!civ.wonder && !civ.wonder.placed && !civ.wonder.inst?.damaged

  const groups = [
    { key: 'units', label: 'Units', slots: unitSlots(civ, era, civ.modifiers.unitHpBonus, game) },
    { key: 'buildings', label: 'Buildings', slots: buildingSlots(civ, era, 'buildings', game) },
    { key: 'military', label: 'Military Infrastructure', slots: buildingSlots(civ, era, 'military', game) },
    ...(civ.wonder ? [{ key: 'wonder', label: 'Wonder', slots: wonderSlots(civ) }] : []),
    { key: 'policies', label: 'Policies', slots: policySlots(civ) },
    { key: 'population', label: 'Population', slots: populationSlots(civ, game, canConvert) },
  ]
  const active = groups.find((g) => g.key === effectiveTab) ?? groups[0]
  const isBuildTab = active.key === 'buildings' || active.key === 'military'
  // Replace candidates that belong to THIS building sub-tab (or the plain group for non-buildings).
  const activeCandidates = (() => {
    if (!replacing || TAB_GROUP[active.key] !== replacing.group) return null
    if (isBuildTab) {
      const filtered = replacing.candidates.filter((i) => buildingSubTab(i) === active.key)
      return filtered.length ? filtered : null
    }
    return replacing.candidates
  })()
  // The just-filled slot's slam plays only on the tab that actually owns that slot.
  const slamIdx = (() => {
    if (!jf || TAB_GROUP[active.key] !== jf.group) return -1
    if (isBuildTab && buildingSubTab(jf.index) !== active.key) return -1
    return jf.index
  })()

  return (
    <NineSlice className="ui-panel" src={FRAME.light} slice={FRAME_SLICE} width={PANEL_BORDER}>
      <div className="resources">
        <InfoTip title="Legitimacy" text={RES_TIP.legitimacy}>
          <div className="legitimacy">
            <img className="legit-icon" src={ICON.legitimacy} alt="Legitimacy" />
            <PulseNum className="legit-value" value={Math.floor(civ.legitimacy.value)} active={combat} />
            {civ.legitimacy.output > 0 && <span className="res-delta">{fmtDelta(civ.legitimacy.output)}/t</span>}
          </div>
        </InfoTip>

        <ResourceLine icon={ICON.gold} label="Gold" value={Math.floor(civ.gold.value)} output={civ.gold.output} tip={RES_TIP.gold} active={combat} />
        <ResourceBar icon={ICON.food} label="Food" res={civ.food} tip={RES_TIP.food} mult={foodThresholdMult} />
        <ResourceBar icon={ICON.production} label="Production" res={civ.production} tip={RES_TIP.production} />
        <ResourceBar icon={ICON.progress} label="Progress" res={civ.progress} tip={RES_TIP.progress} mult={progressThresholdMult} />
      </div>

      <div className="panel-tabbed">
        <div className="panel-tabs">
          {groups.map((g) => {
            const isActive = effectiveTab === g.key
            // During a build pick, highlight the pickable tabs (the wonder tab only while placeable).
            const pickHl = buildPicking && (['units', 'buildings', 'military'].includes(g.key) || (g.key === 'wonder' && wonderPickable))
            return (
              <InfoTip key={g.key} className="panel-tab-wrap" title={g.label}>
                <button
                  className={`panel-tab${isActive ? ' active' : ''}${pickHl ? ' pick-hl' : ''}`}
                  onClick={() => setActiveTab(g.key)}
                  aria-label={g.label}
                >
                  <img className="panel-tab-icon" src={TAB_ICON[g.key]} alt={g.label} />
                </button>
              </InfoTip>
            )
          })}
        </div>
        <NineSlice className="tab-body" src={FRAME.dark} slice={FRAME_SLICE} width={DROP_BORDER}>
          <SlotList
            slots={active.slots}
            candidates={activeCandidates}
            onReplace={(i) => game.resolveReplace(i)}
            pickable={active.key === 'wonder' ? wonderPickable : (buildPicking && ['units', 'buildings', 'military'].includes(active.key))}
            onPick={active.key === 'wonder' ? (() => game.pickWonder()) : ((i) => game.pickBuild(TAB_GROUP[active.key], i))}
            slamIndex={slamIdx}
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
          ? <PopCard key={key} pop={s.pop} outputs={s.outputs} count={s.count} mark={mark} onActivate={onActivate} convert={s.convert} upgrade={s.upgrade} flashSeq={s.flashSeq} slam={slam} />
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
          {slot.cycle && (
            <span className="slot-cycler" onMouseDown={(e) => e.stopPropagation()}>
              <button type="button" className="slot-cycle-btn" title="Previous tier"
                onClick={(e) => { e.stopPropagation(); slot.cycle.onPrev() }}>‹</button>
              <span className="slot-cycle-count" title="Unlocked tiers">{slot.cycle.count}</span>
              <button type="button" className="slot-cycle-btn" title="Next tier"
                onClick={(e) => { e.stopPropagation(); slot.cycle.onNext() }}>›</button>
            </span>
          )}
        </div>
        {slot.stats
          ? <StatIcons stats={slot.stats} keys={slot.statKeys} />
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
function PopCard({ pop, outputs = pop.outputs, count, mark, onActivate, convert, upgrade, flashSeq = 0, slam = false }) {
  const body = (
    <>
      <div className="pop-top">
        <div className="pop-main">
          <div className="pop-name">{pop.name}</div>
          <div className="pop-outputs">
            {Object.entries(outputs).map(([res, v]) => (
              <span key={res} className={`pop-output${v < 0 ? ' pop-output-neg' : ''}`}>
                <img src={ICON[res]} alt={res} />{v < 0 ? '' : '+'}{v}
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
      {upgrade && (
        <button
          type="button"
          className={`pop-convert pop-upgrade${upgrade.enabled ? '' : ' disabled'}`}
          disabled={!upgrade.enabled}
          onClick={(e) => { e.stopPropagation(); upgrade.onClick() }}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span className="pop-convert-label">▲ {upgrade.nextName}</span>
          <span className="pop-convert-cost"><img src={ICON.gold} alt="" />{upgrade.cost}</span>
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
