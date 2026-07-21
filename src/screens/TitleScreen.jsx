import './TitleScreen.css'

/**
 * Placeholder title screen.
 *
 * For now this only presents the game's identity and a single entry point.
 * Menu options beyond "New Game" (Continue, Settings, Codex, etc.) are stubbed
 * as disabled and will be wired up as those systems come online.
 */
export default function TitleScreen({ onNewGame }) {
  return (
    <div className="title-screen">
      <div className="title-stars" aria-hidden="true" />

      <div className="title-content">
        <p className="title-kicker">an idle civilization roguelike</p>
        <h1 className="title-logo">AutoCiv</h1>
        <p className="title-tagline">
          Guide your civilization to dominance across space and time.
        </p>

        <nav className="title-menu">
          <button className="btn btn-primary" onClick={onNewGame}>
            New Game
          </button>
          <button className="btn btn-ghost" disabled title="Coming soon">
            Continue
          </button>
          <button className="btn btn-ghost" disabled title="Coming soon">
            Settings
          </button>
        </nav>
      </div>

      <footer className="title-footer">
        <span>Prototype build</span>
      </footer>
    </div>
  )
}
