import { describe, expect, it } from 'vitest'
import { defaultSettings } from '../engine/defaults'
import { computeDimensions } from '../engine/dimensions'
import { legacyShelfJob, shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
import { findSavingHint } from '../engine/hints/saving'
import { legacyComputeDimensions } from '../engine/migrate/legacyDimensions'
import { packJob } from '../engine/packing'
import { SAMPLE_NAME, sampleJob } from './sample'

const T = new Date(2026, 9, 22, 9, 0, 0)

function ids() {
  let n = 0
  return (prefix: string) => `${prefix}-${++n}`
}

const pct = (r: number) => Math.round(r * 1000) / 10

describe('見本の仕事（仕様書 16.7・19.1。第2.2版から数字だけ）', () => {
  it('名前は「見本 棚」、設定は初期値、部材は6章の棚から「全体」を除いた3つ（天板 400×1800・側板 400×700・棚板 379×1760）', () => {
    const job = sampleJob(T, ids())
    expect(job.name).toBe(SAMPLE_NAME)
    expect(job.settings).toEqual(defaultSettings())
    expect(job.parts.map((p) => [p.name, p.expr.W, p.expr.H, p.quantity])).toEqual([
      ['天板', '400', '1800', 1],
      ['側板', '400', '700', 2],
      ['棚板', '379', '1760', 3],
    ])
  })

  it('6章のテスト用の棚と同じ寸法・木取り（4×8・縦切り優先 2枚・57.2%）。前の版の式の見本と同じ並べ方', () => {
    const job = sampleJob(T, ids())
    const dims = computeDimensions(job)
    expect(dims.errors).toEqual([])
    expect(dims.parts.map((d) => [d.name, d.finished, d.cut])).toEqual([
      ['天板', { W: 400, H: 1800 }, { W: 410, H: 1810 }],
      ['側板', { W: 400, H: 700 }, { W: 410, H: 710 }],
      ['棚板', { W: 379, H: 1760 }, { W: 389, H: 1770 }],
    ])
    const r = packJob(job, dims)
    expect(job.settings.sheet.sizeKind).toBe('shihachi')
    expect(job.settings.cutMode).toBe('vertical')
    expect(r.sheets).toHaveLength(2)
    expect(pct(r.yieldRate)).toBe(57.2)
    expect(packJob(shelfJob(), computeDimensions(shelfJob())).yieldRate).toBe(r.yieldRate)
    const legacy = legacyShelfJob()
    expect(packJob(legacy, legacyComputeDimensions(legacy, shelfAdjusts())).yieldRate).toBe(r.yieldRate)
  })

  it('横切り優先・切り代 11 で 3枚になり、お知らせは「切り代を 10mm にすると、板が 1 枚減ります」（仕様書 19.2。切り代 10 ならお知らせなし）', () => {
    const job = sampleJob(T, ids())
    const wide = { ...job, settings: { ...job.settings, cutMode: 'horizontal' as const, allowance: 11 } }
    expect(packJob(wide, computeDimensions(wide)).sheetCount).toBe(3)
    const hint = findSavingHint(wide)
    expect(hint).toMatchObject({ change: { kind: 'allowance', value: 10 }, from: 3, to: 2 })
    expect(hint?.message).toBe('切り代を 10mm にすると、板が 1 枚減ります')
    const back = { ...wide, settings: { ...wide.settings, allowance: 10 } }
    expect(findSavingHint(back)).toBeNull()
  })

  it('押すたびに新しい id の仕事と部材', () => {
    const make = ids()
    const a = sampleJob(T, make)
    const b = sampleJob(T, make)
    expect(a.id).not.toBe(b.id)
    expect(new Set([...a.parts, ...b.parts].map((p) => p.id)).size).toBe(6)
  })
})
