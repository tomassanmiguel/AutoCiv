import {
  OPS, OP_KEYS, TARGETS, TARGET_KEYS, UNIT_CLASSES, TILE_CLASSES, TERRAINS,
  REGIONS, STATS, STAT_KEYS, MODES, MODE_KEYS, SCALES, SCALE_KEYS, COUNTABLES,
  ANCHORS, TRIGGERS, TRIGGER_KEYS, FILTERS, FILTER_KEYS, DURATIONS,
  DURATION_KEYS, RULE_KEYS, RULE_KEY_LIST, blankEffect, validateEffect,
} from '../game/data/schema.js'
import { describeEffect, fieldsFor } from '../game/data/describe-effect.js'

/**
 * The effect editor — the actual point of this tool.
 *
 * Every input is a dropdown over a schema enum. There is no free-text field
 * anywhere, on purpose: the dataset has to be machine-readable or it cannot be
 * the game's source of truth, and one prose field is all it takes to lose that.
 *
 * Two things make that bearable to author against:
 *  - Only the fields that MATTER for the chosen op are shown (`fieldsFor`), so
 *    picking "Unlock" does not ask you for a percentage.
 *  - The generated sentence is shown under each row. You author until the
 *    sentence reads like the design text — that round trip is the check that the
 *    structure did not quietly drop a clause.
 */
