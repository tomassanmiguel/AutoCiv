import { useGame } from '../../game/react/GameProvider.jsx'
import { UNIT_DEFS, UNIT_ORDER } from '../../game/data/units.js'
import { classTrees } from '../../game/data/upgrades.js'
import './UpgradeModal.css'

/**
 * Per-class upgrade trees (v1 stub: one atk tree + one def tree each). Nodes are
 * SPARSE (skip levels); a node is buyable when its level ≤ the Military ceiling
 * and it's affordable. Locked classes' trees are simply not shown (in v1 a class's
 * trees appear once the class is unlocked).
 */
export default function UpgradeModal() {
  const game = useGame()
  if (!game.ui.upgrade) return null
  const classes = UNIT_ORDER.filter((c) => game.unlockedClasses.has(c))
  const ceiling = 1 + game.mods.upgradeCeiling

  return (
    <div className="upg-backdrop" onClick={() => game.toggleUpgrade()}>
      <div className="upg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="upg-head">
          <h2>Upgrades</h2>
          <span className="upg-ceiling">Max upgrade level <b>{ceiling}</b> · raise it with Military progress</span>
          <button className="upg-close" onClick={() => game.toggleUpgrade()}>✕</button>
        </div>
        <div className="upg-classes">
          {classes.map((cls) => (
            <div key={cls} className="upg-class" style={{ '--flavor': UNIT_DEFS[cls].flavor }}>
              <div className="upg-class-name">{UNIT_DEFS[cls].name}</div>
              <div className="upg-trees">
                {classTrees(cls).map(({ tree, nodes }) => (
                  <div key={tree} className="upg-tree">
                    <div className="upg-tree-name">{tree === 'atk' ? 'Attack' : 'Defense'}</div>
                    {nodes.slice().reverse().map((node) => {
                      const owned = game.upgrades[cls][tree] >= node.tier
                      const isNext = game.upgrades[cls][tree] === node.tier - 1
                      const info = isNext ? game.upgradeInfo(cls, tree) : null
                      const buyable = isNext && game.canUpgrade(cls, tree)
                      return (
                        <div key={node.id} className={`upg-node${owned ? ' owned' : ''}${info && !info.unlocked ? ' locked' : ''}`}>
                          <span className="un-lvl">L{node.level}</span>
                          <span className="un-add">+{node.add}</span>
                          {owned ? <span className="un-tag">✓</span>
                            : isNext ? (
                              <button className="un-buy" disabled={!buyable} onClick={() => game.buyUpgrade(cls, tree)}>
                                {info && !info.unlocked ? '🔒' : <><img src="/sprites/icons/gold.png" alt="g" />{info?.cost}</>}
                              </button>
                            ) : <span className="un-tag">—</span>}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="upg-foot">Upgrades apply to every unit of the class, are permanent, and survive death. Buy in prep.</div>
      </div>
    </div>
  )
}
