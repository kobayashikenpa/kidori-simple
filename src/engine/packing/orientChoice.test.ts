// 回転してよい部材の向きの選び方（仕様書 23）。すでにある帯に置くとき、帯の中の方向に長い向きを先に試す並べ方（A：今まで）と、
// 短い向きを先に試す並べ方（B）を両方計算し、入らない部材が少ない → 板が少ない → 同じなら A を採る
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { computeDimensions } from '../dimensions'
import { piece } from '../fixtures/pieces'
import type { CutMode, Job, PackingResult, Part, Placement, Rect } from '../types'
import { betterThan, chooseLayout, packGuillotine, type GuillotineResult, type OrientFirst } from './guillotine'
import { packJob } from './index'
import { usableRect } from './sheet'

const SHIHACHI = { width: 1220, length: 2430 }
/** 4×8・端切り5・縦切り優先：x 0〜1215・y 0〜2430 */
const U = usableRect(SHIHACHI, 5, 'vertical')

function part(id: string, W: number, H: number, quantity: number, rotatable: boolean): Part {
  return { id, name: id, expr: { W: String(W), H: String(H) }, quantity, rotatable, finishedDone: false }
}

/** オーナーの設定：4×8・刃厚3・端切り5・切り代0 */
function job(parts: Part[], cutMode: CutMode = 'vertical'): Job {
  const j = createJob({ id: 'j', name: '仕事', now: '2026-10-25T00:00:00.000Z' })
  j.settings = { ...j.settings, sheet: { sizeKind: 'shihachi', ...SHIHACHI }, kerf: 3, trim: 5, allowance: 0, cutMode }
  j.parts = parts
  return j
}

const run = (j: Job, orientFirst?: OrientFirst) =>
  packJob(j, computeDimensions(j), orientFirst === undefined ? {} : { orientFirst })

/** オーナーの例（2026-10-25）：甲板 600×800 ×2・保立 397×594 ×2（回転してよい）・天地板 460×800 ×2・背板 460×812 */
const ownerJob = () =>
  job([
    part('甲板', 600, 800, 2, true),
    part('保立', 397, 594, 2, true),
    part('天地板', 460, 800, 2, false),
    part('背板', 460, 812, 1, false),
  ])

const placementsOf = (r: GuillotineResult, sheet = 0): Placement[] =>
  r.sheets[sheet].strips.flatMap((s) => s.items.map((i) => i.placement))

/** 範囲内・重ならない・間が刃厚以上 */
function expectValid(ps: readonly Rect[], usable: Rect, kerf: number) {
  for (const p of ps) {
    expect(p.x).toBeGreaterThanOrEqual(usable.x)
    expect(p.y).toBeGreaterThanOrEqual(usable.y)
    expect(p.x + p.w).toBeLessThanOrEqual(usable.x + usable.w + 1e-9)
    expect(p.y + p.h).toBeLessThanOrEqual(usable.y + usable.h + 1e-9)
  }
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i]
      const b = ps[j]
      const gap = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), b.y - (a.y + a.h), a.y - (b.y + b.h))
      expect(gap).toBeGreaterThanOrEqual(kerf - 1e-9)
    }
  }
}

