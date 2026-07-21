import { trackForEra } from '../data/eras.js'

const FADE_MS = 1100
const FADE_STEP_MS = 40

/**
 * Plays the soundtrack, switching tracks by era with a clean cross-fade.
 * Tracks loop seamlessly. Browsers block autoplay until a user gesture, so the
 * desired track is remembered in `wantedSrc` and (re)started whenever playback
 * is enabled or resumed via a gesture.
 *
 * Playback is modeled as a list of channels; a single fade loop ramps the one
 * "in" channel up to volume and every "out" channel down to zero (pausing +
 * dropping them at zero). This guarantees only one track ends up audible even
 * when the era changes faster than a fade completes — no track pile-up.
 */
export class AudioManager {
  constructor(volume = 0.5) {
    this.volume = volume
    this.enabled = false
    this.wantedSrc = null      // the track that should end up audible
    this._active = null        // the element for wantedSrc
    this._channels = []        // [{ el, dir: 'in' | 'out' }]
    this._fadeTimer = null
  }

  /** Unlock/confirm playback (call from a user gesture). */
  enable() {
    this.enabled = true
    this._ensurePlaying()
  }

  /** Request a specific track by src (cross-fades from whatever is playing). */
  playTrack(src) {
    this.wantedSrc = src
    this._ensurePlaying()
  }

  /** Request the correct track for the given era index. */
  playForEra(eraIndex) {
    this.playTrack(trackForEra(eraIndex).src)
  }

  setVolume(v) {
    this.volume = v
    for (const ch of this._channels) if (ch.dir === 'in') ch.el.volume = v
  }

  stop() {
    if (this._fadeTimer) { clearInterval(this._fadeTimer); this._fadeTimer = null }
    for (const ch of this._channels) { try { ch.el.pause() } catch { /* ignore */ } }
    this._channels = []
    this._active = null
    this.wantedSrc = null
  }

  _ensurePlaying() {
    if (!this.enabled || !this.wantedSrc) return
    if (this._active && this._active._src === this.wantedSrc && !this._active.paused) return
    this._crossfadeTo(this.wantedSrc)
  }

  _crossfadeTo(src) {
    // Whatever is playing now must fade out; the new element fades in.
    for (const ch of this._channels) ch.dir = 'out'

    const el = new Audio(src)
    el._src = src
    el.loop = true
    el.volume = 0
    const p = el.play()
    if (p?.catch) p.catch(() => {
      // Autoplay blocked — drop this channel so a later gesture retries.
      this._channels = this._channels.filter((c) => c.el !== el)
      if (this._active === el) this._active = null
    })

    this._channels.push({ el, dir: 'in' })
    this._active = el
    this._startFade()
  }

  _startFade() {
    if (this._fadeTimer) return // the running loop already services all channels
    const step = this.volume * (FADE_STEP_MS / FADE_MS)
    this._fadeTimer = setInterval(() => {
      let busy = false
      for (const ch of this._channels.slice()) {
        if (ch.dir === 'in') {
          if (ch.el.volume < this.volume) {
            ch.el.volume = Math.min(this.volume, ch.el.volume + step)
            busy = true
          }
        } else {
          const next = ch.el.volume - step
          if (next <= 0) {
            try { ch.el.pause() } catch { /* ignore */ }
            this._channels = this._channels.filter((c) => c !== ch)
          } else {
            ch.el.volume = next
            busy = true
          }
        }
      }
      if (!busy) { clearInterval(this._fadeTimer); this._fadeTimer = null }
    }, FADE_STEP_MS)
  }
}
