import { useState } from 'react'
import { ERAS, thresholdFor } from '../game/data/schema.js'
import { describeEffects } from '../game/data/describe-effect.js'
import EffectEditor from './EffectEditor.jsx'

/**
 * One table for all three entity types. The shape of each row comes from a
 * COLUMN SPEC (see App.jsx) rather than a bespoke component per type, so adding
 * a field to wonders is one line, not a new file.
 *
 * Effects are NOT edited inline — the row expands. A tech averages two effects
 * of fourteen fields each; that never fits in a cell, and pretending otherwise
 * is how editors become unusable.
 */
export default function DataTable({ rows, columns, problemsById, techOptions, onPatch, onRename, onDelete, onDuplicate }) {
  const [open, setOpen] = useState(null)

  return (
    <div className="ed-table-wrap">
      <table className="ed-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}>{c.label}</th>
            ))}
            <th style={{ width: 96 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const problems = problemsById.get(row.id) ?? []
            const isOpen = open === row.id
            return [
              <tr key={row.id} className={`${problems.length ? 'has-problem' : ''}${isOpen ? ' open' : ''}`}>
                {columns.map((c) => (
                  <td key={c.key}>
                    <Cell
                      col={c}
                      row={row}
                      techOptions={techOptions}
                      onPatch={onPatch}
                      onRename={onRename}
                      onToggle={() => setOpen(isOpen ? null : row.id)}
                      isOpen={isOpen}
                    />
                  </td>
                ))}
                <td className="ed-actions">
                  <button title="Duplicate" onClick={() => onDuplicate(row.id)}>⧉</button>
                  <button title="Delete" className="danger" onClick={() => {
                    if (confirm(`Delete "${row.name}"? This cannot be undone from here.`)) onDelete(row.id)
                  }}>✕</button>
                </td>
              </tr>,
              isOpen && (
                <tr key={`${row.id}-detail`} className="ed-detail-row">
                  <td colSpan={columns.length + 1}>
                    {problems.length > 0 && (
                      <ul className="ed-problem-list">
                        {problems.map((p) => <li key={p}>{p}</li>)}
                      </ul>
                    )}
                    <EffectEditor
                      effects={row.effects ?? []}
                      onChange={(effects) => onPatch(row.id, { effects })}
                    />
                    <div className="ed-id">id: <code>{row.id}</code></div>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className="ed-empty">Nothing matches these filters.</div>}
    </div>
  )
}

function Cell({ col, row, techOptions, onPatch, onRename, onToggle, isOpen }) {
  const v = row[col.key]

  switch (col.kind) {
    case 'icon':
      return (
        <label className="ed-icon-cell" title={v}>
          <img src={v} alt="" />
          <select value={v ?? ''} onChange={(e) => onPatch(row.id, { icon: e.target.value })}>
            {col.options.map((o) => <option key={o} value={o}>{o.split('/').pop().replace('.png', '')}</option>)}
          </select>
        </label>
      )

    case 'name':
      return (
        <input
          className="ed-name"
          value={v ?? ''}
          onChange={(e) => onRename(row.id, e.target.value)}
        />
      )

    case 'era':
      return (
        <select className="ed-sel" value={v ?? 0} onChange={(e) => onPatch(row.id, { era: Number(e.target.value) })}>
          {ERAS.map((e, i) => (
            <option key={e} value={i}>{i}. {e} (needs {thresholdFor(i)})</option>
          ))}
        </select>
      )

    case 'select':
      return (
        <select className="ed-sel" value={v ?? ''} onChange={(e) => onPatch(row.id, { [col.key]: e.target.value })}>
          <option value="">—</option>
          {col.options.map((o) => (
            <option key={o} value={o}>{col.labels?.[o] ?? o}</option>
          ))}
        </select>
      )

    case 'tech':
      return (
        <select className="ed-sel" value={v ?? ''} onChange={(e) => onPatch(row.id, { [col.key]: e.target.value })}>
          <option value="">—</option>
          {techOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )

    case 'techs':
      return <RequiresPicker value={v ?? []} options={techOptions} onChange={(next) => onPatch(row.id, { [col.key]: next })} />

    case 'effects':
      return (
        <button className={`ed-effects${isOpen ? ' on' : ''}`} onClick={onToggle}>
          <span className="ed-effects-text">
            {(v?.length ?? 0) === 0 ? <em>no effects — click to add</em> : describeEffects(v)}
          </span>
          <span className="ed-effects-n">{v?.length ?? 0}</span>
        </button>
      )

    default:
      return <span>{String(v ?? '')}</span>
  }
}

/**
 * Dependencies. A tech may require others; with a current-tier-only draft pool
 * a prerequisite from a LATER era can never be satisfied, so the picker sorts
 * by era and the validator rejects the backwards ones outright.
 */
function RequiresPicker({ value, options, onChange }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="ed-requires">
      {value.map((id) => {
        const opt = options.find((o) => o.value === id)
        return (
          <span key={id} className={`ed-req${opt ? '' : ' missing'}`}>
            {opt?.label.split(' · ')[0] ?? `${id} (missing)`}
            <button onClick={() => onChange(value.filter((x) => x !== id))}>✕</button>
          </span>
        )
      })}
      {adding ? (
        <select
          className="ed-sel"
          autoFocus
          defaultValue=""
          onBlur={() => setAdding(false)}
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value])
            setAdding(false)
          }}
        >
          <option value="">pick a tech…</option>
          {options.filter((o) => !value.includes(o.value)).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <button className="ed-req-add" onClick={() => setAdding(true)}>+</button>
      )}
    </div>
  )
}
