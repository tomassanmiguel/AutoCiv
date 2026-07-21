import { useState } from 'react'
import { useGame } from '../../game/react/GameProvider.jsx'
import { UNIT_CATEGORIES, BUILDING_CATEGORIES } from '../../game/data/slots.js'
import './UIPanel.css'

const ICON = {
  legitimacy: '/sprites/icons/legitimacy.png',
  gold: '/sprites/icons/gold.png',
  food: '/sprites/icons/food.png',
  production: '/sprites/icons/production.png',
  progress: '/sprites/icons/progress.png',
}

// Units & Buildings have fixed per-slot categories (label + description);
// Policies & Population are generic slots for now.
const GROUPS = [
  { key: 'units', label: 'Units', categories: UNIT_CATEGORIES },
  { key: 'buildings', label: 'Buildings', categories: BUILDING_CATEGORIES },
  { key: 'policies', label: 'Policies', categories: null },
  { key: 'population', label: 'Population', categories: null },
]

const fmtDelta = (n) => (n > 0 ? `+${n}` : `${n}`)

/** Right-hand civilization panel: resource readouts + item dropdowns. */
export default function UIPanel() {
  const game = useGame()
  const civ = game.data.civilization
  // Accordion: at most one group open at a time.
  const [openGroup, setOpenGroup] = useState('units')

  return (
    <aside className="ui-panel">
      <div className="resources">
        {/* Legitimacy — the civ's HP: a big centered scalar. */}
        <div className="legitimacy">
          <img className="legit-icon" src={ICON.legitimacy} alt="Legitimacy" />
          <span className="legit-value">{civ.legitimacy.value}</span>
        </div>

        {/* Gold — scalar on the left, per-tick delta on the right. */}
        <ResourceLine icon={ICON.gold} label="Gold" value={civ.gold.value} output={civ.gold.output} />

        {/* Food / Production / Progress — progress bar toward threshold + delta. */}
        <ResourceBar icon={ICON.food} label="Food" res={civ.food} />
        <ResourceBar icon={ICON.production} label="Production" res={civ.production} />
        <ResourceBar icon={ICON.progress} label="Progress" res={civ.progress} />
      </div>

      <div className="accordions">
        {GROUPS.map((g) => (
          <Accordion
            key={g.key}
            label={g.label}
            categories={g.categories}
            slots={civ[g.key]}
            open={openGroup === g.key}
            onToggle={() => setOpenGroup((cur) => (cur === g.key ? null : g.key))}
          />
        ))}
      </div>
    </aside>
  )
}

function ResourceLine({ icon, label, value, output }) {
  return (
    <div className="res-line">
      <img className="res-icon" src={icon} alt={label} />
      <span className="res-value">{value}</span>
      <span className="res-delta">{fmtDelta(output)}/t</span>
    </div>
  )
}

function ResourceBar({ icon, label, res }) {
  const pct = res.threshold > 0 ? Math.min(100, (res.value / res.threshold) * 100) : 0
  return (
    <div className="res-bar-row">
      <img className="res-icon" src={icon} alt={label} />
      <div className="res-bar-track" title={`${res.value} / ${res.threshold}`}>
        <div className="res-bar-fill" style={{ width: `${pct}%` }} />
        <span className="res-bar-label">{res.value}/{res.threshold}</span>
      </div>
      <span className="res-delta">{fmtDelta(res.output)}/t</span>
    </div>
  )
}

function Accordion({ label, categories, slots, open, onToggle }) {
  const count = categories ? categories.length : slots.length
  return (
    <div className={`accordion ${open ? 'open' : ''}`}>
      <button className="accordion-header" onClick={onToggle}>
        <span className="accordion-caret">▸</span>
        <span className="accordion-label">{label}</span>
        <span className="accordion-count">{count}</span>
      </button>
      <div className="accordion-body">
        <div className="slot-list">
          {Array.from({ length: count }).map((_, i) => (
            <SlotRow key={i} category={categories?.[i]} occupant={slots[i]} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * One large, full-width slot. Shows its category label and a description of what
 * it does (the occupant's description once filled, otherwise the category's).
 */
function SlotRow({ category, occupant }) {
  const title = occupant?.name ?? category?.label ?? 'Empty slot'
  const description = occupant?.description ?? category?.description ?? ''
  const filled = !!occupant
  return (
    <div className={`slot-row ${filled ? 'filled' : 'empty'}`}>
      <div className="slot-row-head">
        <span className="slot-cat">{title}</span>
        <span className="slot-state">{filled ? '' : 'Empty'}</span>
      </div>
      {description && (
        <p className="slot-desc" title={description}>{description}</p>
      )}
    </div>
  )
}
