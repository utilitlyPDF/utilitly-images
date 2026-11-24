import { describe, it, expect } from 'vitest'
import { parseHex, resolveEncoding } from './options'

const WHITE = { r: 255, g: 255, b: 255 }

describe('resolveEncoding', () => {
  it('fills in quality 90, a white background and the fallback format', () => {
    expect(resolveEncoding(undefined, 'png')).toEqual({ format: 'png', quality: 90, background: WHITE })
    expect(resolveEncoding({}, 'webp')).toEqual({ format: 'webp', quality: 90, background: WHITE })
  })

  it('takes what it is given', () => {
    expect(resolveEncoding({ format: 'jpg', quality: 40, background: '#000' }, 'png'))
      .toEqual({ format: 'jpeg', quality: 40, background: { r: 0, g: 0, b: 0 } })
    expect(resolveEncoding({ quality: 100, background: '#1a2B3c' }, 'jpeg'))
      .toEqual({ format: 'jpeg', quality: 100, background: { r: 0x1a, g: 0x2b, b: 0x3c } })
  })

  // 40-100 is the free Convert Image tool's range; lower is Compress Image's territory (Basic).
  it('rejects a quality outside 40-100 or not a number', () => {
    for (const quality of [39, 1, 0, 101, NaN, Infinity, '90']) {
      expect(() => resolveEncoding({ quality } as never, 'png'), String(quality)).toThrow(expect.objectContaining({
        code: 'INVALID_OPTIONS',
        message: expect.stringMatching(/^quality must be a number from 40 to 100, not /),
      }))
    }
  })

  it('rejects a background that is not a hex color', () => {
    expect(() => resolveEncoding({ background: 'red' }, 'png')).toThrow(expect.objectContaining({ code: 'INVALID_OPTIONS' }))
    expect(() => resolveEncoding({ background: 0xffffff } as never, 'png')).toThrow(expect.objectContaining({ code: 'INVALID_OPTIONS' }))
  })

  it('rejects an unknown format', () => {
    expect(() => resolveEncoding({ format: 'gif' } as never, 'png')).toThrow(expect.objectContaining({ code: 'INVALID_OPTIONS' }))
  })
})

describe('parseHex', () => {
  it('takes 6 digits with or without #, in any case', () => {
    expect(parseHex('#00FF7f')).toBe('#00ff7f')
    expect(parseHex('00ff7f')).toBe('#00ff7f')
    expect(parseHex('  #abcdef ')).toBe('#abcdef')
  })

  it('expands 3 digits', () => {
    expect(parseHex('#f0a')).toBe('#ff00aa')
    expect(parseHex(' FFF ')).toBe('#ffffff')
  })

  it('is null for anything else', () => {
    for (const s of ['', '#', 'ff', '#ffff', 'fffff', '#fffffff', 'ggg', 'red', '#12 456', 'rgb(0,0,0)']) {
      expect(parseHex(s)).toBeNull()
    }
  })
})