export default function EffectEditor({ effects, onChange }) {
  const set = (i, patch) => onChange(effects.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  const add = () => onChange([...effects, blankEffect()])
  const remove = (i) => onChange(effects.filter((_, j) => j !== i))
  const move = (i, d) => {
    const next = [...effects]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="fx">
      {effects.map((fx, i) => {
        const show = fieldsFor(fx.op)
        const problems = validateEffect(fx, `effect ${i + 1}`)
        return (
          <div key={i} className={`fx-row${problems.length ? ' bad' : ''}`}>
            <div className="fx-controls">
              <Field label="Op">
                <select value={fx.op} onChange={(e) => set(i, { op: e.target.value })}>
                  {OP_KEYS.map((k) => <option key={k} value={k}>{OPS[k].label}</option>)}
                </select>
              </Field>

              {fx.op === 'rule' && (
                <Field label="Rule" wide>
                  <select value={fx.ruleKey} onChange={(e) => set(i, { ruleKey: e.target.value })}>
                    <option value="">— pick a named rule —</option>
                    {RULE_KEY_LIST.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                </Field>
              )}

              {show.target && (
                <>
                  <Field label="Target">
                    <select value={fx.target} onChange={(e) => set(i, { target: e.target.value, targetKey: '' })}>
                      {TARGET_KEYS.map((k) => <option key={k} value={k}>{TARGETS[k].label}</option>)}
                    </select>
                  </Field>
                  {TARGETS[fx.target]?.needsKey && (
                    <Field label="Which">
                      <KeyPicker
                        kind={TARGETS[fx.target].needsKey}
                        value={fx.targetKey}
                        onChange={(v) => set(i, { targetKey: v })}
                      />
                    </Field>
                  )}
                </>
              )}

              {show.stat && (
                <Field label="Stat">
                  <select value={fx.stat} onChange={(e) => set(i, { stat: e.target.value })}>
                    {STAT_KEYS.map((k) => <option key={k} value={k}>{STATS[k].label} ({STATS[k].group})</option>)}
                  </select>
                </Field>
              )}

              {show.mode && (
                <Field label="Mode">
                  <select value={fx.mode} onChange={(e) => set(i, { mode: e.target.value })}>
                    {MODE_KEYS.map((k) => <option key={k} value={k}>{MODES[k].label}</option>)}
                  </select>
                </Field>
              )}

              {show.value && (
                <Field label="Value" narrow>
                  <input type="number" value={fx.value} step="any"
                    onChange={(e) => set(i, { value: Number(e.target.value) })} />
                </Field>
              )}

              {show.scale && (
                <>
                  <Field label="Scales with">
                    <select value={fx.scale} onChange={(e) => set(i, { scale: e.target.value, scaleKey: '' })}>
                      {SCALE_KEYS.map((k) => <option key={k} value={k}>{SCALES[k].label}</option>)}
                    </select>
                  </Field>
                  {SCALES[fx.scale]?.needsKey && (
                    <Field label="Of">
                      <KeyPicker kind={SCALES[fx.scale].needsKey} value={fx.scaleKey}
                        onChange={(v) => set(i, { scaleKey: v })} />
                    </Field>
                  )}
                </>
              )}

              {show.filter && (
                <>
                  <Field label="Only when">
                    <select value={fx.filter} onChange={(e) => set(i, { filter: e.target.value, filterKey: '' })}>
                      {FILTER_KEYS.map((k) => <option key={k} value={k}>{FILTERS[k].label}</option>)}
                    </select>
                  </Field>
                  {FILTERS[fx.filter]?.needsKey && (
                    <Field label="Of">
                      <KeyPicker kind={FILTERS[fx.filter].needsKey} value={fx.filterKey}
                        onChange={(v) => set(i, { filterKey: v })} />
                    </Field>
                  )}
                </>
              )}

              {show.trigger && (
                <>
                  <Field label="When">
                    <select value={fx.trigger} onChange={(e) => set(i, { trigger: e.target.value })}>
                      {TRIGGER_KEYS.map((k) => <option key={k} value={k}>{TRIGGERS[k].label}</option>)}
                    </select>
                  </Field>
                  {TRIGGERS[fx.trigger]?.needsN && (
                    <Field label="N" narrow>
                      <input type="number" value={fx.triggerN}
                        onChange={(e) => set(i, { triggerN: Number(e.target.value) })} />
                    </Field>
                  )}
                </>
              )}

              {show.duration && (
                <Field label="Lasts">
                  <select value={fx.duration} onChange={(e) => set(i, { duration: e.target.value })}>
                    {DURATION_KEYS.map((k) => <option key={k} value={k}>{DURATIONS[k].label}</option>)}
                  </select>
                </Field>
              )}

              <div className="fx-row-actions">
                <button title="Move up" onClick={() => move(i, -1)}>↑</button>
                <button title="Move down" onClick={() => move(i, 1)}>↓</button>
                <button title="Remove" className="danger" onClick={() => remove(i)}>✕</button>
              </div>
            </div>

            <div className="fx-reads">
              <span className="fx-reads-label">reads as</span>
              {describeEffect(fx)}
            </div>
            {fx.op === 'rule' && RULE_KEYS[fx.ruleKey] && (
              <div className="fx-rule-note">
                ⚙ engine hook — this needs code: <code>{fx.ruleKey}</code>
              </div>
            )}
            {problems.length > 0 && <div className="fx-bad">{problems.join(' · ')}</div>}
          </div>
        )
      })}
      <button className="fx-add" onClick={add}>+ add effect</button>
    </div>
  )
}

function Field({ label, children, narrow, wide }) {
  return (
    <label className={`fx-field${narrow ? ' narrow' : ''}${wide ? ' wide' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  )
}

/** The enum a key-field draws from depends on what asked for it. */
const KEY_SOURCES = {
  unitClass: UNIT_CLASSES,
  tileClass: TILE_CLASSES,
  terrain: TERRAINS,
  region: REGIONS,
  countable: COUNTABLES,
  adjacency: COUNTABLES,
  anchor: ANCHORS,
  stat: STAT_KEYS,
  building: null, // free-form id: buildings are content, not a fixed enum
}

function KeyPicker({ kind, value, onChange }) {
  const options = KEY_SOURCES[kind]
  if (!options) {
    // Building ids are the one identifier the schema cannot enumerate, because
    // buildings are themselves editable content. Still an id, still not prose.
    return <input value={value ?? ''} placeholder="building id" onChange={(e) => onChange(e.target.value)} />
  }
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">—</option>
      {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
    </select>
  )
}
