import { describe, expect, it } from 'vitest'
import { pressSizeKey, SIZE_FORMULA_MAX_LEN, SIZE_MAX_LEN, type SizeKey } from './sizeEdit'

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

  it('数字・小数点・式の記号のほかは入らない', () => {
    expect(pressSizeKey('400', 3, 'x' as SizeKey)).toEqual({ text: '400', cursor: 3 })
  })
})

describe('幅・長さの式のキー（仕様書 27.1・27.2）', () => {
  it('＋ − × ÷ ( ) は半角の + - * / ( ) で文字に足す', () => {
    expect(typeKeys(['4', '5', '0', '-', '5', '0'])).toEqual({ text: '450-50', cursor: 6 })
    expect(typeKeys(['(', '9', '0', '0', '-', '1', '8', ')', '/', '2'])).toEqual({ text: '(900-18)/2', cursor: 10 })
    expect(typeKeys(['3', '*', '2', '+', '1'])).toEqual({ text: '3*2+1', cursor: 5 })
  })

  it('入れている途中の形（終わりが記号・かっこが閉じていない）も入る', () => {
    expect(typeKeys(['4', '5', '0', '-'])).toEqual({ text: '450-', cursor: 4 })
    expect(typeKeys(['(', '9'])).toEqual({ text: '(9', cursor: 2 })
  })

  it('数の始めの小数点は「0.」、数の始めの余分な 0 は外す（式の中でも）', () => {
    expect(typeKeys(['4', '5', '0', '-', '.', '5'])).toEqual({ text: '450-0.5', cursor: 7 })
    expect(typeKeys(['4', '5', '0', '-', '0', '5'])).toEqual({ text: '450-5', cursor: 5 })
    expect(typeKeys(['1', '0', '0', '+', '0'])).toEqual({ text: '100+0', cursor: 5 })
  })

  it('1つの数の小数点は1つだけ（式の別の数には入る）', () => {
    expect(typeKeys(['1', '.', '5', '+', '2', '.', '5', '.'])).toEqual({ text: '1.5+2.5', cursor: 7 })
  })

  it('式の途中にカーソルを動かして記号を入れる・消す', () => {
    const at = typeKeys(['4', '5', '0', '5', '0', 'left', 'left'])
    expect(pressSizeKey(at.text, at.cursor, '-')).toEqual({ text: '450-50', cursor: 4 })
    expect(pressSizeKey('450-50', 4, 'back')).toEqual({ text: '45050', cursor: 3 })
  })

  it('1つの数は SIZE_MAX_LEN 字まで、式の全体は SIZE_FORMULA_MAX_LEN 字まで', () => {
    const num = '1'.repeat(SIZE_MAX_LEN)
    expect(pressSizeKey(`${num}+`, SIZE_MAX_LEN + 1, '2')).toEqual({ text: `${num}+2`, cursor: SIZE_MAX_LEN + 2 })
    const long = '1+'.repeat(SIZE_FORMULA_MAX_LEN / 2).slice(0, SIZE_FORMULA_MAX_LEN)
    expect(pressSizeKey(long, long.length, '1')).toEqual({ text: long, cursor: long.length })
  })
})
