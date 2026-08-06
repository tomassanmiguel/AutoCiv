import { useState, useMemo } from 'react'
import {
  ERAS, QUADRANTS, thresholdFor, PLACEMENTS, PLACEMENT_KEYS, WONDER_TIERS,
  ICON_TOKEN_KEYS, unknownTokens,
} from '../game/data/schema.js'
import Tokens from './Tokens.jsx'

/**
 * One table for every entity type. The shape of each row comes from a COLUMN
 * SPEC (see App.jsx) rather than a bespoke component per type, so adding a field
 * to wonders is one line, not a new file.
 *
 * The row expands to author the DESCRIPTION — a long piece of prose with
 * `:token:` icon markup never fits in a cell, and the preview needs room.
 */
export default function DataTable({ rows, totalRows, columns, problemsById, techOptions, groupOptions, readOnly, onRestore, onPatch, onRename, onDelete, onDuplicate }) {
  const [open, setOpen] = useState(null)
  // Default: era outward, then branch, then alphabetical — how you read a draft
  // pool, one tier at a time.
  const [sort, setSort] = useState({ key: 'era', dir: 1 })

  const sorted = useMemo(() => {
    const cmp = (a, b) => {
      const va = sortValue(a, sort.key)
      const vb = sortValue(b, sort.key)
      if (va < vb) return -sort.dir
      if (va > vb) return sort.dir
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
            {columns.map((c) => {
              const sortable = c.kind !== 'icon'
              return (
                <th
                  key={c.key}
                  style={c.width ? { width: c.width } : undefined}
                  className={sortable ? 'sortable' : ''}
                  onClick={sortable ? () => toggleSort(c.key) : undefined}
                >
                  {c.label}
                  {sort.key === c.key && <span className="ed-sort">{sort.dir > 0 ? '▲' : '▼'}</span>}
                </th>
              )
            })}
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
                      groupOptions={groupOptions}
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
                      <ul className="ed-problem-list">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
                    )}
                    <DescriptionEditor
                      row={row}
                      readOnly={readOnly}
                      onChange={(description) => onPatch(row.id, { description })}
                    />
                    <div className="ed-id">id: <code>{row.id}</code></div>
                  </td>
                </tr>
              ),
            ]
          })}
        </tbody>
      </table>
      {/* An empty POOL and an empty FILTER RESULT are different problems, and
          telling you the wrong one sends you hunting for a filter that isn't set. */}
      {rows.length === 0 && (
        <div className="ed-empty">
          {totalRows === 0
            ? <>This pool is empty. Add one with <b>+ New</b>, or bring one back from the <b>Backlog</b>.</>
            : 'Nothing matches these filters.'}
        </div>
      )}
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

/**
 * The description, with a live rendering beneath it. You author against the
 * RENDERED line, not the raw markup — an unknown `:token:` shows up red there
 * rather than being discovered later in the game.
 */
function DescriptionEditor({ row, readOnly, onChange }) {
  const [draft, setDraft] = useState(row.description ?? '')
  const bad = unknownTokens(draft)
  const commit = () => { if (draft !== row.description) onChange(draft) }

  return (
    <div className="ed-desc">
      <label className="ed-desc-label">Description</label>
      <textarea
        className="ed-desc-input"
        value={draft}
        readOnly={readOnly}
        rows={3}
        placeholder="What does this do? Use :gold: :food: :melee: … for icons."
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
      <div className="ed-desc-preview"><Tokens>{draft}</Tokens></div>
      {bad.length > 0 && (
        <div className="ed-desc-bad">unknown icon token{bad.length > 1 ? 's' : ''}: {bad.map((t) => `:${t}:`).join(' ')}</div>
      )}
      {!readOnly && (
        <div className="ed-desc-tokens">
          {ICON_TOKEN_KEYS.map((t) => (
            <button key={t} title={`insert :${t}:`}
              onClick={() => setDraft((d) => `${d}${d && !d.endsWith(' ') ? ' ' : ''}:${t}:`)}>
              <Tokens>{`:${t}:`}</Tokens>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Cell({ col, row, techOptions, groupOptions, readOnly, onPatch, onRename, onToggle, isOpen }) {
  const v = row[col.key]

  // A parked row is shown, not edited — restore it first, so an edit can never
  // land on something that is not in the build.
  if (readOnly && col.kind !== 'description') {
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
      return <NameCell row={row} onRename={onRename} />

    case 'era':
      return (
        <select className="ed-sel" value={v ?? 0} onChange={(e) => onPatch(row.id, { era: Number(e.target.value) })}>
          {ERAS.map((e, i) => <option key={e} value={i}>{i}. {e} (needs {thresholdFor(i)})</option>)}
        </select>
      )

    case 'select':
      return (
        <select className="ed-sel" value={v ?? ''} onChange={(e) => onPatch(row.id, { [col.key]: e.target.value })}>
          <option value="">—</option>
          {col.options.map((o) => <option key={o} value={o}>{col.labels?.[o] ?? o}</option>)}
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

    // A group is a set of mutually exclusive techs — take one and the rest are
    // shut out. Free text with suggestions, so making a new one is one word.
    case 'group':
      return (
        <>
          <input className="ed-name" list="ed-groups" value={v ?? ''} placeholder="—"
            onChange={(e) => onPatch(row.id, { group: e.target.value })} />
          <datalist id="ed-groups">
            {groupOptions.map((g) => <option key={g} value={g} />)}
          </datalist>
        </>
      )

    case 'description':
      return (
        <button className={`ed-effects${isOpen ? ' on' : ''}`} onClick={onToggle}>
          <span className="ed-effects-text">
            {v?.trim() ? <Tokens>{v}</Tokens> : <em>no description — click to write one</em>}
          </span>
        </button>
      )

    default:
      return <span>{String(v ?? '')}</span>
  }
}

/**
 * The name field, which COMMITS ON BLUR rather than on every keystroke.
 *
 * ⚠️ Renaming rewrites the row's id, and the id is the React key. Committing per
 * keystroke changed the key on every character, unmounting and remounting the
 * row — so the input lost focus and you could type one letter at a time.
 */
function NameCell({ row, onRename }) {
  const [draft, setDraft] = useState(row.name ?? '')
  const commit = () => { if (draft !== row.name) onRename(row.id, draft) }
  return (
    <input
      className="ed-name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') { setDraft(row.name ?? ''); e.currentTarget.blur() }
      }}
    />
  )
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
        <select className="ed-sel" autoFocus defaultValue="" onBlur={() => setAdding(false)}
          onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]); setAdding(false) }}>
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
