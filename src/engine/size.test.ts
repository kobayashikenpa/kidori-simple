// W・H の寸法の文字（第2.2版。仕様書 26.1：W・H は数字だけ）
import { describe, expect, it } from 'vitest'
import { isSizeInput, isSizeText, pastedSize, readSize, sizeText } from './size'

describe('readSize（保存した W・H の文字 → 寸法）', () => {
  it('数字はその数（小数も）', () => {
    expect(readSize('400')).toEqual({ ok: true, value: 400 })
    expect(readSize('379.5')).toEqual({ ok: true, value: 379.5 })
    expect(readSize('0.1')).toEqual({ ok: true, value: 0.1 })
  })

  it('空は「数字を入れてください」（入れている途中の印）', () => {
    expect(readSize('')).toEqual({ ok: false, kind: 'syntax', message: '数字を入れてください', incomplete: true })
    expect(readSize('  ')).toMatchObject({ ok: false, incomplete: true })
  })

  it('「12.」は小数点の後ろがまだ（入れている途中の印）', () => {
    expect(readSize('12.')).toEqual({ ok: false, kind: 'syntax', message: '「12.」の小数点の後ろに数字を入れてください', incomplete: true })
    expect(readSize('.')).toMatchObject({ ok: false, kind: 'syntax', incomplete: true })
  })

  it('0 と、小数第1位に丸めて 0 になる数は 0 以下（0.04）。0.05 は 0.1 として使える', () => {
    expect(readSize('0')).toEqual({ ok: false, kind: 'nonPositive', message: '0 より大きい数を入れてください' })
    expect(readSize('0.04')).toMatchObject({ ok: false, kind: 'nonPositive' })
    expect(readSize('0.05')).toEqual({ ok: true, value: 0.05 })
  })

  it('式・文字は使えない（前の版の式が残っていたとき）', () => {
    expect(readSize('天板.W - 20')).toEqual({ ok: false, kind: 'syntax', message: '「天板.W - 20」は使えません（W・H は数字だけです）' })
    expect(readSize('1800 - 40')).toMatchObject({ ok: false, kind: 'syntax' })
    expect(readSize('1.2.3')).toMatchObject({ ok: false, kind: 'syntax' })
  })

  it('全角の数字・前後の空白はそろえて読む', () => {
    expect(readSize('４００')).toEqual({ ok: true, value: 400 })
    expect(readSize(' 400 ')).toEqual({ ok: true, value: 400 })
  })
})

describe('isSizeText（保存の形：空か半角の数字）', () => {
  it('空・数字・小数は true、式・全角・空白入り・「12.」は false', () => {
    for (const t of ['', '400', '379.5', '0']) expect(isSizeText(t)).toBe(true)
    for (const t of ['天板.W', '1800 - 40', '４００', ' 400', '12.', '=400', '{n:a}']) expect(isSizeText(t)).toBe(false)
  })
})

describe('isSizeInput（キーで入れている途中も含めた形）', () => {
  it('数字と小数点1つだけなら true（「12.」「.」も途中として通す）', () => {
    for (const t of ['', '1', '12', '12.', '12.5', '.', '.5']) expect(isSizeInput(t)).toBe(true)
  })
  it('記号・部材の寸法・2つ目の小数点は false', () => {
    for (const t of ['1+2', '天板.W', '1.2.3', '-5', '1 2', '（1）']) expect(isSizeInput(t)).toBe(false)
  })
})

describe('pastedSize（W・H の欄に貼る文字）', () => {
  it('空は空にする', () => {
    expect(pastedSize('')).toBe('')
    expect(pastedSize('  ')).toBe('')
  })
  it('0 より大きい数は数字の文字にそろえて貼る（全角・余分な 0 も）', () => {
    expect(pastedSize('400')).toBe('400')
    expect(pastedSize('４００')).toBe('400')
    expect(pastedSize('400.50')).toBe('400.5')
    expect(pastedSize(' 12.25 ')).toBe('12.25')
  })
  it('0・式・名前の文字は貼らない', () => {
    for (const t of ['0', '0.0', '天板', '天板.W', '1800 - 40', '12.', '-5']) expect(pastedSize(t)).toBeUndefined()
  })
})

describe('sizeText（計算した値 → 保存する数字の文字。小数第1位まで）', () => {
  it('整数はそのまま、小数は第1位に丸める', () => {
    expect(sizeText(379)).toBe('379')
    expect(sizeText(100 / 3)).toBe('33.3')
    expect(sizeText(0.1 + 0.2)).toBe('0.3')
    expect(sizeText(1759.96)).toBe('1760')
  })
})