describe('packGuillotine の orientFirst（すでにある帯に先に試す向き）', () => {
  // 右の帯（幅 600）に甲板 600×800 を2枚置くと、残りの長さは 2430 − 800 − 3 − 800 − 3 ＝ 824。
  // 保立を縦（397 幅×594）で置くと残り 824 − 594 − 3 ＝ 227 で2つ目が入らない。横（594 幅×397）なら 397＋3＋397＝797 で2つ入る
  const ps = () => [piece('甲板1', 600, 800, true), piece('甲板2', 600, 800, true), piece('保立1', 397, 594, true), piece('保立2', 397, 594, true)]
  const inRightStrip = (r: GuillotineResult) => r.sheets[0].strips[0].items.map((i) => i.placement.name)

  it("'long'（今まで）は1つ目の保立を縦で右の帯に置き、2つ目は右の帯に入らない", () => {
    const r = packGuillotine(ps(), U, 3, 'vertical', false, 'long')
    expect(inRightStrip(r)).toEqual(['甲板1', '甲板2', '保立1'])
  })

  it("'short' は保立を横（594×397）にして、2つとも右の帯に入れる（右に寄せ、上から詰める）", () => {
    const r = packGuillotine(ps(), U, 3, 'vertical', false, 'short')
    expect(r.sheets).toHaveLength(1)
    expect(inRightStrip(r)).toEqual(['甲板1', '甲板2', '保立1', '保立2'])
    const hs = placementsOf(r).filter((p) => p.name.startsWith('保立'))
    // 帯の上端から 800＋3＋800＋3 ＝ 1606 と 1606＋397＋3 ＝ 2006。帯（x 615〜1215）の右端に寄せる
    expect(hs.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, rotated: p.rotated }))).toEqual([
      { x: 621, y: 427, w: 594, h: 397, rotated: true },
      { x: 621, y: 27, w: 594, h: 397, rotated: true },
    ])
    expectValid(placementsOf(r), U, 3)
  })

  it("'short' でも新しい帯は今までどおり長い向きで作る（帯の幅は 397）", () => {
    const r = packGuillotine([piece('保立1', 397, 594, true)], U, 3, 'vertical', true, 'short')
    expect(r.sheets[0].strips[0].local.pw).toBe(397)
    expect(placementsOf(r)[0].rotated).toBe(false)
  })

  it('残りの長さがぴったり 797 なら横で2つ入る。1mm 足りないと2つ目は右の帯に入らない（刃厚ぶん）', () => {
    // 回転しない 600×L の後の残り：2430 − L − 3。L＝1630 で 797（397＋3＋397）
    const fit = packGuillotine([piece('a', 600, 1630), piece('h1', 397, 594, true), piece('h2', 397, 594, true)], U, 3, 'vertical', false, 'short')
    expect(fit.sheets[0].strips[0].items.map((i) => i.placement.name)).toEqual(['a', 'h1', 'h2'])
    const over = packGuillotine([piece('a', 600, 1631), piece('h1', 397, 594, true), piece('h2', 397, 594, true)], U, 3, 'vertical', false, 'short')
    expect(over.sheets[0].strips[0].items.map((i) => i.placement.name)).toEqual(['a', 'h1'])
  })

  it('回転しない片は orientFirst で並びが変わらない', () => {
    const ps2 = () => [piece('a', 600, 800), piece('b', 397, 594), piece('c', 460, 812), piece('d', 300, 300)]
    for (const mode of ['vertical', 'horizontal'] as const) {
      const u = usableRect(SHIHACHI, 5, mode)
      expect(packGuillotine(ps2(), u, 3, mode, true, 'short').sheets).toEqual(packGuillotine(ps2(), u, 3, mode, true, 'long').sheets)
    }
  })
})

describe('chooseLayout（同じ幅の優先 × 向き の組み合わせから選ぶ）', () => {
  const L = (sheets: number, unplaced = 0, tag = '') => ({ sheets: Array(sheets).fill(0), unplaced: Array(unplaced).fill(0), tag })

  it('入らない片が少ない → 板が少ない → 同じなら今の並べ方（long）', () => {
    expect(betterThan(L(2), L(1, 1))).toBe(true)
    expect(betterThan(L(1, 1), L(2))).toBe(false)
    expect(betterThan(L(1), L(2))).toBe(true)
    expect(betterThan(L(1), L(1))).toBe(false)
    expect(betterThan(L(2), L(1))).toBe(false)
  })

  it('short のほうが板が少ないときだけ short。同じなら long、多ければ long', () => {
    const pick = (short: number, long: number) =>
      chooseLayout({}, (same, o) => (o === 'short' ? L(short, 0, `short-${same}`) : L(long, 0, `long-${same}`))).tag
    expect(pick(1, 2)).toBe('short-true')
    expect(pick(2, 2)).toBe('long-true')
    expect(pick(3, 2)).toBe('long-true')
  })

  it('同じ幅の優先は向きごとに今までの選び方（板が同じなら同じ幅を優先）', () => {
    // long：true 2枚・false 1枚 → false。short：どちらも 1枚 → true。枚数が同じなので long（false）
    const r = chooseLayout({}, (same, o) => L(o === 'long' && same ? 2 : 1, 0, `${o}-${same}`))
    expect(r.tag).toBe('long-false')
  })

  it('指定した項目はその値だけで計算する。回転してよい片が無ければ short は計算しない', () => {
    const calls: string[] = []
    const rec = (same: boolean, o: OrientFirst) => {
      calls.push(`${o}-${same}`)
      return L(1, 0, `${o}-${same}`)
    }
    expect(chooseLayout({ orientFirst: 'short', sameWidthFirst: false }, rec).tag).toBe('short-false')
    expect(calls).toEqual(['short-false'])
    calls.length = 0
    chooseLayout({}, rec, false)
    expect(calls).toEqual(['long-true', 'long-false'])
  })
})

