// AutoCiv v5 — content editor. Loads content.json via the dev /api/content
// middleware, edits it in structured tables, and writes it back. Everything the
// game runs comes from this file, so this is the authoring surface.
import { useEffect, useMemo, useState } from 'react'
import { effectsFor, EFFECT_BY_NAME, RESOURCES, ERAS, validateContent } from '../game/data/schema.js'

const TABS = ['Meta', 'Deployables', 'Techs', 'Terrain', 'Enemy']

export default function Editor() {
  const [content, setContent] = useState(null)
  const [tab, setTab] = useState('Deployables')
  const [dirty, setDirty] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  useEffect(() => {
    fetch('/api/content').then((r) => r.json()).then(setContent).catch(() => {
      import('../game/data/content.json').then((m) => setContent(m.default))
    })
  }, [])

  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save() } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  })
  useEffect(() => {
    const h = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  function update(fn) { setContent((c) => { const n = structuredClone(c); fn(n); return n }); setDirty(true) }
  async function save() {
    setSaveMsg('Saving…')
    try {
      const r = await fetch('/api/content', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content) })
      const j = await r.json()
      if (j.ok) { setDirty(false); setSaveMsg(`Saved ✓ (${j.bytes} bytes)`) } else setSaveMsg('Error: ' + j.error)
    } catch (e) { setSaveMsg('Error (dev server only): ' + e) }
    setTimeout(() => setSaveMsg(''), 3000)
  }

  const problems = useMemo(() => (content ? validateContent(content) : []), [content])
  if (!content) return <div className="ed-loading">Loading content…</div>

  const ctx = {
    terrainIds: content.terrain.map((t) => t.id),
    deployableIds: content.deployables.map((d) => d.id),
  }

  return (
    <div className="ed">
      <header className="ed-top">
        <div className="ed-title">AutoCiv v5 · <span>Content Editor</span></div>
        <nav className="ed-tabs">
          {TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
        </nav>
        <div className="ed-status">
          {problems.length > 0 && <span className="ed-warn" title={problems.join('\n')}>⚠ {problems.length} issue(s)</span>}
          <span className="ed-msg">{saveMsg}</span>
          <button className={`ed-save ${dirty ? 'dirty' : ''}`} onClick={save}>{dirty ? 'Save *' : 'Save'}</button>
        </div>
      </header>
      <main className="ed-main">
        {tab === 'Meta' && <MetaTab content={content} update={update} />}
        {tab === 'Deployables' && <DeployableTab content={content} update={update} ctx={ctx} />}
        {tab === 'Techs' && <TechTab content={content} update={update} ctx={ctx} />}
        {tab === 'Terrain' && <TerrainTab content={content} update={update} />}
        {tab === 'Enemy' && <EnemyTab content={content} update={update} />}
      </main>
    </div>
  )
}

// ---------- shared inputs ----------
function Field({ label, children }) { return <label className="ed-field"><span>{label}</span>{children}</label> }
function Num({ value, onChange, w = 64 }) { return <input type="number" style={{ width: w }} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} /> }
function Txt({ value, onChange, w }) { return <input type="text" style={w ? { width: w } : undefined} value={value ?? ''} onChange={(e) => onChange(e.target.value)} /> }
function Sel({ value, onChange, options }) { return <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select> }

// ---------- effects editor ----------
function EffectList({ where, effects, onChange, ctx }) {
  const kinds = effectsFor(where)
  const add = () => onChange([...(effects || []), { name: kinds[0].name }])
  const set = (i, e) => { const n = [...effects]; n[i] = e; onChange(n) }
  const del = (i) => onChange(effects.filter((_, j) => j !== i))
  return (
    <div className="ed-effects">
      {(effects || []).map((e, i) => (
        <div key={i} className="ed-effect">
          <select value={e.name} onChange={(ev) => set(i, { name: ev.target.value })}>
            {kinds.map((k) => <option key={k.name} value={k.name}>{k.label}</option>)}
          </select>
          {(EFFECT_BY_NAME[e.name]?.params || []).map((p) => (
            <ParamInput key={p.key} p={p} value={e[p.key]} onChange={(v) => set(i, { ...e, [p.key]: v })} ctx={ctx} />
          ))}
          <button className="ed-x" onClick={() => del(i)}>✕</button>
        </div>
      ))}
      <button className="ed-add" onClick={add}>+ effect</button>
    </div>
  )
}
function ParamInput({ p, value, onChange, ctx }) {
  let opts = p.options
  if (p.type === 'terrain') opts = ctx.terrainIds
  if (p.type === 'deployable') opts = ctx.deployableIds
  if (p.type === 'number') return <label className="ed-p"><i>{p.key}</i><Num value={value} onChange={onChange} /></label>
  if (p.type === 'bool') return <label className="ed-p"><i>{p.key}</i><input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /></label>
  return <label className="ed-p"><i>{p.key}</i><Sel value={value ?? opts[0]} onChange={onChange} options={opts} /></label>
}

