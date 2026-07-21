/* This module intentionally colocates the context Provider with its useGame
   hook; react-refresh's "only export components" rule (dev fast-refresh only,
   not a correctness concern) does not apply cleanly here. */
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useSyncExternalStore } from 'react'

const GameContext = createContext(null)

/** Provides the single GameManager instance to the tree. */
export function GameProvider({ manager, children }) {
  return <GameContext.Provider value={manager}>{children}</GameContext.Provider>
}

/**
 * Returns the GameManager and subscribes the calling component to state
 * changes, so it re-renders whenever the manager emits (era change, etc.).
 *
 * The snapshot is the manager's monotonic version number (bumped by `_emit`),
 * not the state object — a deliberate, standard external-store pattern: React
 * re-reads it on each notification and re-renders when it changes (Object.is).
 * Components then read live data off the returned manager (`manager.data`).
 */
export function useGame() {
  const manager = useContext(GameContext)
  if (!manager) throw new Error('useGame must be used within a GameProvider')
  useSyncExternalStore(manager.subscribe, manager.getVersion)
  return manager
}
