import { TERRAIN } from './data/terrain.js'

/**
 * A single tableau tile. Kept intentionally simple for now — as the game grows,
 * this will also hold the deployed unit/building, ownership, etc.
 *
 * `getTooltip()` returns the content shown when the tile is hovered. Each tile
 * owns this method so different tiles can eventually surface different details;
 * for now every tile just reports its terrain type.
 */
export class Tile {
  constructor({ row, col, label, terrain, flipX = false }) {
    this.row = row       // 1..9, bottom -> top
    this.col = col       // 1..26, left -> right
    this.label = label   // design label from the sheet (e.g. 'Old World')
    this.terrain = terrain // resolved concrete terrain key (e.g. 'plains')
    this.flipX = flipX   // mirror the sprite horizontally (west-facing coasts)
    // A deployed unit/building instance, or null. Shape:
    //   { kind:'unit'|'building', key, level, hp, maxHp, damaged, lifetimeOutput? }
    this.occupant = null
    // An UNDERLAPPING building (e.g. Road) that shares the tile with the occupant in
    // its own slot — never replaced, no combat/HP. Shape: { kind:'building', key, level }.
    this.underlap = null
    // An underlaid CITY (its own slot, independent of a Road) that lets this tile hold
    // extra buildings. Shape: { kind:'building', key:'city', level }. `extras` holds the
    // additional (non-underlaid) buildings, each { kind:'building', key, level, hp, … }.
    this.city = null
    this.extras = []
  }

  get def() {
    return TERRAIN[this.terrain] ?? null
  }

  get sprite() {
    return this.def?.sprite ?? null
  }

  get color() {
    return this.def?.color ?? '#333'
  }

  getTooltip() {
    return {
      title: this.def?.name ?? this.terrain,
      lines: this.def?.note ? [this.def.note] : [], // terrain's special effect, if any
    }
  }
}