// ---------- deployables ----------
function DeployableTab({ content, update, ctx }) {
  const [open, setOpen] = useState(null)
  const addRow = () => update((c) => c.deployables.push({ id: 'new_' + Date.now(), name: 'New', type: 'building', subtype: 'production', era: 'Stone', production: 1, upkeep: 1, placement: { kind: 'land' }, desc: '', econ: [], combat: [] }))
  return (
    <div className="ed-list">
      <div className="ed-listhead"><h2>Deployables ({content.deployables.length})</h2><button className="ed-add" onClick={addRow}>+ deployable</button></div>
      {content.deployables.map((d, i) => (
        <div key={d.id} className="ed-row">
          <div className="ed-rowhead" onClick={() => setOpen(open === i ? null : i)}>
            <span className="chev">{open === i ? '▾' : '▸'}</span>
            <b>{d.name}</b><span className="tag">{d.type}·{d.subtype}</span><span className="tag">{d.era}</span>
            <span className="tag">⚒{d.production}</span>{d.unique && <span className="tag u">unique</span>}
          </div>
          {open === i && (
            <div className="ed-edit">
              <div className="ed-grid">
                <Field label="id"><Txt value={d.id} onChange={(v) => update((c) => c.deployables[i].id = v)} /></Field>
                <Field label="name"><Txt value={d.name} onChange={(v) => update((c) => c.deployables[i].name = v)} /></Field>
                <Field label="type"><Sel value={d.type} onChange={(v) => update((c) => c.deployables[i].type = v)} options={['unit', 'building']} /></Field>
                <Field label="subtype"><Txt value={d.subtype} onChange={(v) => update((c) => c.deployables[i].subtype = v)} w={110} /></Field>
                <Field label="era"><Sel value={d.era} onChange={(v) => update((c) => c.deployables[i].era = v)} options={ERAS} /></Field>
                <Field label="production"><Num value={d.production} onChange={(v) => update((c) => c.deployables[i].production = v)} /></Field>
                <Field label="upkeep"><Num value={d.upkeep} onChange={(v) => update((c) => c.deployables[i].upkeep = v)} /></Field>
                <Field label="place kind"><Sel value={d.placement?.kind || 'land'} onChange={(v) => update((c) => { (c.deployables[i].placement ||= {}).kind = v })} options={['land', 'water', 'any']} /></Field>
              </div>
              <Field label="description"><Txt value={d.desc} onChange={(v) => update((c) => c.deployables[i].desc = v)} w={520} /></Field>
              <div className="ed-sub"><h4>Economy (per turn)</h4><EffectList where="econ" effects={d.econ} onChange={(e) => update((c) => c.deployables[i].econ = e)} ctx={ctx} /></div>
              <div className="ed-sub"><h4>Combat scalars</h4><EffectList where="combat" effects={d.combat} onChange={(e) => update((c) => c.deployables[i].combat = e)} ctx={ctx} /></div>
              <button className="ed-del" onClick={() => { update((c) => c.deployables.splice(i, 1)); setOpen(null) }}>Delete deployable</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- techs ----------
function TechTab({ content, update, ctx }) {
  const [open, setOpen] = useState(null)
  const [era, setEra] = useState('all')
  const addRow = () => update((c) => c.techs.push({ id: 'new_' + Date.now(), name: 'New Tech', flavor: 'Progress', era: 'Stone', desc: '', effects: [] }))
  const rows = content.techs.map((t, i) => ({ t, i })).filter(({ t }) => era === 'all' || t.era === era)
  return (
    <div className="ed-list">
      <div className="ed-listhead">
        <h2>Techs ({content.techs.length})</h2>
        <Sel value={era} onChange={setEra} options={['all', ...ERAS]} />
        <button className="ed-add" onClick={addRow}>+ tech</button>
      </div>
      {rows.map(({ t, i }) => (
        <div key={t.id} className="ed-row">
          <div className="ed-rowhead" onClick={() => setOpen(open === i ? null : i)}>
            <span className="chev">{open === i ? '▾' : '▸'}</span>
            <b>{t.name}</b><span className="tag">{t.flavor}</span><span className="tag">{t.era}</span>
            <span className="desc">{t.desc}</span>
            {(!t.effects || t.effects.length === 0) && <span className="tag warn">no effect</span>}
          </div>
          {open === i && (
            <div className="ed-edit">
              <div className="ed-grid">
                <Field label="id"><Txt value={t.id} onChange={(v) => update((c) => c.techs[i].id = v)} /></Field>
                <Field label="name"><Txt value={t.name} onChange={(v) => update((c) => c.techs[i].name = v)} /></Field>
                <Field label="flavor"><Txt value={t.flavor} onChange={(v) => update((c) => c.techs[i].flavor = v)} w={110} /></Field>
                <Field label="era"><Sel value={t.era} onChange={(v) => update((c) => c.techs[i].era = v)} options={ERAS} /></Field>
              </div>
              <Field label="description"><Txt value={t.desc} onChange={(v) => update((c) => c.techs[i].desc = v)} w={520} /></Field>
              <div className="ed-sub"><h4>Effects</h4><EffectList where="tech" effects={t.effects} onChange={(e) => update((c) => c.techs[i].effects = e)} ctx={ctx} /></div>
              <button className="ed-del" onClick={() => { update((c) => c.techs.splice(i, 1)); setOpen(null) }}>Delete tech</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ---------- terrain ----------
function TerrainTab({ content, update }) {
  return (
    <div className="ed-list">
      <div className="ed-listhead"><h2>Terrain ({content.terrain.length})</h2></div>
      <table className="ed-table">
        <thead><tr><th>id</th><th>name</th><th>kind</th><th>yields</th><th>expandBase</th><th>defBonus</th><th>unlock</th></tr></thead>
        <tbody>
          {content.terrain.map((t, i) => (
            <tr key={t.id}>
              <td><Txt value={t.id} onChange={(v) => update((c) => c.terrain[i].id = v)} w={90} /></td>
              <td><Txt value={t.name} onChange={(v) => update((c) => c.terrain[i].name = v)} w={90} /></td>
              <td><Sel value={t.kind} onChange={(v) => update((c) => c.terrain[i].kind = v)} options={['land', 'water', 'space']} /></td>
              <td className="yields">
                {RESOURCES.map((r) => (
                  <label key={r} className="yl"><i>{r[0]}</i>
                    <Num value={t.yield?.[r] || 0} w={40} onChange={(v) => update((c) => { const y = c.terrain[i].yield ||= {}; if (v) y[r] = v; else delete y[r] })} />
                  </label>
                ))}
              </td>
              <td><Num value={t.expandBase} onChange={(v) => update((c) => c.terrain[i].expandBase = v)} /></td>
              <td><Num value={t.defBonus} onChange={(v) => update((c) => c.terrain[i].defBonus = v)} /></td>
              <td><Txt value={t.unlock || ''} onChange={(v) => update((c) => c.terrain[i].unlock = v || null)} w={110} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---------- meta ----------
function MetaTab({ content, update }) {
  const m = content.meta
  const set = (k, v) => update((c) => { c.meta[k] = v })
  const setRes = (r, v) => update((c) => { c.meta.startResources[r] = v })
  return (
    <div className="ed-list ed-enemy">
      <h2>Game setup</h2>
      <p className="ed-note">Starting conditions and pacing. These drive a new game directly.</p>
      <div className="ed-grid">
        <Field label="start legitimacy"><Num value={m.startLegitimacy} onChange={(v) => set('startLegitimacy', v)} /></Field>
        <Field label="wave interval (turns)"><Num value={m.waveInterval} onChange={(v) => set('waveInterval', v)} /></Field>
        <Field label="unlocks per era"><Num value={m.unlocksPerEra} onChange={(v) => set('unlocksPerEra', v)} /></Field>
        <Field label="wildcard option"><input type="checkbox" checked={!!m.wildcardOption} onChange={(e) => set('wildcardOption', e.target.checked)} /></Field>
      </div>
      <h4>Starting resources</h4>
      <div className="ed-grid">
        {RESOURCES.map((r) => <Field key={r} label={r}><Num value={m.startResources[r] || 0} onChange={(v) => setRes(r, v)} /></Field>)}
      </div>
    </div>
  )
}

// ---------- enemy ----------
function EnemyTab({ content, update }) {
  const e = content.enemy
  const set = (k, v) => update((c) => c.enemy[k] = v)
  return (
    <div className="ed-list ed-enemy">
      <h2>Enemy formula</h2>
      <p className="ed-note">Era-independent. Budget = max(playerValue, floor) × pressure × (1±variance). See design/balance-targets.md §5.</p>
      <div className="ed-grid">
        <Field label="pressureBase"><Num value={e.pressureBase} onChange={(v) => set('pressureBase', v)} /></Field>
        <Field label="pressureSlope"><Num value={e.pressureSlope} onChange={(v) => set('pressureSlope', v)} /></Field>
        <Field label="floorBase"><Num value={e.floorBase} onChange={(v) => set('floorBase', v)} /></Field>
        <Field label="floorSlope"><Num value={e.floorSlope} onChange={(v) => set('floorSlope', v)} /></Field>
        <Field label="variance"><Num value={e.variance} onChange={(v) => set('variance', v)} /></Field>
        <Field label="domainJitter"><Num value={e.domainJitter} onChange={(v) => set('domainJitter', v)} /></Field>
      </div>
      <h4>Archetypes (atk / def / bomb split)</h4>
      {e.archetypes.map((a, i) => (
        <div key={a.id} className="ed-arch">
          <b>{a.name}</b>
          {['atk', 'def', 'bomb'].map((s) => (
            <label key={s} className="ed-p"><i>{s}</i><Num value={a.split[s]} w={54} onChange={(v) => update((c) => c.enemy.archetypes[i].split[s] = v)} /></label>
          ))}
        </div>
      ))}
    </div>
  )
}
