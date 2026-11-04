import { describe, expect, it } from 'vitest'
import { legacyShelfJob as shelfJob, shelfAdjusts } from '../engine/fixtures/shelf'
import { legacyComputeDimensions } from '../engine/migrate/legacyDimensions'
import type { Axis } from '../engine/types'
import { dimCell, isNumberOnly } from './partCells'
import type { PartsTab } from './partsTab'

function cellOf(name: string, axis: Axis, tab: PartsTab, edit?: (job: ReturnType<typeof shelfJob>) => void) {
  const job = shelfJob()
  edit?.(job)
  const adjusts = shelfAdjusts()
  // 式の表示は U-27 でなくす。それまでは前の版の式の見本で確かめる
  const dims = legacyComputeDimensions(job, adjusts)
  const part = job.parts.find((p) => p.name === name)!
  return dimCell(part, dims.parts.find((d) => d.partId === part.id), axis, tab, adjusts)
}

describe('部材の一覧の W・H の欄（仕様書 5.2・6章の例）', () => {
  it('数値だけなら数値だけ（全体 W400）。木取りのタブは木取り寸法', () => {
    expect(cellOf('全体', 'W', 'finished')).toEqual({ kind: 'number', value: 400 })
    expect(cellOf('側板', 'H', 'cut')).toEqual({ kind: 'number', value: 710 })
  })
  it('式なら 式 ｜ 計算した寸法。棚板 W＝天板.W − 20 − メラミン1 ｜ 379（木取り 389）', () => {
    expect(cellOf('棚板', 'W', 'finished')).toEqual({ kind: 'formula', formula: '天板.W − 20 − メラミン1', value: 379 })
    expect(cellOf('棚板', 'W', 'cut')).toEqual({ kind: 'formula', formula: '天板.W − 20 − メラミン1', value: 389 })
    expect(cellOf('棚板', 'H', 'finished')).toEqual({ kind: 'formula', formula: '天板.H − 20 × 2', value: 1760 })
  })
  it('式がエラーなら理由（engine の message）を持つ', () => {
    const c = cellOf('側板', 'W', 'finished', (j) => {
      j.parts[2].expr.W = '奥板.W'
    })
    expect(c.kind).toBe('error')
    if (c.kind === 'error') {
      expect(c.formula).toBe('奥板.W')
      expect(c.messages.join('')).toContain('奥板')
    }
  })
  it('空の式もエラー', () => {
    const c = cellOf('側板', 'H', 'finished', (j) => {
      j.parts[2].expr.H = ''
    })
    expect(c).toMatchObject({ kind: 'error', formula: null })
  })
  it('isNumberOnly', () => {
    expect(isNumberOnly('900')).toBe(true)
    expect(isNumberOnly('12.5')).toBe(true)
    expect(isNumberOnly('')).toBe(false)
    expect(isNumberOnly('900 - 1')).toBe(false)
    expect(isNumberOnly('全体.W')).toBe(false)
  })
})
