import { useGame } from '../../game/react/GameProvider.jsx'
import { MAX_WAVES, PHASE_LABEL } from '../../game/manager/combat.js'
import { waveBudget } from '../../game/data/enemies.js'
import InfoTip from '../common/InfoTip.jsx'
import './CombatPanel.css'

const RESULT_TEXT = {
  won: 'Wave repelled',
  lost: 'The palace has fallen',
  stalemate: 'Stalemate — turn cap reached',
}

/**
 * Combat scaffolding controls: pick a wave and a host strength, generate, then
 * watch it play out. One PIECE acts per beat, so the speeds are beats/second and
 * the phase readout tells you which of the four phases is running. "Resolve"
 * skips to the end. Deliberately a debug bar, not a game UI — there is no
 * campaign yet, just "simulate this wave".
 */
export default function CombatPanel() {
  const game = useGame()
  const c = game.combat
  const live = c.enemies.filter((e) => !e.dead).length
  const palacePct = c.palace ? Math.round((c.palace.hp / c.palace.maxHp) * 100) : 100
  // The era's own wave owns the board; the debug controls would clobber it.
  const eraWave = c.active && !c.scratch

  return (
    <div className={`combat-panel${eraWave ? ' era-wave' : ''}`}>
      <div className="cp-setup" hidden={eraWave}>
        <label className="cp-field">
          <span className="cp-label">Wave <b>{c.wave}</b> / {MAX_WAVES}</span>
          <input
            type="range" min={1} max={MAX_WAVES} value={c.wave}
            onChange={(e) => game.setWave(Number(e.target.value))}
          />
        </label>

        <InfoTip
          className="cp-field"
          title="Host strength"
          text={`Multiplies the wave's HP budget. The garrison is bought at a fixed fraction of the strength-1 budget, so raising this genuinely makes the wave harder. Budget: ${Math.round(waveBudget(c.wave, c.strength))} HP.`}
        >
          <span className="cp-label">Strength <b>{c.strength.toFixed(2)}×</b></span>
          <input
            type="range" min={0.25} max={3} step={0.25} value={c.strength}
            onChange={(e) => game.setStrength(Number(e.target.value))}
          />
        </InfoTip>

        <button className="cp-go" onClick={() => game.simulateCombat()}>
          {c.active ? 'Regenerate' : 'Simulate Combat'}
        </button>
      </div>

      {c.active && (
        <>
          <div className="cp-speeds">
            <span className="cp-note">runs on the main clock →</span>
            <button
              className="cp-speed step"
              onClick={() => { game.setSpeed('paused'); game.combatStep() }}
              disabled={!!c.result}
            >Step</button>
            <button
              className="cp-speed step"
              onClick={() => game.resolveCombat()}
              disabled={!!c.result}
            >Resolve</button>
          </div>

          <div className="cp-status">
            <span>{eraWave ? <b>Wave {c.wave}</b> : <>Turn <b>{c.turn}</b></>}</span>
            {c.phase && !c.result && <span className={`cp-phase ${c.phase}`}>{PHASE_LABEL[c.phase]}</span>}
            <span className="cp-sep" />
            <span className="cp-enemies">{live} enemy</span>
            <span className="cp-units">{c.units.filter((u) => !u.dead).length} defender</span>
            {c.razed > 0 && <span className="cp-razed">{c.razed} razed</span>}
            <span className="cp-sep" />
            <span className={`cp-palace${palacePct < 40 ? ' danger' : ''}`}>
              Palace {palacePct}%
            </span>
            {c.result && <span className={`cp-result ${c.result}`}>{RESULT_TEXT[c.result]}</span>}
            {!eraWave && <button className="cp-close" onClick={() => game.endCombat()}>Clear</button>}
          </div>
        </>
      )}
    </div>
  )
}

