import './TitleScreen.css'

/**
 * Title screen. The title art (logo, sky, civilization scene) all lives in the
 * Title Card image; we only overlay the menu buttons into the card's open space,
 * framed with the parchment 9-slice (Box).
 */
export default function TitleScreen({ onNewGame }) {
  return (
    <div className="title-screen">
      <div className="title-card">
        <nav className="title-menu">
          <button className="menu-btn" onClick={onNewGame}>New Game</button>
          <button className="menu-btn" disabled title="Coming soon">Continue</button>
          <button className="menu-btn" disabled title="Coming soon">Settings</button>
        </nav>
      </div>
    </div>
  )
}
