import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ERAS, QUADRANTS, ADVANCE_THRESHOLDS, ICONS,
  WONDER_TIERS, validateContent, feasibility,
  blankTech, blankBuilding, blankWonder, blankTierUnlock,
} from '../game/data/schema.js'
import DataTable from './DataTable.jsx'
import Feasibility from './Feasibility.jsx'
import './editor.css'

const TABS = [
  { key: 'techs', label: 'Techs' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'wonders', label: 'Wonders' },
  { key: 'unitClasses', label: 'Unit classes' },
  { key: 'tierUnlocks', label: 'Tier unlocks' },
  { key: 'backlog', label: 'Backlog' },
  { key: 'feasibility', label: 'Feasibility' },
]

const EMPTY = {
  version: 1,
  eras: ERAS,
  quadrants: QUADRANTS,
  advanceThresholds: ADVANCE_THRESHOLDS,
  activeEras: ERAS.length,
  techs: [],
  buildings: [],
  wonders: [],
  // The nine unit classes. Fixed set — you edit them, you do not add to them.
  unitClasses: [],
  tierUnlocks: [],
  // Designed but out of the current build's scope. Same shape, restorable.
  backlog: { techs: [], buildings: [], wonders: [], tierUnlocks: [] },
}

/** Which live list a backlog row belongs back in. */
const HOME_OF = (row) => (row.tier ? 'wonders' : row.quadrant ? (row.id?.startsWith('tier_') ? 'tierUnlocks' : 'techs') : 'buildings')

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/**
 * The content editor.
 *
 * This is a TOOL, not part of the game: it lives at /editor.html, shares the
 * game's dev server, and writes `src/game/data/content.json` through the dev-only
 * /api/content endpoint. The game reads that file; nothing here runs in a build.
 *
 * The game's "no scrollbars anywhere" rule deliberately does NOT apply — a table
 * of three hundred rows scrolls.
 */
