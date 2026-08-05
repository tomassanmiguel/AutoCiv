import { ERAS, QUADRANTS, thresholdFor, OFFER_SIZE } from '../game/data/schema.js'

/**
 * CAN A RUN ACTUALLY BE PLAYED WITH THIS DATASET?
 *
 * The draft pool is CURRENT TIER ONLY: a quadrant sitting at era E may only be
 * offered techs of era E, and it must take `thresholdFor(E)` of them to advance.
 * So every quadrant × era cell is a gate — if it holds fewer techs than its
 * threshold, the run dead-ends there and no amount of play gets past it.
 *
 * This grid is the answer to "how much content do we still need", and it is the
 * reason the editor exists rather than a spreadsheet: the constraint is
 * structural, so the tool should compute it rather than leave you to notice.
 */
export default function Feasibility({ content, feas, problems }) {
  const cell = (q, era) => feas.rows.find((r) => r.quadrant === q && r.era === era)
  const totalTechs = content.techs?.length ?? 0
  const missing = feas.blocked.reduce((s, r) => s + (r.need - r.have), 0)
  // The terminal era demands nothing today, but it will the moment another era
  // is added — worth showing so the shortfall is not a surprise later.
  const terminalMissing = (feas.terminalShort ?? []).reduce((s, r) => s + (r.willNeed - r.have), 0)

  return (
    <div className="fe">
      <div className="fe-summary">
        <Stat n={totalTechs} label="techs defined" />
        <Stat n={feas.totalNeeded} label="picks a full run costs" />
        <Stat n={feas.blocked.length} label="cells that dead-end" bad={feas.blocked.length > 0} />
        <Stat n={missing} label="techs still to write" bad={missing > 0} />
        <Stat n={feas.tight.length} label="cells with no real choice" warn={feas.tight.length > 0} />
        <Stat n={terminalMissing} label={`techs before ${ERAS[feas.active]} can open`} warn={terminalMissing > 0} />
        <Stat n={problems.length} label="schema problems" bad={problems.length > 0} />
      </div>

      <p className="fe-note">
        Each quadrant advances on its own clock and drafts only from its current era, so a cell
        must hold at least its threshold or the run stops there. A cell with exactly the
        threshold is not a choice — you take everything in it — so <b>slack</b> is what makes the
        draft a decision. With {OFFER_SIZE} cards offered at a time, a cell wants roughly
        threshold + 3 to feel like a draft.
        {feas.active < ERAS.length && (
          <> Showing the <b>{feas.active} eras currently in scope</b>; the remaining{' '}
          {ERAS.length - feas.active} are designed but parked in the backlog.</>
        )}
      </p>

      <div className="fe-grid-wrap">
        <table className="fe-grid">
          <thead>
            <tr>
              <th className="fe-era-h">Era</th>
              <th>needs</th>
              {QUADRANTS.map((q) => <th key={q} className={`q-${q}`}>{q}</th>)}
              <th>total</th>
            </tr>
          </thead>
          <tbody>
            {ERAS.slice(0, feas.active).map((name, era) => {
              const need = cell(QUADRANTS[0], era)?.need ?? thresholdFor(era)
              const total = QUADRANTS.reduce((s, q) => s + (cell(q, era)?.have ?? 0), 0)
              return (
                <tr key={name}>
                  <td className="fe-era">{era}. {name}</td>
                  <td className="fe-need">{need || '—'}</td>
                  {QUADRANTS.map((q) => {
                    const c = cell(q, era)
                    const state = need === 0 ? 'na' : c.have < need ? 'blocked' : c.slack < 2 ? 'tight' : 'ok'
                    return (
                      <td key={q} className={`fe-cell ${state}`} title={
                        need === 0 ? 'terminal era — nothing to advance to'
                          : `${c.have} techs, needs ${need}, slack ${c.slack}`
                      }>
                        <b>{c.have}</b>
                        {need > 0 && <span className="fe-slack">{c.slack >= 0 ? `+${c.slack}` : c.slack}</span>}
                      </td>
                    )
                  })}
                  <td className="fe-total">{total}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {feas.blocked.length > 0 && (
        <>
          <h3 className="fe-h">Cells that dead-end a run</h3>
          <ul className="fe-list">
            {feas.blocked.map((r) => (
              <li key={`${r.quadrant}-${r.era}`}>
                <b className={`q-${r.quadrant}`}>{r.quadrant}</b> · {r.eraName} —
                has {r.have}, needs {r.need}: <b>write {r.need - r.have} more</b>
              </li>
            ))}
          </ul>
        </>
      )}

      {(feas.terminalShort ?? []).length > 0 && (
        <>
          <h3 className="fe-h">Not blocking — needed only when a fourth era is added</h3>
          <ul className="fe-list">
            {feas.terminalShort.map((r) => (
              <li key={`t-${r.quadrant}-${r.era}`}>
                <b className={`q-${r.quadrant}`}>{r.quadrant}</b> · {r.eraName} —
                has {r.have}, will need {r.willNeed}: {r.willNeed - r.have} more
              </li>
            ))}
          </ul>
        </>
      )}

      {problems.length > 0 && (
        <>
          <h3 className="fe-h">Schema problems</h3>
          <ul className="fe-list bad">
            {problems.slice(0, 60).map((p) => <li key={p}>{p}</li>)}
            {problems.length > 60 && <li>…and {problems.length - 60} more</li>}
          </ul>
        </>
      )}
    </div>
  )
}

function Stat({ n, label, bad, warn }) {
  return (
    <div className={`fe-stat${bad ? ' bad' : ''}${warn ? ' warn' : ''}`}>
      <b>{n}</b>
      <span>{label}</span>
    </div>
  )
}
