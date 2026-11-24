/**
 * How a viewer must turn or mirror the stored pixels to show the photo
 * upright, from the EXIF orientation tag. 1 is already upright; 6 is the
 * usual one for a phone held upright (turn 90° clockwise).
 */
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

const ORIENTATION_TAG = 0x0112
const SHORT = 3

/**
 * The orientation in a TIFF block (what an EXIF segment holds), or 1 when the
 * block has none, has a value outside 1-8, or can't be read. Never throws: a
 * damaged EXIF block shouldn't stop an otherwise good photo from opening.
 */
export function orientationFromTiff(tiff: Uint8Array): Orientation {
  if (tiff.length < 8) return 1
  const order = String.fromCharCode(tiff[0], tiff[1])
  if (order !== 'II' && order !== 'MM') return 1
  const le = order === 'II'
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength)
  if (view.getUint16(2, le) !== 42) return 1
  const ifd = view.getUint32(4, le)
  if (ifd + 2 > tiff.length) return 1
  const count = view.getUint16(ifd, le)
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > tiff.length) return 1
    if (view.getUint16(entry, le) !== ORIENTATION_TAG) continue
    if (view.getUint16(entry + 2, le) !== SHORT) return 1
    const value = view.getUint16(entry + 8, le)
    return value >= 1 && value <= 8 ? (value as Orientation) : 1
  }
  return 1
}
