import { describe, it, expect } from 'vitest'
import { detectFormat, otherFormatName, parseFormat } from './format'

const bytes = (...values: number[]) => new Uint8Array(values)
const ascii = (text: string) => new Uint8Array([...text].map(c => c.charCodeAt(0)))
const PNG_SIGNATURE = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
/** An ISO-BMFF file's first box: size, 'ftyp', then the major brand. */
const ftyp = (brand: string) => new Uint8Array([0, 0, 0, 24, ...ascii('ftyp'), ...ascii(brand), 0, 0, 0, 0])

describe('detectFormat', () => {
  it('recognises the three formats by their first bytes', () => {
    expect(detectFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg')
    expect(detectFormat(PNG_SIGNATURE)).toBe('png')
    expect(detectFormat(ascii('RIFF\0\0\0\0WEBP'))).toBe('webp')
  })

  it('is null for anything else, including other RIFF files and empty input', () => {
    expect(detectFormat(ascii('RIFF\0\0\0\0WAVE'))).toBeNull()
    expect(detectFormat(new Uint8Array())).toBeNull()
    expect(detectFormat(bytes(0xff, 0xd8))).toBeNull()
    expect(detectFormat(PNG_SIGNATURE.subarray(0, 7))).toBeNull()
  })
})

describe('otherFormatName', () => {
  it('names the formats people most often pass by mistake', () => {
    expect(otherFormatName(ascii('GIF89a'))).toBe('GIF')
    expect(otherFormatName(ascii('BM\0\0'))).toBe('BMP')
    expect(otherFormatName(ascii('II*\0'))).toBe('TIFF')
    expect(otherFormatName(ascii('MM\0*'))).toBe('TIFF')
    expect(otherFormatName(ascii('%PDF-1.7'))).toBe('PDF')
    expect(otherFormatName(bytes(0xff, 0x0a, 0x00))).toBe('JPEG XL')
    expect(otherFormatName(bytes(0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a))).toBe('JPEG XL')
  })

  it('tells HEIC from AVIF by the ftyp brand', () => {
    expect(otherFormatName(ftyp('heic'))).toBe('HEIC')
    expect(otherFormatName(ftyp('mif1'))).toBe('HEIC')
    expect(otherFormatName(ftyp('avif'))).toBe('AVIF')
  })

  it('spots SVG text after a byte-order mark and whitespace, or after an XML declaration', () => {
    expect(otherFormatName(new TextEncoder().encode('﻿  <svg xmlns="http://www.w3.org/2000/svg">'))).toBe('SVG')
    expect(otherFormatName(new TextEncoder().encode('<?xml version="1.0"?>\n<svg>'))).toBe('SVG')
    expect(otherFormatName(new TextEncoder().encode('<?xml version="1.0"?>\n<html>'))).toBeNull()
  })

  it('is null when it has no name for the bytes', () => {
    expect(otherFormatName(bytes(1, 2, 3))).toBeNull()
    expect(otherFormatName(new Uint8Array())).toBeNull()
  })
})

describe('parseFormat', () => {
  it("takes the three formats, with 'jpg' as another name for JPEG", () => {
    expect(parseFormat('jpg')).toBe('jpeg')
    expect(parseFormat('jpeg')).toBe('jpeg')
    expect(parseFormat('png')).toBe('png')
    expect(parseFormat('webp')).toBe('webp')
  })

  it('rejects anything else, naming the option', () => {
    expect(() => parseFormat('gif')).toThrow(expect.objectContaining({ code: 'INVALID_OPTIONS' }))
    expect(() => parseFormat('JPEG')).toThrow(expect.objectContaining({ code: 'INVALID_OPTIONS' }))
    expect(() => parseFormat(undefined, 'to')).toThrow(/^to must be 'jpeg', 'png' or 'webp', not undefined\.$/)
  })
})
