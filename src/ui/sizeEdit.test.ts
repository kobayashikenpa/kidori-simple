import { describe, expect, it } from 'vitest'
import { pressSizeKey, SIZE_MAX_LEN, type SizeKey } from './sizeEdit'

/** 空から続けてキーを押す */
function typeKeys(keys: SizeKey[], start = { text: '', cursor: 0 }) {
  return keys.reduce((e, k) => pressSizeKey(e.text, e.cursor, k), start)
}

describe('W・H の数字のキー（仕様書 26.1）', () => {
  it('数字を続けて入れる・小数点は1つだけ', () => {
    expect(typeKeys(['3', '7', '9'])).toEqual({ text: '379', cursor: 3 })
    expect(typeKeys(['1', '2', '.', '5', '.'])).toEqual({ text: '12.5', cursor: 4 })
  })

  it('入れている途中の「12.」も入る（保存して、計算では途中の印）', () => {
    expect(typeKeys(['1', '2', '.'])).toEqual({ text: '12.', cursor: 3 })
  })

  it('先頭の小数点は「0.」、先頭の余分な 0 は外す', () => {
    expect(typeKeys(['.', '5'])).toEqual({ text: '0.5', cursor: 3 })
    expect(typeKeys(['0', '5'])).toEqual({ text: '5', cursor: 1 })
    expect(typeKeys(['0', '.', '5'])).toEqual({ text: '0.5', cursor: 3 })
  })

  it('◀ ▶ でカーソルを動かし、その位置に入れる・消す', () => {
    const at = typeKeys(['4', '0', '0', 'left', 'left'])
    expect(at).toEqual({ text: '400', cursor: 1 })
    expect(pressSizeKey(at.text, at.cursor, '5')).toEqual({ text: '4500', cursor: 2 })
    expect(pressSizeKey(at.text, at.cursor, 'back')).toEqual({ text: '00', cursor: 0 })
    expect(pressSizeKey('400', 0, 'left')).toEqual({ text: '400', cursor: 0 })
    expect(pressSizeKey('400', 3, 'right')).toEqual({ text: '400', cursor: 3 })
  })

  it('1字消す・全部消す', () => {
    expect(pressSizeKey('1800', 4, 'back')).toEqual({ text: '180', cursor: 3 })
    expect(pressSizeKey('1800', 0, 'back')).toEqual({ text: '1800', cursor: 0 })
    expect(pressSizeKey('1800', 2, 'clear')).toEqual({ text: '', cursor: 0 })
  })

  it('長すぎるときは入れない', () => {
    const full = '1'.repeat(SIZE_MAX_LEN)
    expect(pressSizeKey(full, SIZE_MAX_LEN, '2')).toEqual({ text: full, cursor: SIZE_MAX_LEN })
  })

  it('数字・小数点のほかは入らない（式の記号のキーは無い）', () => {
    expect(pressSizeKey('400', 3, '+' as SizeKey)).toEqual({ text: '400', cursor: 3 })
  })
})
