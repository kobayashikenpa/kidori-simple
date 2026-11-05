import { describe, expect, it } from 'vitest'
import { AXES, BOARD_SIZES, DEFAULT_SETTINGS } from './types'

describe('AXES', () => {
  it('W・H の2つだけ（厚み・D は無い）', () => {
    expect(AXES).toEqual(['W', 'H'])
  })
})

describe('DEFAULT_SETTINGS（仕事の設定の数値の初期値）', () => {
  it('刃厚3・端切り5・切り代0（第2.3版。仕様書 27.6。第2.2版までは 10）・縦切り優先', () => {
    expect(DEFAULT_SETTINGS).toEqual({ kerf: 3, trim: 5, allowance: 0, cutMode: 'vertical' })
  })
})

describe('BOARD_SIZES（定尺板の大きさ［妻手, 長手］）', () => {
  it('3×6 は 910×1820', () => {
    expect(BOARD_SIZES.saburoku).toEqual([910, 1820])
  })
  it('4×8 は 1220×2430（kidori の 2440 ではない）', () => {
    expect(BOARD_SIZES.shihachi).toEqual([1220, 2430])
  })
})
