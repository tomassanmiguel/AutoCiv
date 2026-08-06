import { useState, useMemo } from 'react'
import {
  ERAS, QUADRANTS, thresholdFor, PLACEMENTS, PLACEMENT_KEYS, WONDER_TIERS,
  ICON_TOKEN_KEYS, unknownTokens,
  EFFECT_KINDS, EFFECT_KEYS, blankEffect, describeEffect, describeEffects,
  TERRAIN_KEYS, TERRAIN_GROUPS, TERRAIN_GROUP_NAMES, terrainLabel,
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
export default function DataTable({ rows, totalRows, columns, problemsById, techOptions, groupOptions, readOnly, detail = 'description', fixedRows = false, onRestore, onPatch, onRename, onDelete, onDuplicate }) {
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
                  {/* A fixed-set table (the unit classes) has no add, duplicate
                      or delete: the engine indexes those rows by key. */}
                  {fixedRows ? null : onRestore ? (
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
                    {/* A unit CLASS has terrain sets instead of effects: it is a
                        stat line the techs modify, not a thing that fires. */}
                    {detail === 'unitClass' ? (
                      <div className="ed-terr-pair">
                        <div>
                          <label className="ed-desc-label">Placement — where it may be created</label>
                          <TerrainPicker
                            value={row.placement}
                            readOnly={readOnly}
                            onChange={(placement) => onPatch(row.id, { placement })}
                          />
                        </div>
                        <div>
                          <label className="ed-desc-label">
                            Movement — where it may stand and walk
                            {(row.movement ?? []).length === 0 && <em> · empty means it never moves</em>}
                          </label>
                          <TerrainPicker
                            value={row.movement}
                            readOnly={readOnly}
                            onChange={(movement) => onPatch(row.id, { movement })}
                          />
                        </div>
                      </div>
                    ) : (
                      <EffectEditor
                        row={row}
                        readOnly={readOnly}
                        onChange={(effects) => onPatch(row.id, { effects })}
                      />
                    )}
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

/**
 * WHAT THE ROW ACTUALLY DOES, as opposed to what its description claims.
 *
 * The list of kinds and their inputs comes straight from `EFFECT_KINDS`, so a
 * new mechanic needs no work here — but a kind only exists in that registry
 * because the engine has a case for it, which is what stops the editor
 * authoring effects that silently do nothing.
 *
 * The generated sentence under the list is the DRIFT CHECK: if it does not match
 * the description above it, one of the two is lying to the player.
 */
function EffectEditor({ row, readOnly, onChange }) {
  const effects = row.effects ?? []
  const patch = (i, p) => onChange(effects.map((e, n) => (n === i ? { ...e, ...p } : e)))

  return (
    <div className="ed-fx">
      <label className="ed-desc-label">Effects</label>

      {effects.length === 0 && (
        <div className="ed-fx-none">
          No effects — this row is written down but does nothing in game.
        </div>
      )}

      {effects.map((e, i) => {
        const spec = EFFECT_KINDS[e.kind]
        return (
          <div key={i} className={`ed-fx-row${spec ? '' : ' bad'}`}>
            <select
              className="ed-sel"
              value={e.kind}
              disabled={readOnly}
              onChange={(ev) => onChange(effects.map((x, n) => (n === i ? blankEffect(ev.target.value) : x)))}
            >
              {!spec && <option value={e.kind}>⚠ {e.kind} (unknown)</option>}
              {EFFECT_KEYS.map((k) => (
                <option key={k} value={k}>{EFFECT_KINDS[k].label}</option>
              ))}
            </select>

            {/* Three param shapes: a bool checkbox, an options choice, or a
                number. The registry declares which; nothing here is bespoke. */}
            {(spec?.params ?? []).map((p) => (
              <label key={p.key} className={`ed-fx-param${p.type === 'bool' ? ' bool' : ''}`}>
                {p.type === 'bool' ? (
                  <>
                    <input
                      type="checkbox"
                      checked={!!e[p.key]}
                      disabled={readOnly}
                      onChange={(ev) => patch(i, { [p.key]: ev.target.checked })}
                    />
                    {p.label}
                  </>
                ) : p.options ? (
                  <>
                    {p.label}
                    <select
                      className="ed-sel"
                      value={e[p.key] ?? ''}
                      disabled={readOnly}
                      onChange={(ev) => patch(i, { [p.key]: ev.target.value })}
                    >
                      {p.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    {p.label}
                    <input
                      type="number"
                      min={p.min}
                      value={e[p.key] ?? ''}
                      readOnly={readOnly}
                      onChange={(ev) => patch(i, { [p.key]: Number(ev.target.value) })}
                    />
                  </>
                )}
              </label>
            ))}
            {/* An effect with no params (e.g. a flag) still needs to read as a
                real, complete row. */}
            {spec && spec.params.length === 0 && <span className="ed-fx-flag">no settings</span>}

            <span className="ed-fx-says"><Tokens>{describeEffect(e)}</Tokens></span>
            {!readOnly && (
              <button className="danger" title="Remove"
                onClick={() => onChange(effects.filter((_, n) => n !== i))}>✕</button>
            )}
          </div>
        )
      })}

      {!readOnly && (
        <button className="ed-req-add" onClick={() => onChange([...effects, blankEffect()])}>
          + effect
        </button>
      )}

      {effects.length > 0 && (
        <div className="ed-fx-check">
          in game this reads: <b><Tokens>{describeEffects(row)}</Tokens></b>
        </div>
      )}
      <EffectHints effects={effects} />
    </div>
  )
}

/** The hint for whichever kinds are in use — one line each, not a manual. */
function EffectHints({ effects }) {
  const hints = [...new Set(effects.map((e) => EFFECT_KINDS[e.kind]?.hint).filter(Boolean))]
  if (!hints.length) return null
  return <div className="ed-fx-hint">{hints.map((h) => <div key={h}><Tokens>{h}</Tokens></div>)}</div>
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

    // A plain label that does NOT rewrite the row's id — for rows whose id is
    // fixed by the engine (the unit classes).
    case 'text':
      return (
        <input
          className="ed-name"
          value={v ?? ''}
          readOnly={readOnly}
          onChange={(e) => onPatch(row.id, { [col.key]: e.target.value })}
        />
      )

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

    // WIRED or not, at a glance. A pool being rebuilt one tech at a time is
    // mostly unwired, and which rows the engine can actually run is the single
    // most useful thing to see without opening every row.
    case 'wired': {
      const n = (row.effects ?? []).length
      return (
        <button className={`ed-wired${n ? ' on' : ''}`} onClick={onToggle} title={n ? describeEffects(row) : 'no effects'}>
          {n ? `⚡ ${n}` : '—'}
        </button>
      )
    }

    // A base stat. Kept as a plain number cell rather than a stepper: these get
    // swept in a balance pass, and typing a value beats clicking to it.
    case 'stat':
      return (
        <input
          className="ed-stat"
          type="number"
          min={0}
          value={v ?? 0}
          readOnly={readOnly}
          onChange={(e) => onPatch(row.id, { [col.key]: Number(e.target.value) })}
        />
      )

    // The terrain sets are far too wide for a cell, so this is a COUNT that
    // opens the row. "never moves" is called out because 0 is a real, correct
    // value for a fortification and reads as an error otherwise.
    case 'terrain': {
      const n = (v ?? []).length
      const never = n === 0 && col.key === 'movement'
      return (
        <button
          className={`ed-terr-cell${isOpen ? ' on' : ''}${never ? ' never' : ''}`}
          onClick={onToggle}
          title={n ? (v ?? []).map(terrainLabel).join(', ') : 'nothing selected'}
        >
          {never ? 'never moves' : `${n} terrain`}
        </button>
      )
    }

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
 * A SET OF TERRAIN — what a unit class may be created on, or move over.
 *
 * The full checklist is the truth and always visible: with thirty terrains and
 * two independent sets per class, a summary chip would hide exactly the detail
 * you opened the row to check.
 *
 * The GROUP buttons above it are shortcuts, nothing more. A group is never
 * stored — clicking one ticks or unticks its boxes and what gets saved is the
 * explicit list, so redefining a group later cannot silently redefine content
 * already authored against it. A group whose boxes are all ticked shows as
 * active and clicking it clears them, which is what makes overshooting cheap.
 */
function TerrainPicker({ value, readOnly, onChange }) {
  const set = new Set(value ?? [])
  const toggle = (k) => {
    const next = new Set(set)
    if (next.has(k)) next.delete(k); else next.add(k)
    onChange(TERRAIN_KEYS.filter((t) => next.has(t)))
  }
  const toggleGroup = (name) => {
    const group = TERRAIN_GROUPS[name]
    const all = group.every((k) => set.has(k))
    const next = new Set(set)
    for (const k of group) { if (all) next.delete(k); else next.add(k) }
    onChange(TERRAIN_KEYS.filter((t) => next.has(t)))
  }

  return (
    <div className="ed-terr">
      <div className="ed-terr-groups">
        {TERRAIN_GROUP_NAMES.map((name) => {
          const group = TERRAIN_GROUPS[name]
          const all = group.length > 0 && group.every((k) => set.has(k))
          const some = !all && group.some((k) => set.has(k))
          return (
            <button
              key={name}
              className={`ed-terr-group${all ? ' on' : some ? ' part' : ''}`}
              disabled={readOnly}
              title={all ? `Untick all ${group.length}` : `Tick all ${group.length}`}
              onClick={() => toggleGroup(name)}
            >{name}</button>
          )
        })}
        <button className="ed-terr-group clear" disabled={readOnly} onClick={() => onChange([])}>
          none
        </button>
        <span className="ed-terr-count">{set.size} of {TERRAIN_KEYS.length}</span>
      </div>

      <div className="ed-terr-list">
        {TERRAIN_KEYS.map((k) => (
          <label key={k} className={`ed-terr-item${set.has(k) ? ' on' : ''}`}>
            <input type="checkbox" checked={set.has(k)} disabled={readOnly} onChange={() => toggle(k)} />
            {terrainLabel(k)}
          </label>
        ))}
      </div>
    </div>
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
