// 同じ幅を優先する並べ方は、必要な板が増えないときだけ使う（仕様書 7）。
// kidori の packing/sameWidthChoice.test.ts をもとに、材料・厚み・木目・手持ち・材料ごとの選び方を外し、部材を W・H の形にしたもの
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { computeDimensions } from '../dimensions'
import type { CutMode, Job, PackingResult, Part } from '../types'
import { packJob } from './index'

/** 部材（回転しない。縦切り優先では W が帯の幅になる） */
function part(id: string, w: number, h: number, quantity = 1): Part {
  return { id, name: id, expr: { W: String(w), H: String(h) }, quantity, rotatable: false, finishedDone: false }
}

/** 3×6（910×1820）。刃厚・端切り・切り代 0 で、帯の幅・長さをそのまま数えられるようにする */
function job(parts: Part[], cutMode: CutMode = 'vertical'): Job {
  const j = createJob({ id: 'j', name: '仕事', now: '2026-10-20T00:00:00.000Z' })
  j.settings = { sheet: { sizeKind: 'saburoku', width: 910, length: 1820 }, kerf: 0, trim: 0, allowance: 0, cutMode }
  j.parts = parts
  return j
}

const run = (j: Job, sameWidthFirst?: boolean) =>
  packJob(j, computeDimensions(j), sameWidthFirst === undefined ? {} : { sameWidthFirst })

/** 1枚目の片ごとの x（右から詰めた帯の位置） */
const xs = (r: PackingResult) => Object.fromEntries(r.sheets[0].placements.map((p) => [p.pieceId, p.x]))

describe('同じ幅を優先するのは板が増えないときだけ', () => {
  // A 546×546 の帯の残りの長さ（1274）に B 364×546 が入る。同じ幅を優先すると B が新しい帯（幅 364）を作り、
  // 板の幅（910）を使い切るので、C 318×1820 が2枚目になる。幅が収まる最初の帯に入れる並べ方なら C は B の左の新しい帯に入って1枚
  const worse = () => job([part('A', 546, 546), part('B', 364, 546), part('C', 318, 1820)])

  it('同じ幅を優先すると1枚増える仕事：それだけで並べると2枚、幅が収まる最初の帯に入れる並べ方なら1枚', () => {
    expect(run(worse(), true).sheetCount).toBe(2)
    expect(run(worse(), false).sheetCount).toBe(1)
  })

  it('初期値は両方を計算して、板の少ないほう（幅が収まる最初の帯に入れる並べ方）を使う', () => {
    const r = run(worse())
    expect(r.sheetCount).toBe(1)
    expect(r.sheets).toEqual(run(worse(), false).sheets)
    expect(r.unplaced).toEqual([])
  })

  it('板の枚数が同じなら、同じ幅を優先する並べ方を使う', () => {
    // B・C（幅 364）は 同じ幅を優先すると2本目の帯に縦に並び、もう1つの並べ方だと A の帯に入る。どちらも1枚
    const j = () => job([part('A', 546, 546), part('B', 364, 546), part('C', 364, 546)])
    const same = run(j(), true)
    const old = run(j(), false)
    expect([same.sheetCount, old.sheetCount]).toEqual([1, 1])
    expect(xs(old)).not.toEqual(xs(same))
    const r = run(j())
    expect(r.sheets).toEqual(same.sheets)
    // A は右端の帯、B・C は その左の幅 364 の帯（右から詰め、余りは左）
    expect(Object.values(xs(r)).sort((a, b) => a - b)).toEqual([0, 0, 364])
  })

  it('横切り優先でも、2つの並べ方を枚数で比べる', () => {
    const j = () => job(worse().parts, 'horizontal')
    const r = run(j())
    expect(r.mode).toBe('horizontal')
    expect(r.sheetCount).toBe(Math.min(run(j(), true).sheetCount, run(j(), false).sheetCount))
  })
})
