import { useEffect, useMemo, useState, useCallback } from 'react'
import {
  ERAS, QUADRANTS, ADVANCE_THRESHOLDS, ICONS, PLACEMENT_KEYS, PLACEMENTS,
  WONDER_TIERS, validateContent, feasibility,
  blankTech, blankBuilding, blankWonder,
} from '../game/data/schema.js'
import DataTable from './DataTable.jsx'
import Feasibility from './Feasibility.jsx'
import './editor.css'

const TABS = [
  { key: 'techs', label: 'Techs' },
  { key: 'buildings', label: 'Buildings' },
  { key: 'wonders', label: 'Wonders' },
  { key: 'tierUnlocks', label: 'Tier unlocks' },
  { key: 'feasibility', label: 'Feasibility' },
]

const EMPTY = {
  version: 1,
  eras: ERAS,
  quadrants: QUADRANTS,
  advanceThresholds: ADVANCE_THRESHOLDS,
  techs: [],
  buildings: [],
  wonders: [],
  tierUnlocks: [],
}

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

  const addRow = useCallback((key) => {
    const make = key === 'techs' ? blankTech : key === 'buildings' ? blankBuilding : blankWonder
    const row = make()
    row.id = `new_${(content[key]?.length ?? 0) + 1}`
    row.name = 'New entry'
    mutate(key, (rows) => [row, ...rows])
  }, [content, mutate])

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

  // Renaming rewrites the id too, and repoints anything that depended on it —
  // a dangling `requires` is the one edit that silently breaks the dataset.
  const renameRow = useCallback((key, id, name) => {
    const next = slug(name)
    setContent((c) => {
      const rows = (c[key] ?? []).map((r) => (r.id === id ? { ...r, name, id: next || r.id } : r))
      const repoint = (arr) => (arr ?? []).map((r) => ({
        ...r,
        requires: (r.requires ?? []).map((x) => (x === id ? next : x)),
        unlockedBy: r.unlockedBy === id ? next : r.unlockedBy,
      }))
      return { ...c, [key]: repoint(rows), techs: key === 'techs' ? repoint(rows) : c.techs, buildings: repoint(c.buildings), wonders: repoint(c.wonders) }
    })
    setDirty(true)
  }, [])

  // --- derived --------------------------------------------------------------
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

  const rows = useMemo(() => content[tab] ?? [], [content, tab])
  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filters.eras.length && !filters.eras.includes(r.era)) return false
      if (filters.quadrants.length && !filters.quadrants.includes(r.quadrant)) return false
      if (filters.issues && !problemsById.has(r.id)) return false
      if (filters.rules && !(r.effects ?? []).some((f) => f.op === 'rule')) return false
      if (q && !(`${r.name} ${r.id}`.toLowerCase().includes(q))) return false
      return true
    })
  }, [rows, filters, problemsById])

  const columns = COLUMNS[tab] ?? []
  const techOptions = useMemo(
    () => (content.techs ?? []).map((t) => ({ value: t.id, label: `${t.name} · ${ERAS[t.era] ?? '?'}` })),
    [content.techs],
  )

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
              {t.key !== 'feasibility' && <span className="ed-count">{content[t.key]?.length ?? 0}</span>}
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
            showQuadrant={tab === 'techs' || tab === 'tierUnlocks'}
            showEra={tab !== 'wonders'}
            shown={filtered.length}
            total={rows.length}
            onAdd={() => addRow(tab)}
          />
          <DataTable
            rows={filtered}
            columns={columns}
            problemsById={problemsById}
            techOptions={techOptions}
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
    { key: 'name', label: 'Name', kind: 'name', width: 200 },
    { key: 'quadrant', label: 'Quadrant', kind: 'select', width: 110, options: QUADRANTS },
    { key: 'era', label: 'Era', kind: 'era', width: 120 },
    { key: 'requires', label: 'Requires', kind: 'techs', width: 190 },
    { key: 'effects', label: 'Effect', kind: 'effects' },
  ],
  buildings: [
    { key: 'icon', label: '', kind: 'icon', width: 44, options: ICONS },
    { key: 'name', label: 'Name', kind: 'name', width: 200 },
    { key: 'era', label: 'Era', kind: 'era', width: 120 },
    { key: 'placement', label: 'Placement', kind: 'select', width: 190, options: PLACEMENT_KEYS, labels: PLACEMENTS },
    { key: 'unlockedBy', label: 'Unlocked by', kind: 'tech', width: 190 },
    { key: 'effects', label: 'Effect', kind: 'effects' },
  ],
  wonders: [
    { key: 'icon', label: '', kind: 'icon', width: 44, options: ICONS },
    { key: 'name', label: 'Name', kind: 'name', width: 200 },
    { key: 'tier', label: 'Tier', kind: 'select', width: 80, options: WONDER_TIERS },
    { key: 'placement', label: 'Placement', kind: 'select', width: 190, options: PLACEMENT_KEYS, labels: PLACEMENTS },
    { key: 'requires', label: 'Requires', kind: 'techs', width: 170 },
    { key: 'effects', label: 'Effect', kind: 'effects' },
  ],
  tierUnlocks: [
    { key: 'name', label: 'Name', kind: 'name', width: 220 },
    { key: 'quadrant', label: 'Quadrant', kind: 'select', width: 110, options: QUADRANTS },
    { key: 'era', label: 'Era', kind: 'era', width: 120 },
    { key: 'effects', label: 'Granted automatically on reaching this tier', kind: 'effects' },
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
        only named rules
      </label>

      <span className="ed-shown">{shown} of {total}</span>
      <button className="ed-add" onClick={onAdd}>+ New</button>
      {(filters.eras.length || filters.quadrants.length || filters.search || filters.issues || filters.rules) ? (
        <button className="ed-clear" onClick={() => setFilters({ eras: [], quadrants: [], search: '', issues: false, rules: false })}>
          clear
        </button>
      ) : null}
    </div>
  )
}