describe('packJob：オーナーの例（4×8・縦切り優先・刃厚3・端切り5）', () => {
  it("今までの並べ方（'long'）では保立が1つ2枚目に出て2枚。比べて選ぶと1枚", () => {
    expect(run(ownerJob(), 'long').sheetCount).toBe(2)
    const r = run(ownerJob())
    expect(r.sheetCount).toBe(1)
    expect(r.unplaced).toEqual([])
    expect(r.sheets[0].placements).toHaveLength(7)
    expectValid(r.sheets[0].placements, r.sheets[0].usable, 3)
  })

  it('保立は2つとも横にして、甲板と同じ右の帯（x 615〜1215）に入る', () => {
    const r = run(ownerJob())
    const by = (name: string) => r.sheets[0].placements.filter((p) => p.name === name)
    expect(by('甲板').map((p) => [p.x, p.w])).toEqual([[615, 600], [615, 600]])
    expect(by('保立').map((p) => ({ x: p.x, w: p.w, h: p.h, rotated: p.rotated }))).toEqual([
      { x: 621, w: 594, h: 397, rotated: true },
      { x: 621, w: 594, h: 397, rotated: true },
    ])
  })

  it('甲板・保立だけなら今までも1枚なので、今までの並べ方のまま', () => {
    const j = () => job([part('甲板', 600, 800, 2, true), part('保立', 397, 594, 2, true)])
    expect(run(j())).toEqual(run(j(), 'long'))
  })
})

describe('packJob：今より板が増えない', () => {
  it('いろいろな仕事（両方の切り方）で、比べて選んだ枚数は今までの並べ方以下。同じ枚数なら今までと同じ並び', () => {
    for (const mode of ['vertical', 'horizontal'] as const) {
      for (let seed = 0; seed < 30; seed++) {
        const parts = Array.from({ length: 6 }, (_, i) =>
          part(`p${i}`, 150 + ((seed * 131 + i * 97) % 700), 200 + ((seed * 71 + i * 53) % 1100), 1 + ((seed + i) % 4), (seed + i) % 2 === 0),
        )
        const chosen: PackingResult = run(job(parts, mode))
        const long = run(job(parts, mode), 'long')
        expect(chosen.unplaced.length).toBeLessThanOrEqual(long.unplaced.length)
        expect(chosen.sheetCount).toBeLessThanOrEqual(long.sheetCount)
        if (chosen.sheetCount === long.sheetCount) expect(chosen.sheets).toEqual(long.sheets)
      }
    }
  })

  it('部材120枚（すべて回転してよい）でも、両方の切り方とも1秒以内にすべて配置される', () => {
    for (const mode of ['vertical', 'horizontal'] as const) {
      const j = job(Array.from({ length: 10 }, (_, i) => part(`部材${i + 1}`, 150 + i * 60, 200 + ((i * 97) % 500), 12, true)), mode)
      const t = performance.now()
      const r = run(j)
      expect(performance.now() - t).toBeLessThan(1000)
      expect(r.sheets.reduce((n, s) => n + s.placements.length, 0)).toBe(120)
      expect(r.unplaced).toEqual([])
    }
  })
})
