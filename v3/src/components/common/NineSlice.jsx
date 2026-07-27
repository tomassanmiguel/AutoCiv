import './NineSlice.css'

const toLen = (v) =>
  typeof v === 'number'
    ? `${v}px`
    : String(v).trim().split(/\s+/).map((t) => (/^\d+(\.\d+)?$/.test(t) ? `${t}px` : t)).join(' ')

/**
 * Renders a scalable 9-sliced frame from a single sprite using CSS
 * `border-image`. The four corners stay fixed, the edges fill (stretch/tile),
 * and the center fills — so one frame PNG can wrap a box of any size.
 *
 * @param {string} src     frame image URL.
 * @param {number|string} slice  border inset in SOURCE pixels — the distance from
 *   each edge to where the corner/edge art ends (a single number, or a CSS
 *   "top right bottom left" list). This is the "9-slice" cut.
 * @param {number|string} [width]  rendered border thickness in CSS px
 *   (defaults to `slice`). Set smaller than `slice` to shrink an ornate frame.
 * @param {boolean} [fill=true]  render the sprite's center region as the box
 *   background (true for panels; false for a hollow border only).
 * @param {'stretch'|'repeat'|'round'|'space'} [repeat='stretch']  edge behavior.
 * @param {boolean} [pixel=false]  crisp scaling for pixel-art frames.
 */
export default function NineSlice({
  src,
  slice = 16,
  width,
  fill = true,
  repeat = 'stretch',
  pixel = false,
  className = '',
  style,
  children,
  ...rest
}) {
  return (
    <div
      className={`nine-slice${pixel ? ' nine-slice--pixel' : ''}${className ? ' ' + className : ''}`}
      style={{
        borderStyle: 'solid',
        borderColor: 'transparent',
        borderWidth: toLen(width ?? slice),
        borderImageSource: `url("${src}")`,
        borderImageSlice: `${slice}${fill ? ' fill' : ''}`,
        borderImageWidth: toLen(width ?? slice),
        borderImageRepeat: repeat,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  )
}
