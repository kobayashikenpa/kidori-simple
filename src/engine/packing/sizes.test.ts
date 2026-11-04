// 3×6 と 4×8 の比べ（kidori の packing/sizes.test.ts をもとに、材料ごとの行・重ね切り・手持ち・木取り済みを外したもの）
import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../dimensions'
import { shelfJob } from '../fixtures/shelf'
import { BOARD_SIZES, type CutMode, type Job, type Part } from '../types'
import { packJob } from './index'
import { compareStandardSizes, pickBetterSize, type SizeSummary, type StandardSize } from './sizes'

const pct = (r: number) => Math.round(r * 1000) / 10

function compare(job: Job) {
  return compareStandardSizes(job, computeDimensions(job))
}

/** [種類, 枚数, 歩留まり%, 入らない部材の数] */
function summary(job: Job) {
  return compare(job).options.map((o) => [o.kind, o.sheetCount, pct(o.yieldRate), o.unplacedCount])
}

function part(id: string, W: string, H: string, quantity = 1, rotatable = false): Part {
  return { id, name: id, expr: { W, H }, quantity, rotatable, finishedDone: false }
}

/** 板だけ kind に置き換えて packJob した結果 */
function packAs(job: Job, kind: StandardSize) {
  const [width, length] = BOARD_SIZES[kind]
  const j: Job = { ...job, settings: { ...job.settings, sheet: { sizeKind: kind, width, length } } }
  return packJob(j, computeDimensions(j))
}

describe('compareStandardSizes（3×6 と 4×8 の比べ）', () => {
  it('見本・縦切り優先：3×6 は 3枚 68.2%、4×8 は 2枚 57.2%', () => {
    expect(summary(shelfJob())).toEqual([
      ['saburoku', 3, 68.2, 0],
      ['shihachi', 2, 57.2, 0],
    ])
  })

  it('見本の枚数と歩留まりは、それぞれのサイズで packJob した結果と同じ（縦切り優先・横切り優先）', () => {
    for (const mode of ['vertical', 'horizontal'] as CutMode[]) {
      const job = shelfJob()
      job.settings.cutMode = mode
      const [saburoku, shihachi] = compare(job).options
      for (const [o, kind] of [[saburoku, 'saburoku'], [shihachi, 'shihachi']] as const) {
        const r = packAs(job, kind)
        expect([o.sheetCount, o.yieldRate, o.unplacedCount]).toEqual([r.sheetCount, r.yieldRate, r.unplaced.length])
      }
    }
  })

  it('3×6 は 910×1820、4×8 は 1220×2430', () => {
    expect(compare(shelfJob()).options.map((o) => [o.kind, o.width, o.length])).toEqual([
      ['saburoku', 910, 1820],
      ['shihachi', 1220, 2430],
    ])
  })

  it('今のサイズが 3×6 や自由入力でも、3×6・4×8 で比べる', () => {
    const plain = summary(shelfJob())
    const a = shelfJob()
    a.settings.sheet = { sizeKind: 'saburoku', width: 910, length: 1820 }
    expect(summary(a)).toEqual(plain)
    const b = shelfJob()
    b.settings.sheet = { sizeKind: 'custom', width: 1000, length: 2000 }
    expect(summary(b)).toEqual(plain)
  })

  it('切り方・刃厚・端切り・切り代は今の設定のまま（切り代 0 なら 3×6 の歩留まりが下がる）', () => {
    const job = shelfJob()
    job.settings.allowance = 0
    const [saburoku] = compare(job).options
    expect(saburoku).toMatchObject({ sheetCount: packAs(job, 'saburoku').sheetCount, yieldRate: packAs(job, 'saburoku').yieldRate })
    expect(pct(saburoku.yieldRate)).toBeLessThan(68.2)
  })

  it('計算の前後で仕事のデータが変わらない', () => {
    const job = shelfJob()
    job.settings.sheet = { sizeKind: 'custom', width: 1000, length: 2000 }
    const before = structuredClone(job)
    compare(job)
    expect(job).toEqual(before)
  })

  it('3×6 に入らず 4×8 なら入る部材：3×6 は入らない部材 1、4×8 は 0', () => {
    // 1000×2000（木取り 1010×2010）：3×6 の使える範囲 905×1820 に入らない。4×8（1215×2430）には入る
    const job = shelfJob()
    job.parts = [part('大板', '1000', '2000')]
    expect(summary(job)).toEqual([
      ['saburoku', 0, 0, 1],
      ['shihachi', 1, 68.5, 0],
    ])
  })

  it('4×8 ぴったり（使える妻手 1215）と 1mm 超え', () => {
    const job = shelfJob()
    job.parts = [part('ぴったり', '1205', '2000')]
    expect(compare(job).options[1].unplacedCount).toBe(0)
    job.parts[0].expr.W = '1206'
    expect(compare(job).options[1].unplacedCount).toBe(1)
  })

  it('部材が無ければ どちらも 0枚・歩留まり 0、印は無し', () => {
    const job = shelfJob()
    job.parts = []
    const r = compare(job)
    expect(r.options.map((o) => [o.sheetCount, o.yieldRate, o.unplacedCount])).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ])
    expect([r.fewer, r.higher]).toEqual([null, null])
  })

  it('部材150枚・横切り優先で 1秒以内', () => {
    const job = shelfJob()
    job.settings.cutMode = 'horizontal'
    job.parts = Array.from({ length: 50 }, (_, i) =>
      part(`部材${i}`, String(100 + ((i * 37) % 400)), String(150 + ((i * 53) % 900)), 3, i % 3 === 0),
    )
    const dims = computeDimensions(job)
    const t = performance.now()
    const r = compareStandardSizes(job, dims)
    expect(performance.now() - t).toBeLessThan(1000)
    expect(r.options[0].sheetCount).toBeGreaterThan(r.options[1].sheetCount)
  })
})

