// Standalone markers carry no length: TEM and the restart markers RST0-RST7.
const STANDALONE = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)

/**
 * Whether a JPEG has its end-of-image marker after its first scan.
 *
 * MozJPEG treats a file that was cut short as a warning: it fills the missing
 * part with gray and returns the picture as if nothing were wrong. A complete
 * JPEG always ends its image data with FF D9, and inside the image data a
 * literal FF byte is always followed by 00, so finding FF D9 after the scan
 * starts is enough. Marker segments before the scan (an EXIF thumbnail, say)
 * can hold their own FF D9, so they're walked over by their lengths.
 */
export function jpegHasEnd(bytes: Uint8Array): boolean {
  let i = 2
  for (;;) {
    if (i + 4 > bytes.length) return false
    if (bytes[i] !== 0xff) return false
    const marker = bytes[i + 1]
    if (marker === 0xff) { i++; continue }
    if (STANDALONE(marker)) { i += 2; continue }
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    i += 2 + length
    if (marker === 0xda) break
  }
  for (let j = i; j + 1 < bytes.length; j++) {
    if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) return true
  }
  return false
}
