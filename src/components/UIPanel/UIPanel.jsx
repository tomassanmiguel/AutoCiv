import { useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { ERA_INDEX } from '../../game/data/eras.js'
import {
  UNIT_CATEGORIES,
  BUILDING_CATEGORIES,
  POLICY_INFO,
  POPULATION_INFO,
} from '../../game/data/slots.js'
import { POP_TYPES, popTooltipText } from '../../game/data/pops.js'
import NineSlice from '../common/NineSlice.jsx'
import InfoTip from '../common/InfoTip.jsx'
import './UIPanel.css'

const ICON = {
  legitimacy: '/sprites/icons/legitimacy.png',
  gold: '/sprites/icons/gold.png',
  food: '/sprites/icons/food.png',
  production: '/sprites/icons/production.png',
  progress: '/sprites/icons/progress.png',
}

// 9-slice frames: light box wraps the whole panel, dark box wraps each dropdown.
const FRAME = { light: '/sprites/ui/box.png', dark: '/sprites/ui/box-dark.png' }
const FRAME_SLICE = 205 // border inset in source px (frames are 1254x1254)
const PANEL_BORDER = 40
const DROP_BORDER = 16

// Hover descriptions for the top resource section.
const RES_TIP = {
  legitimacy: 'A measure of the integrity of your civilization. Should this fall to zero, your civilization will collapse.',
  gold: 'A measure of the wealth of your civilization. Spend gold to repair damaged units and buildings, hire mercenaries, upgrade units and buildings, or create specialists.',
  food: 'A measure of the expansion of your civilization. Food will create new citizens and specialists to power your economy.',
  production: 'A measure of the industry of your civilization. Production will allow you to deploy new units and buildings.',
  progress: 'A measure of the ingenuity of your civilization. Progress will unlock new units, buildings, policies, and specialists.',
}

const fmtDelta = (n) => (n > 0 ? `+${n}` : `${n}`)

// --- Build the per-group list of slot descriptors ({ silhouette, label, description, occupant }) ---
function unitSlots(civ, era) {
  return UNIT_CATEGORIES
    .map((c, i) => ({ ...c, occupant: civ.units[i] }))
    .filter((c) => ERA_INDEX[c.unlock] <= era) // only categories unlocked this era
}
function buildingSlots(civ) {
  return BUILDING_CATEGORIES.map((c, i) => ({ ...c, occupant: civ.buildings[i] }))
}
function genericSlots(arr, info) {
  return arr.map((occupant) => ({ ...info, occupant }))
}
function populationSlots(civ) {
  return civ.population.map((key) =>
    key && POP_TYPES[key]
      ? { pop: POP_TYPES[key], count: civ.pops[key] ?? 0 }
      : { ...POPULATION_INFO },
  )
}

/** Right-hand civilization panel: resource readouts + item dropdowns. */
export default function UIPanel() {
  const game = useGame()
  const civ = game.data.civilization
  const era = game.era
  // Accordion: at most one group open at a time.
  const [openGroup, setOpenGroup] = useState('units')

  const groups = [
    { key: 'units', label: 'Units', slots: unitSlots(civ, era) },
    { key: 'buildings', label: 'Buildings', slots: buildingSlots(civ) },
    { key: 'policies', label: 'Policies', slots: genericSlots(civ.policies, POLICY_INFO) },
    { key: 'population', label: 'Population', slots: populationSlots(civ) },
  ]

  return (
    <NineSlice className="ui-panel" src={FRAME.light} slice={FRAME_SLICE} width={PANEL_BORDER}>
      <div className="resources">
        {/* Legitimacy — the civ's HP: a big centered scalar. */}
        <InfoTip title="Legitimacy" text={RES_TIP.legitimacy}>
          <div className="legitimacy">
            <img className="legit-icon" src={ICON.legitimacy} alt="Legitimacy" />
            <span className="legit-value">{civ.legitimacy.value}</span>
          </div>
        </InfoTip>

        {/* Gold — scalar on the left, per-tick delta on the right. */}
        <ResourceLine icon={ICON.gold} label="Gold" value={civ.gold.value} output={civ.gold.output} tip={RES_TIP.gold} />

        {/* Food / Production / Progress — progress bar toward threshold + delta. */}
        <ResourceBar icon={ICON.food} label="Food" res={civ.food} tip={RES_TIP.food} />
        <ResourceBar icon={ICON.production} label="Production" res={civ.production} tip={RES_TIP.production} />
        <ResourceBar icon={ICON.progress} label="Progress" res={civ.progress} tip={RES_TIP.progress} />
      </div>

      <div className="accordions">
        {groups.map((g) => (
          <Accordion
            key={g.key}
            label={g.label}
            slots={g.slots}
            open={openGroup === g.key}
            onToggle={() => setOpenGroup((cur) => (cur === g.key ? null : g.key))}
          />
        ))}
      </div>
    </NineSlice>
  )
}

function ResourceLine({ icon, label, value, output, tip }) {
  return (
    <InfoTip title={label} text={tip}>
      <div className="res-line">
        <img className="res-icon" src={icon} alt={label} />
        <span className="res-value">{value}</span>
        <span className="res-delta">{fmtDelta(output)}/t</span>
      </div>
    </InfoTip>
  )
}

function ResourceBar({ icon, label, res, tip }) {
  const span = res.threshold - res.floor
  const pct = span > 0 ? Math.min(100, ((res.value - res.floor) / span) * 100) : 0
  return (
    <InfoTip title={label} text={tip}>
      <div className="res-bar-row">
        <img className="res-icon" src={icon} alt={label} />
        <span className="res-level" title="Thresholds reached">{res.level}</span>
        <div className="res-bar-track">
          <div className="res-bar-fill" style={{ width: `${pct}%` }} />
          <span className="res-bar-label">{Math.floor(res.value - res.floor)}/{Math.ceil(span)}</span>
        </div>
        <span className="res-delta">{fmtDelta(res.output)}/t</span>
      </div>
    </InfoTip>
  )
}

function Accordion({ label, slots, open, onToggle }) {
  return (
    <NineSlice
      className={`accordion ${open ? 'open' : ''}`}
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
          {slots.map((s, i) =>
            s.pop ? (
              <PopCard key={i} pop={s.pop} count={s.count} />
            ) : (
              <SlotRow key={i} silhouette={s.silhouette} label={s.label} description={s.description} occupant={s.occupant} />
            ),
          )}
        </div>
      </div>
    </NineSlice>
  )
}

/**
 * A population pop card: name + output icons in the body, the type silhouette in
 * the top-right, and the count of that pop type on the far right. Hovering shows
 * a programmatic description of its per-tick output.
 */
function PopCard({ pop, count }) {
  return (
    <InfoTip className="pop-card" title={pop.name} text={popTooltipText(pop)}>
      <img className="pop-silhouette" src={pop.silhouette} alt="" />
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
    </InfoTip>
  )
}

/**
 * One large, full-width slot: a centered type silhouette. Hovering shows the
 * category name + description (the occupant's once filled, otherwise the
 * category's / the group's).
 */
function SlotRow({ silhouette, label, description, occupant }) {
  const src = occupant?.silhouette ?? silhouette
  const title = occupant?.name ?? label
  const desc = occupant?.description ?? description
  return (
    <InfoTip className={`slot-row ${occupant ? 'filled' : 'empty'}`} title={title} text={desc}>
      {src && <img className="slot-silhouette" src={src} alt={title} />}
    </InfoTip>
  )
}