describe('枚数が少ない方・歩留まりが高い方（fewer・higher）', () => {
  it('見本：枚数が少ないのは 4×8、歩留まりが高いのは 3×6', () => {
    const r = compare(shelfJob())
    expect([r.fewer, r.higher]).toEqual(['shihachi', 'saburoku'])
  })

  it('入らない部材が出るサイズがあれば比べない（どちらも印は無し）', () => {
    const job = shelfJob()
    job.parts = [part('大板', '1000', '2000')]
    const r = compare(job)
    expect([r.fewer, r.higher]).toEqual([null, null])
  })

  const opt = (kind: StandardSize, sheetCount: number, yieldRate: number, unplacedCount = 0): SizeSummary => ({
    kind,
    width: BOARD_SIZES[kind][0],
    length: BOARD_SIZES[kind][1],
    sheetCount,
    yieldRate,
    unplacedCount,
  })

  it('歩留まりが小数第1位（0.1%）で同じなら印は無し', () => {
    expect(pickBetterSize([opt('saburoku', 3, 0.7171), opt('shihachi', 2, 0.7174)])).toEqual({ fewer: 'shihachi', higher: null })
  })

  it('歩留まりが 0.1% 違えば高い方に印', () => {
    expect(pickBetterSize([opt('saburoku', 2, 0.717), opt('shihachi', 2, 0.718)])).toEqual({ fewer: null, higher: 'shihachi' })
  })

  it('片方に入らない部材があれば、もう片方が良くても印は無し', () => {
    expect(pickBetterSize([opt('saburoku', 1, 0.9, 1), opt('shihachi', 2, 0.5)])).toEqual({ fewer: null, higher: null })
  })

  it('枚数が 0 のサイズは比べない', () => {
    expect(pickBetterSize([opt('saburoku', 0, 0), opt('shihachi', 1, 0.5)])).toEqual({ fewer: null, higher: null })
  })
})
