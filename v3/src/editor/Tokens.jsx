import { ICON_TOKENS } from '../game/data/schema.js'

const TOKEN_RE = /(:[a-z_]+:)/g

/**
 * Renders `:token:` markup as inline icons — the project's rule is icons over
 * words for resources, stats and unit classes, so a description reads
 * "+2 :food:" rather than "+2 food".
 *
 * Mirrors the game's `components/common/IconText.jsx`. It is duplicated rather
 * than shared because the editor is a tool with its own styling and must not
 * pull the game's CSS in behind it.
 */
export default function Tokens({ children }) {
  if (typeof children !== 'string') return children ?? null
  return (
    <>
      {children.split(TOKEN_RE).map((part, i) => {
        const m = /^:([a-z_]+):$/.exec(part)
        const src = m && ICON_TOKENS[m[1]]
        if (src) return <img key={i} className="tok" src={src} alt={m[1]} title={m[1]} />
        // An unknown token is a typo in the description — show it, loudly.
        if (m) return <span key={i} className="tok-bad" title="unknown icon token">{part}</span>
        return part
      })}
    </>
  )
}

