import { TableauData } from './TableauData.js'
import { CivilizationData } from './CivilizationData.js'

/**
 * The complete current status of a game: which era we are in, the tableau, and
 * the civilization's resources/slots. Owned by GameManager.
 */
export class GameData {
  constructor(seed = 1) {
    this.era = 0 // era index into ERAS (0 = Stone)
    this.tableau = new TableauData(seed)
    this.civilization = new CivilizationData()
  }
}