export default function App() {
  const [content, setContent] = useState(EMPTY)
  const [tab, setTab] = useState('techs')
  const [dirty, setDirty] = useState(false)
  const [status, setStatus] = useState('loading…')
  const [filters, setFilters] = useState({ eras: [], quadrants: [], search: '', issues: false, rules: false })

  // --- load / save ----------------------------------------------------------
  useEffect(() => {
    fetch('/api/content')
      .then((r) => r.json())
      .then((data) => {
        setContent({ ...EMPTY, ...data })
        setStatus(`loaded ${data.techs?.length ?? 0} techs`)
      })
      .catch((e) => setStatus(`load failed: ${e}`))
  }, [])

  const save = useCallback(async () => {
    setStatus('saving…')
    try {
      // The era ladder and thresholds live in code; rewrite them on every save so
      // the file can never drift from the schema it is validated against.
      const body = { ...content, eras: ERAS, quadrants: QUADRANTS, advanceThresholds: ADVANCE_THRESHOLDS }
      const res = await fetch('/api/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const out = await res.json()
      if (!out.ok) throw new Error(out.error)
      setDirty(false)
      setStatus(`saved ${(out.bytes / 1024).toFixed(0)} kB to content.json`)
    } catch (e) {
      setStatus(`SAVE FAILED: ${e}. Is the dev server running?`)
    }
  }, [content])

  // Ctrl+S, because a table editor without it is a table editor you resent.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [save])

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // --- mutation -------------------------------------------------------------
  const mutate = useCallback((key, fn) => {
    setContent((c) => ({ ...c, [key]: fn(c[key] ?? []) }))
    setDirty(true)
  }, [])

  const patchRow = useCallback((key, id, patch) => {
    mutate(key, (rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }, [mutate])

  const BLANK = { techs: blankTech, buildings: blankBuilding, wonders: blankWonder, tierUnlocks: blankTierUnlock }

  /**
   * ⚠️ `backlog` is an OBJECT of four lists, not a list — adding there used to
   * call the same array path and break. A new backlog row goes into
   * `backlog.techs`, since that is what you are almost always parking.
   */
  const addRow = useCallback((key) => {
    const isBacklog = key === 'backlog'
    const listKey = isBacklog ? 'techs' : key
    const row = (BLANK[listKey] ?? blankTech)()
    row.name = 'New entry'
    row.id = `new_${Date.now().toString(36)}`
    if (isBacklog) {
      setContent((c) => ({ ...c, backlog: { ...c.backlog, techs: [row, ...(c.backlog?.techs ?? [])] } }))
      setDirty(true)
      return
    }
    mutate(key, (rows) => [row, ...rows])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutate])

  const deleteRow = useCallback((key, id) => {
    mutate(key, (rows) => rows.filter((r) => r.id !== id))
  }, [mutate])

  const duplicateRow = useCallback((key, id) => {
    mutate(key, (rows) => {
      const src = rows.find((r) => r.id === id)
      if (!src) return rows
      const copy = structuredClone(src)
      copy.id = `${src.id}_copy`
      copy.name = `${src.name} (copy)`
      return [copy, ...rows]
    })
  }, [mutate])

  /**
   * Renaming rewrites the id too, and repoints everything that referenced it —
   * a dangling `requires` is the one edit that silently breaks the dataset.
   *
   * ⚠️ This used to spread `[key]` and then `buildings`/`wonders` explicitly, so
   * for those two tabs the later literal key overwrote the renamed list and the
   * edit vanished. Every list now goes through one path.
   */
  const renameRow = useCallback((key, id, name) => {
    const next = slug(name) || id
    setContent((c) => {
      const renamed = (arr) => (arr ?? []).map((r) => (r.id === id ? { ...r, name, id: next } : r))
      const repoint = (arr) => (arr ?? []).map((r) => ({
        ...r,
        ...(r.requires ? { requires: r.requires.map((x) => (x === id ? next : x)) } : {}),
        ...(r.excludes ? { excludes: r.excludes.map((x) => (x === id ? next : x)) } : {}),
        ...(r.unlockedBy !== undefined ? { unlockedBy: r.unlockedBy === id ? next : r.unlockedBy } : {}),
      }))
      const apply = (k) => repoint(k === key ? renamed(c[k]) : c[k])
      return {
        ...c,
        techs: apply('techs'),
        buildings: apply('buildings'),
        wonders: apply('wonders'),
        tierUnlocks: apply('tierUnlocks'),
      }
    })
    setDirty(true)
  }, [])

  // --- derived --------------------------------------------------------------
  // The backlog is deliberately NOT validated: parked rows point at techs that
  // are no longer in scope, and reporting that as breakage would bury the real
  // problems in the live set.
  const problems = useMemo(() => validateContent(content), [content])
  const problemsById = useMemo(() => {
    const m = new Map()
    for (const p of problems) {
      const id = p.split(':')[0].replace(/^(tech|building|wonder) /, '').trim()
      m.set(id, [...(m.get(id) ?? []), p])
    }
    return m
  }, [problems])

  const feas = useMemo(() => feasibility(content), [content])

  /** Move a parked row back into play, into whichever list it came from. */
  const restore = useCallback((id) => {
    setContent((c) => {
      const b = c.backlog ?? {}
      const all = [...(b.techs ?? []), ...(b.buildings ?? []), ...(b.wonders ?? []), ...(b.tierUnlocks ?? [])]
      const row = all.find((r) => r.id === id)
      if (!row) return c
      const home = HOME_OF(row)
      const strip = (arr) => (arr ?? []).filter((r) => r.id !== id)
      return {
        ...c,
        [home]: [row, ...(c[home] ?? [])],
        backlog: { techs: strip(b.techs), buildings: strip(b.buildings), wonders: strip(b.wonders), tierUnlocks: strip(b.tierUnlocks) },
      }
    })
    setDirty(true)
  }, [])

  // The backlog is one flat list across all four kinds — you are browsing ideas,
  // not editing a table, so the distinction does not earn four more tabs.
  const backlogRows = useMemo(() => {
    const b = content.backlog ?? {}
    return [...(b.techs ?? []), ...(b.wonders ?? []), ...(b.tierUnlocks ?? []), ...(b.buildings ?? [])]
  }, [content.backlog])

  const rows = useMemo(() => (tab === 'backlog' ? backlogRows : content[tab] ?? []), [content, tab, backlogRows])
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filters.eras.length && !filters.eras.includes(r.era)) return false
      if (filters.quadrants.length && !filters.quadrants.includes(r.quadrant)) return false
      if (filters.issues && !problemsById.has(r.id)) return false
      if (filters.rules && r.description?.trim()) return false // "needs writing"
      if (q && !(`${r.name} ${r.id} ${r.description ?? ''}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [rows, filters, problemsById])

  const columns = COLUMNS[tab] ?? []
  const techOptions = useMemo(
    () => (content.techs ?? []).map((t) => ({ value: t.id, label: `${t.name} · ${ERAS[t.era] ?? '?'}` })),
    [content.techs],
  )
  const groupOptions = useMemo(() => {
    const s = new Set()
    for (const t of [...(content.techs ?? []), ...(content.wonders ?? [])]) if (t.group) s.add(t.group)
    return [...s].sort()
  }, [content.techs, content.wonders])

  return (
    <div className="ed">
      <header className="ed-top">
        <div className="ed-brand">
          AutoCiv <span>content editor</span>
        </div>
        <nav className="ed-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={`ed-tab${tab === t.key ? ' on' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
              {t.key !== 'feasibility' && (
                // The backlog is four lists under one key, so it counts differently.
                <span className="ed-count">
                  {t.key === 'backlog' ? backlogRows.length : content[t.key]?.length ?? 0}
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="ed-right">
          <span className={`ed-problems${problems.length ? ' bad' : ''}`}>
            {problems.length ? `${problems.length} problems` : 'valid'}
          </span>
          <span className={`ed-blocked${feas.blocked.length ? ' bad' : ''}`}>
            {feas.blocked.length} blocked cells
          </span>
          <span className="ed-status">{status}</span>
          <button className={`ed-save${dirty ? ' dirty' : ''}`} onClick={save}>
            {dirty ? 'Save ⌘S' : 'Saved'}
          </button>
        </div>
      </header>

      {tab === 'feasibility' ? (
        <Feasibility content={content} feas={feas} problems={problems} />
      ) : (
        <>
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            showQuadrant={tab !== 'buildings' && tab !== 'tierUnlocks' && tab !== 'unitClasses'}
            showEra={tab !== 'unitClasses'}
            shown={filtered.length}
            total={rows.length}
            // The nine classes are a FIXED SET — the engine indexes units by
            // class key, so there is nothing to add and nothing to delete.
            onAdd={tab === 'unitClasses' ? null : () => addRow(tab)}
          />
          <DataTable
            rows={filtered}
            totalRows={rows.length}
            columns={columns}
            problemsById={problemsById}
            techOptions={techOptions}
            groupOptions={groupOptions}
            readOnly={tab === 'backlog'}
            detail={tab === 'unitClasses' ? 'unitClass' : 'description'}
            fixedRows={tab === 'unitClasses'}
            onRestore={tab === 'backlog' ? restore : null}
            onPatch={(id, patch) => patchRow(tab, id, patch)}
            onRename={(id, name) => renameRow(tab, id, name)}
            onDelete={(id) => deleteRow(tab, id)}
            onDuplicate={(id) => duplicateRow(tab, id)}
          />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Column specs — one per tab. `kind` picks the cell editor in DataTable.
// ---------------------------------------------------------------------------
const COLUMNS = {
  techs: [
    { key: 'icon', label: '', kind: 'icon', width: 44, options: ICONS },
    { key: 'name', label: 'Name', kind: 'name', width: 180 },
    { key: 'quadrant', label: 'Branch', kind: 'select', width: 100, options: QUADRANTS },
    { key: 'era', label: 'Era', kind: 'era', width: 115 },
    { key: 'requires', label: 'Requires', kind: 'techs', width: 160 },
    // A shared group name makes a set mutually exclusive.
    { key: 'group', label: 'Exclusive group', kind: 'group', width: 130 },
    // Does the ENGINE run this row, or is it only written down? The pool is
    // being rebuilt one wired tech at a time, so this is the column you scan.
    { key: 'effects', label: 'Wired', kind: 'wired', width: 62 },
    { key: 'description', label: 'Description', kind: 'description' },
  ],
  buildings: [
    { key: 'icon', label: '', kind: 'icon', width: 44, options: ICONS },
    { key: 'name', label: 'Name', kind: 'name', width: 180 },
    { key: 'era', label: 'Era', kind: 'era', width: 115 },
    { key: 'placement', label: 'Placement', kind: 'placements', width: 220 },
    { key: 'unlockedBy', label: 'Unlocked by', kind: 'tech', width: 170 },
    { key: 'effects', label: 'Wired', kind: 'wired', width: 62 },
    { key: 'description', label: 'Description', kind: 'description' },
  ],
  wonders: [
    { key: 'icon', label: '', kind: 'icon', width: 44, options: ICONS },
    { key: 'name', label: 'Name', kind: 'name', width: 180 },
    { key: 'tier', label: 'Tier', kind: 'select', width: 66, options: WONDER_TIERS },
    // A wonder is drafted like a tech, so it needs a pool to be drafted from.
    { key: 'quadrant', label: 'Branch', kind: 'select', width: 100, options: QUADRANTS },
    { key: 'era', label: 'Era', kind: 'era', width: 115 },
    { key: 'placement', label: 'Placement', kind: 'placements', width: 200 },
    { key: 'group', label: 'Exclusive group', kind: 'group', width: 120 },
    { key: 'effects', label: 'Wired', kind: 'wired', width: 62 },
    { key: 'description', label: 'Description', kind: 'description' },
  ],
  // The nine classes. `id` is NOT editable — the engine indexes units by class
  // key, so renaming one would orphan every grant that names it.
  unitClasses: [
    { key: 'icon', label: '', kind: 'icon', width: 44, options: ICONS },
    { key: 'name', label: 'Class', kind: 'text', width: 150 },
    { key: 'atk', label: 'Atk', kind: 'stat', width: 62 },
    { key: 'def', label: 'Def', kind: 'stat', width: 62 },
    { key: 'speed', label: 'Spd', kind: 'stat', width: 62 },
    { key: 'range', label: 'Rng', kind: 'stat', width: 62 },
    { key: 'placement', label: 'Placement', kind: 'terrain', width: 110 },
    { key: 'movement', label: 'Movement', kind: 'terrain', width: 110 },
    { key: 'description', label: 'Description', kind: 'description' },
  ],
  // No branch column: a tier unlock fires when ANY branch reaches its era.
  tierUnlocks: [
    { key: 'name', label: 'Name', kind: 'name', width: 220 },
    { key: 'era', label: 'Era', kind: 'era', width: 140 },
    { key: 'description', label: 'Revealed when any branch reaches this era', kind: 'description' },
  ],
  // Parked ideas. Read-only: edit them after restoring, not before.
  backlog: [
    { key: 'icon', label: '', kind: 'icon', width: 44, options: ICONS },
    { key: 'name', label: 'Name', kind: 'name', width: 200 },
    { key: 'quadrant', label: 'Branch', kind: 'select', width: 100, options: QUADRANTS },
    { key: 'era', label: 'Era', kind: 'era', width: 115 },
    { key: 'description', label: 'Description', kind: 'description' },
  ],
}

// ---------------------------------------------------------------------------
function FilterBar({ filters, setFilters, showQuadrant, showEra, shown, total, onAdd }) {
  const toggle = (key, value) => setFilters((f) => ({
    ...f,
    [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value],
  }))

  return (
    <div className="ed-filters">
      <input
        className="ed-search"
        placeholder="Search name…"
        value={filters.search}
        onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
      />

      {showQuadrant && (
        <div className="ed-chips">
          {QUADRANTS.map((q) => (
            <button key={q} className={`ed-chip q-${q}${filters.quadrants.includes(q) ? ' on' : ''}`}
              onClick={() => toggle('quadrants', q)}>{q}</button>
          ))}
        </div>
      )}

      {showEra && (
        <div className="ed-chips">
          {ERAS.map((e, i) => (
            <button key={e} className={`ed-chip${filters.eras.includes(i) ? ' on' : ''}`}
              onClick={() => toggle('eras', i)}>{e}</button>
          ))}
        </div>
      )}

      <label className="ed-toggle">
        <input type="checkbox" checked={filters.issues}
          onChange={(e) => setFilters((f) => ({ ...f, issues: e.target.checked }))} />
        only problems
      </label>
      <label className="ed-toggle">
        <input type="checkbox" checked={filters.rules}
          onChange={(e) => setFilters((f) => ({ ...f, rules: e.target.checked }))} />
        needs a description
      </label>

      <span className="ed-shown">{shown} of {total}</span>
      {onAdd && <button className="ed-add" onClick={onAdd}>+ New</button>}
      {(filters.eras.length || filters.quadrants.length || filters.search || filters.issues || filters.rules) ? (
        <button className="ed-clear" onClick={() => setFilters({ eras: [], quadrants: [], search: '', issues: false, rules: false })}>
          clear
        </button>
      ) : null}
    </div>
  )
}
