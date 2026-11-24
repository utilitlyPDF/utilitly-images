// CRC-32 as PNG uses it (polynomial 0xEDB88320), one table built on first use.
let table: Uint32Array | undefined

function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Whether a PNG's chunks are all whole and their checksums match, and there
 * is image data, so the decoder only ever sees files without visible damage.
 *
 * The decoder would refuse a bad checksum too, but each failure inside it
 * costs memory it never gives back; and a file cut off inside its image data
 * it decodes "successfully", with the missing part blank. A file that stops
 * neatly after a chunk, without its end marker, is accepted, as browsers do.
 */
export function pngIsSound(bytes: Uint8Array): boolean {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let imageData = false
  let i = 8
  while (i < bytes.length) {
    if (i + 12 > bytes.length) return false
    const length = view.getUint32(i)
    const end = i + 12 + length
    if (end > bytes.length) return false
    if (crc32(bytes.subarray(i + 4, i + 8 + length)) !== view.getUint32(i + 8 + length)) return false
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7])
    if (type === 'IDAT') imageData = true
    if (type === 'IEND') break
    i = end
  }
  return imageData
}
