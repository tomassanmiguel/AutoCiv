import { useState, useMemo } from 'react'
import { ERAS, QUADRANTS, thresholdFor, PLACEMENTS, PLACEMENT_KEYS, WONDER_TIERS } from '../game/data/schema.js'
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
export default function DataTable({ rows, columns, problemsById, techOptions, readOnly, onRestore, onPatch, onRename, onDelete, onDuplicate }) {
  const [open, setOpen] = useState(null)
  // Default: era outward, then alphabetical inside an era — which is how you
  // read a draft pool, one tier at a time.
  const [sort, setSort] = useState({ key: 'era', dir: 1 })

  const sorted = useMemo(() => {
    const cmp = (a, b) => {
      const va = sortValue(a, sort.key)
      const vb = sortValue(b, sort.key)
      if (va < vb) return -sort.dir
      if (va > vb) return sort.dir
      // Era then QUADRANT then name: within one era you want the four pools
      // side by side, since a pool is what you actually draft from.
      if (sort.key !== 'quadrant') {
        const qa = QUADRANTS.indexOf(a.quadrant)
        const qb = QUADRANTS.indexOf(b.quadrant)
        if (qa !== qb) return qa - qb
      }
      return String(a.name).localeCompare(String(b.name))
    }
    return [...rows].sort(cmp)
  }, [rows, sort])

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: -s.dir } : { key, dir: 1 }))

  return (
    <div className="ed-table-wrap">
      <table className="ed-table">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={c.width ? { width: c.width } : undefined}
                className={c.kind === 'effects' || c.kind === 'icon' ? '' : 'sortable'}
                onClick={c.kind === 'effects' || c.kind === 'icon' ? undefined : () => toggleSort(c.key)}
              >
                {c.label}
                {sort.key === c.key && <span className="ed-sort">{sort.dir > 0 ? '▲' : '▼'}</span>}
              </th>
            ))}
            <th style={{ width: 96 }} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
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
                      readOnly={readOnly}
                      onPatch={onPatch}
                      onRename={onRename}
                      onToggle={() => setOpen(isOpen ? null : row.id)}
                      isOpen={isOpen}
                    />
                  </td>
                ))}
                <td className="ed-actions">
                  {onRestore ? (
                    <button className="ed-restore" title="Bring this back into scope"
                      onClick={() => onRestore(row.id)}>↩ restore</button>
                  ) : (
                    <>
                      <button title="Duplicate" onClick={() => onDuplicate(row.id)}>⧉</button>
                      <button title="Delete" className="danger" onClick={() => {
                        if (confirm(`Delete "${row.name}"? This cannot be undone from here.`)) onDelete(row.id)
                      }}>✕</button>
                    </>
                  )}
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

/** Sort keys that are not just the raw field. */
function sortValue(row, key) {
  const v = row[key]
  if (key === 'tier') return WONDER_TIERS.indexOf(v)
  // Declared order, not alphabetical — "economy" before "military" reads wrong.
  if (key === 'quadrant') return QUADRANTS.indexOf(v)
  if (Array.isArray(v)) return v.length ? v.join(',') : '￿' // empties last
  if (v === undefined || v === null || v === '') return '￿'
  return typeof v === 'number' ? v : String(v).toLowerCase()
}

function Cell({ col, row, techOptions, readOnly, onPatch, onRename, onToggle, isOpen }) {
  const v = row[col.key]

  // A parked row is shown, not edited — restore it first, so an edit can never
  // land on something that is not in the build.
  if (readOnly && col.kind !== 'effects') {
    if (col.kind === 'icon') return <span className="ed-icon-cell"><img src={v} alt="" /></span>
    if (col.kind === 'era') return <span className="ed-ro">{ERAS[v] ?? '—'}</span>
    return <span className="ed-ro">{Array.isArray(v) ? v.join(', ') : String(v ?? '—')}</span>
  }

  switch (col.kind) {
    case 'placements':
      return <PlacementPicker value={v ?? []} onChange={(next) => onPatch(row.id, { placement: next })} />

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
 * Where a building may go. MULTI-SELECT, because the rules compose: the
 * hydroelectric dam is coastal AND not adjacent to ocean, which a single enum
 * value could only express by inventing a member for every combination.
 * An empty list means anywhere you control.
 */
function PlacementPicker({ value, onChange }) {
  const [adding, setAdding] = useState(false)
  return (
    <div className="ed-requires">
      {value.length === 0 && !adding && <span className="ed-anywhere">anywhere</span>}
      {value.map((k) => (
        <span key={k} className={`ed-req${PLACEMENTS[k] ? '' : ' missing'}`} title={PLACEMENTS[k]}>
          {PLACEMENTS[k] ?? k}
          <button onClick={() => onChange(value.filter((x) => x !== k))}>✕</button>
        </span>
      ))}
      {adding ? (
        <select className="ed-sel" autoFocus defaultValue="" onBlur={() => setAdding(false)}
          onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); setAdding(false) }}>
          <option value="">add a rule…</option>
          {PLACEMENT_KEYS.filter((k) => !value.includes(k)).map((k) => (
            <option key={k} value={k}>{PLACEMENTS[k]}</option>
          ))}
        </select>
      ) : (
        <button className="ed-req-add" onClick={() => setAdding(true)}>+</button>
      )}
    </div>
  )
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
