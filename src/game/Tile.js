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
    // v2 tile model: a tile can hold ONE of each simultaneously.
    //   unit     — a deployed unit instance  { kind:'unit', key, level, hp, maxHp, ... }
    //   building — a deployed building instance { kind:'building', key, level, hp, maxHp, ... }
    //   underlay — an underlaid support (Road / City / booster) { kind:'building', key, level }
    this.unit = null
    this.building = null
    this.underlay = null
    // v1-city extras retained transitionally (reconciled when the City building lands).
    this.extras = []
  }

  // --- Transitional compat shims (v1 code still says `tile.occupant` / `underlap` / `city`) ---
  // `occupant` = the single unit-XOR-building the v1 code assumed. Getter prefers the unit
  // (front-line combatant); setter routes by kind. Migrated call sites use unit/building directly.
  get occupant() { return this.unit || this.building }
  set occupant(v) {
    if (!v) { this.unit = null; this.building = null }
    else if (v.kind === 'unit') this.unit = v
    else this.building = v
  }
  // Road/City both live in the single `underlay` slot now (v2: one underlay per tile).
  get underlap() { return this.underlay }
  set underlap(v) { this.underlay = v }
  get city() { return this.underlay?.key === 'city' ? this.underlay : null }
  set city(v) { if (v) this.underlay = v; else if (this.underlay?.key === 'city') this.underlay = null }

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
