// 木取り計算の入口（kidori の packing/index.test.ts をもとに、材料ごとの結果・木目・木取り済み（checks.cut）を外し、
// 見本を仕様書 6章の棚（4×8・刃厚3・端切り5・切り代10）にしたもの）
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { computeDimensions } from '../dimensions'
import { shelfJob } from '../fixtures/shelf'
import type { CutMode, Job, Part } from '../types'
import { MIN_SCRAP, packJob } from './index'

const pct = (r: number) => Math.round(r * 1000) / 10

function run(job: Job) {
  return packJob(job, computeDimensions(job))
}

function withMode(mode: CutMode, job: Job = shelfJob()): Job {
  job.settings.cutMode = mode
  return job
}

function part(id: string, W: string, H: string, quantity = 1, rotatable = false): Part {
  return { id, name: id, expr: { W, H }, quantity, rotatable, finishedDone: false }
}

/** 見本の設定（4×8・刃厚3・端切り5・切り代10）で、指定の部材だけの仕事 */
function jobOf(mode: CutMode, parts: Part[]): Job {
  const job = createJob({ id: 'job', name: '仕事', now: '2026-10-20T00:00:00.000Z' })
  // 6章の例の切り代 10（第2.3版で初期値は 0 になった。仕様書 27.6）
  job.settings.allowance = 10
  job.settings.cutMode = mode
  job.parts = parts
  return job
}

const names = (r: ReturnType<typeof run>) => r.sheets.map((s) => s.placements.map((p) => p.name))
const largestScrap = (r: ReturnType<typeof run>) => Math.max(...r.sheets.flatMap((s) => s.scraps.map((x) => x.w * x.h)))

describe('入口から出すもの', () => {
  it('端材として出す最小の大きさ（MIN_SCRAP）を入口から使える', () => {
    expect(MIN_SCRAP).toBe(30)
  })
})

describe('packJob：見本（4×8・縦切り優先）', () => {
  it('2枚：1枚目 天板・側板×2・棚板、2枚目 棚板×2。入らない部材・除いた部材は無い', () => {
    const r = run(shelfJob())
    expect([r.mode, r.sheetCount]).toEqual(['vertical', 2])
    expect(names(r)).toEqual([
      ['天板', '側板', '側板', '棚板'],
      ['棚板', '棚板'],
    ])
    expect(r.sheets.map((s) => s.index)).toEqual([1, 2])
    expect(r.unplaced).toEqual([])
    expect(r.skipped).toEqual([])
  })

  it('計算に使った板は設定の板（4×8 1220×2430）', () => {
    const r = run(shelfJob())
    expect(r.sheet).toEqual({ sizeKind: 'shihachi', width: 1220, length: 2430 })
    expect([r.sheets[0].boardWidth, r.sheets[0].boardLength]).toEqual([1220, 2430])
  })

  it('回転しない部材は W を妻手方向（配置図の横）に置く：天板 410×1810、側板 410×710、棚板 389×1770', () => {
    const s1 = run(shelfJob()).sheets[0]
    expect(s1.placements.map((p) => [p.name, p.w, p.h, p.rotated, p.sizeLabel])).toEqual([
      ['天板', 410, 1810, false, '410×1810'],
      ['側板', 410, 710, false, '410×710'],
      ['側板', 410, 710, false, '410×710'],
      ['棚板', 389, 1770, false, '389×1770'],
    ])
  })

  it('右上から詰める：帯が右から 410 + 3 + 410 + 3 + 389 ＝ 1215 でぴったり並ぶ', () => {
    const s1 = run(shelfJob()).sheets[0]
    expect(s1.placements.map((p) => [p.x, p.y])).toEqual([
      [805, 620],
      [392, 1720],
      [392, 1007],
      [0, 660],
    ])
  })

  it('板ごとに置き方・使える範囲・端切り・切る順番・端材が入る', () => {
    const [s1, s2] = run(shelfJob()).sheets
    expect(s1.orientation).toBe('portrait')
    expect(s1.usable).toEqual({ x: 0, y: 0, w: 1215, h: 2430 })
    expect(s1.trims).toEqual([{ x: 1215, y: 0, w: 5, h: 2430 }])
    expect(s1.cuts[0]).toMatchObject({ no: 1, kind: 'trim', direction: 'vertical', at: 1215 })
    expect(s1.cuts[1]).toMatchObject({ no: 2, kind: 'strip', label: '右端から 410mm で縦に切る' })
    expect(s1.scraps).toEqual([
      { x: 392, y: 0, w: 410, h: 1004 },
      { x: 0, y: 0, w: 389, h: 657 },
      { x: 805, y: 0, w: 410, h: 617 },
    ])
    expect(s2.scraps[0]).toEqual({ x: 0, y: 0, w: 431, h: 2430 })
  })

  it('歩留まり：1枚目 67.9%、2枚目 46.5%、全体 57.2%', () => {
    const r = run(shelfJob())
    expect(r.sheets.map((s) => pct(s.yieldRate))).toEqual([67.9, 46.5])
    expect(r.sheets[0].usedArea).toBe(410 * 1810 + 410 * 710 * 2 + 389 * 1770)
    expect(pct(r.yieldRate)).toBe(57.2)
  })

  it('全体（枚数0）は並べない', () => {
    expect(names(run(shelfJob())).flat()).not.toContain('全体')
  })

  it('計算の前後で仕事のデータが変わらない', () => {
    const job = shelfJob()
    const before = structuredClone(job)
    run(job)
    expect(job).toEqual(before)
  })
})

describe('packJob：見本（4×8・横切り優先）', () => {
  it('2枚：1枚目 天板・棚板×2、2枚目 棚板・側板×2。切り方は横切り優先', () => {
    const r = run(withMode('horizontal'))
    expect([r.mode, r.sheetCount]).toEqual(['horizontal', 2])
    expect(names(r)).toEqual([
      ['天板', '棚板', '棚板'],
      ['棚板', '側板', '側板'],
    ])
    expect(r.unplaced).toEqual([])
  })

  it('横長に置く：使える範囲 2425×1215、端切りは下の長手と右の妻手。W は妻手方向（配置図の縦）のまま', () => {
    const s1 = run(withMode('horizontal')).sheets[0]
    expect(s1.orientation).toBe('landscape')
    expect(s1.usable).toEqual({ x: 0, y: 5, w: 2425, h: 1215 })
    expect(s1.trims).toEqual([
      { x: 0, y: 0, w: 2430, h: 5 },
      { x: 2425, y: 5, w: 5, h: 1215 },
    ])
    // 天板は 長手方向（横）に H 1810、妻手方向（縦）に W 410。右上から
    expect(s1.placements[0]).toMatchObject({ name: '天板', x: 615, y: 810, w: 1810, h: 410, rotated: false })
  })

  it('歩留まりは縦切り優先と同じ（並べる部材の面積と板の枚数が同じ）', () => {
    expect(pct(run(withMode('horizontal')).yieldRate)).toBe(57.2)
  })
})

describe('packJob：縦切り優先と横切り優先の比べ（第1.4版で「おまかせ」をなくした）', () => {
  it('見本：どちらも2枚。一番大きい端材は縦切り優先 431×2430、横切り優先 652×1215', () => {
    const v = run(withMode('vertical'))
    const h = run(withMode('horizontal'))
    expect(largestScrap(v)).toBe(431 * 2430)
    expect(largestScrap(h)).toBe(652 * 1215)
    expect([v.mode, v.sheetCount, h.mode, h.sheetCount]).toEqual(['vertical', 2, 'horizontal', 2])
  })

  it('設定の切り方のとおりに並べる（縦切り優先なら2枚、横切り優先なら1枚になる部材でも、選んだほうで計算する）', () => {
    // 木取り 400×2000 ×3（妻手に3本並ぶ）と 1200×400（縦切り優先では幅が残らず2枚目）
    const parts = () => [part('縦長', '390', '1990', 3), part('横長', '1190', '390')]
    const v = run(jobOf('vertical', parts()))
    const h = run(jobOf('horizontal', parts()))
    expect([v.mode, v.sheetCount]).toEqual(['vertical', 2])
    expect([h.mode, h.sheetCount]).toEqual(['horizontal', 1])
  })

  it('長手 2430 の板：長さ 2420 の片は縦切り優先なら入り、横切り優先では入らない', () => {
    const parts = () => [part('長い板', '290', '2420'), part('短い板', '290', '290', 5)]
    expect(run(jobOf('horizontal', parts())).unplaced).toEqual([{ partId: '長い板', name: '長い板', reason: 'tooLarge' }])
    const v = run(jobOf('vertical', parts()))
    expect(v.mode).toBe('vertical')
    expect(v.unplaced).toEqual([])
  })

  it('横切り優先：長手 2425 ぴったりは入り、2426 は入らない', () => {
    const r = run(jobOf('horizontal', [part('ぴったり', '290', '2415'), part('1mm多い', '290', '2416')]))
    expect(r.unplaced.map((u) => u.partId)).toEqual(['1mm多い'])
    expect(names(r).flat()).toEqual(['ぴったり'])
  })

  it('使える範囲いっぱいの 1215×2425 の片は、どちらの切り方でも端材なしの1枚', () => {
    const parts = () => [part('板', '1205', '2415')]
    expect(run(jobOf('vertical', parts())).sheets[0].scraps).toEqual([])
    expect(run(jobOf('horizontal', parts())).sheets[0].scraps).toEqual([])
  })
})

describe('packJob：回転', () => {
  it('回転しない部材は、W が妻手に入らなければ「板に収まらない部材」', () => {
    const r = run(jobOf('vertical', [part('横長', '1500', '300')]))
    expect(r.unplaced).toEqual([{ partId: '横長', name: '横長', reason: 'tooLarge' }])
    expect(r.sheetCount).toBe(0)
  })

  it('回転してよい部材は、入らないときに回して入る（W 1510 を長手方向に置く）', () => {
    const r = run(jobOf('vertical', [part('横長', '1500', '300', 1, true)]))
    expect(r.unplaced).toEqual([])
    expect(r.sheets[0].placements[0]).toMatchObject({ name: '横長', w: 310, h: 1510, rotated: true, sizeLabel: '1510×310' })
  })

  it('回転しない部材は、W が H より大きくても W を妻手方向に置く', () => {
    const p = run(jobOf('vertical', [part('横長', '800', '300')])).sheets[0].placements[0]
    expect(p).toMatchObject({ w: 810, h: 310, rotated: false })
  })

  it('回転してよい部材は、帯の中の方向（長手）に長く置く向きを先に試す（810×310 ×6 は回して 310 幅の帯に）', () => {
    const fixed = run(jobOf('vertical', [part('板', '800', '300', 6)]))
    const free = run(jobOf('vertical', [part('板', '800', '300', 6, true)]))
    expect(fixed.sheetCount).toBe(1)
    expect(free.sheetCount).toBe(1)
    // 回転してよいときは帯の中の方向（長手）に長く置く
    expect(free.sheets[0].placements.every((p) => p.rotated)).toBe(true)
    expect(fixed.sheets[0].placements.every((p) => !p.rotated)).toBe(true)
  })
})

describe('packJob：刃厚・端切り・切り代の境界', () => {
  it('妻手 1215（端切り5）ぴったりは入り、1216 は入らない', () => {
    expect(run(jobOf('vertical', [part('ぴったり', '1205', '300')])).unplaced).toEqual([])
    expect(run(jobOf('vertical', [part('1mm多い', '1206', '300')])).unplaced.map((u) => u.partId)).toEqual(['1mm多い'])
  })

  it('刃厚ぶん入らない：木取り 606 ×2 は 606 + 3 + 606 ＝ 1215 で1枚、607 ×2 は 1217 で2枚', () => {
    expect(run(jobOf('vertical', [part('a', '596', '1490', 2)])).sheetCount).toBe(1)
    expect(run(jobOf('vertical', [part('a', '597', '1490', 2)])).sheetCount).toBe(2)
  })

  it('刃厚 0 なら 607 + 607 ＝ 1214 で1枚', () => {
    const job = jobOf('vertical', [part('a', '597', '1490', 2)])
    job.settings.kerf = 0
    expect(run(job).sheetCount).toBe(1)
  })

  it('端切り 0 なら妻手 1220 まで入る', () => {
    const job = jobOf('vertical', [part('a', '1210', '300')])
    expect(run(job).unplaced).toHaveLength(1)
    job.settings.trim = 0
    expect(run(job).unplaced).toEqual([])
  })

  it('切り代を足すと入らない：仕上がり W 1210 は切り代 10 で入らず、切り代 5 で入る', () => {
    const job = jobOf('vertical', [part('a', '1210', '300')])
    expect(run(job).unplaced).toHaveLength(1)
    job.settings.allowance = 5
    expect(run(job).unplaced).toEqual([])
  })

  it('板のサイズは設定に従う（3×6・自由入力）', () => {
    const job = shelfJob()
    job.settings.sheet = { sizeKind: 'saburoku', width: 910, length: 1820 }
    const r = run(job)
    expect([r.sheets[0].boardWidth, r.sheets[0].boardLength]).toEqual([910, 1820])
    job.settings.sheet = { sizeKind: 'custom', width: 1000, length: 3000 }
    expect(run(job).sheets[0].boardLength).toBe(3000)
  })
})

describe('packJob：入らない部材・エラーの部材', () => {
  it('板より大きい部材は「板に収まらない部材」に出し、ほかの部材は計算する', () => {
    const job = shelfJob()
    job.parts.push(part('大きい板', '1300', '2500', 2))
    const r = run(job)
    expect(r.unplaced).toEqual([{ partId: '大きい板', name: '大きい板', reason: 'tooLarge' }])
    expect(r.sheetCount).toBe(2)
  })

  it('入らない部材は部材の並び', () => {
    const r = run(jobOf('vertical', [part('B', '3000', '100'), part('ok', '100', '100'), part('A', '1300', '100')]))
    expect(r.unplaced.map((u) => u.partId)).toEqual(['B', 'A'])
  })

  it('入らない部材しかなければ 0枚・歩留まり 0', () => {
    const r = run(jobOf('vertical', [part('大きい板', '1300', '2500')]))
    expect(r).toMatchObject({ sheetCount: 0, sheets: [], yieldRate: 0 })
  })

  it('寸法のエラーの部材は skipped に出し、計算から外す（ほかは計算する）', () => {
    const job = shelfJob()
    job.parts.push(part('エラー', '無い.W', '100'), part('ゼロ', '0', '100'))
    const r = run(job)
    expect(r.skipped).toEqual([
      { partId: 'エラー', name: 'エラー', reason: 'dimensionError' },
      { partId: 'ゼロ', name: 'ゼロ', reason: 'dimensionError' },
    ])
    expect(r.sheetCount).toBe(2)
    expect(names(r).flat()).not.toContain('エラー')
  })

  it('寸法が 0 の部材だけ外し、ほかの部材は並べる（第2.2版から部材どうしの参照は無い）', () => {
    const job = shelfJob()
    job.parts[1].expr.W = '0'
    const r = run(job)
    expect(r.skipped.map((s) => s.name)).toEqual(['天板'])
    expect(r.sheets.flatMap((s) => s.placements).map((p) => p.name).sort()).toEqual(['側板', '側板', '棚板', '棚板', '棚板'])
  })

  it('部材が1枚もなければ 0枚・歩留まり 0・縦切り優先', () => {
    const job = shelfJob()
    job.parts = []
    expect(run(job)).toEqual({
      sheet: { sizeKind: 'shihachi', width: 1220, length: 2430 },
      mode: 'vertical',
      sheets: [],
      sheetCount: 0,
      yieldRate: 0,
      unplaced: [],
      skipped: [],
    })
  })

  it('仕上がりの完了のチェックは結果を変えない', () => {
    const job = shelfJob()
    for (const p of job.parts) p.finishedDone = true
    expect(run(job)).toEqual(run(shelfJob()))
  })
})

describe('packJob：速さ', () => {
  it('部材120枚（10種類・回転しない／回転してよい）が縦切り優先・横切り優先とも1秒以内に終わり、すべて配置される', () => {
    for (const mode of ['vertical', 'horizontal'] as const) {
    const job = jobOf(
      mode,
      Array.from({ length: 10 }, (_, i) =>
        part(`部材${i + 1}`, String(150 + i * 60), String(200 + ((i * 97) % 500)), 12, i % 3 === 0),
      ),
    )
    const t = performance.now()
    const r = run(job)
    expect(performance.now() - t).toBeLessThan(1000)
    expect(r.sheets.reduce((n, s) => n + s.placements.length, 0)).toBe(120)
    expect(r.unplaced).toEqual([])
    }
  })

  it('150枚の横切り優先（寸法の計算込み）も1秒を大きく下回る', () => {
    const job = jobOf(
      'horizontal',
      Array.from({ length: 15 }, (_, i) =>
        part(`棚${i + 1}`, String(100 + ((i * 131) % 780)), String(80 + ((i * 71) % 600)), 10, i % 2 === 0),
      ),
    )
    const t = performance.now()
    const r = run(job)
    expect(performance.now() - t).toBeLessThan(300)
    expect(r.sheets.reduce((n, s) => n + s.placements.length, 0)).toBe(150)
  })
})

describe('packJob：自由入力の板の妻手・長手を逆に入れても同じ', () => {
  it('{custom, 2430, 1220} は 4×8 と同じ並べ方・枚数・歩留まり（両方の切り方）', () => {
    for (const mode of ['vertical', 'horizontal'] as const) {
      const std = run(withMode(mode))
      const job = withMode(mode)
      job.settings.sheet = { sizeKind: 'custom', width: 2430, length: 1220 }
      const r = run(job)
      expect(r.sheet).toEqual({ sizeKind: 'custom', width: 1220, length: 2430 })
      expect([r.mode, r.sheetCount, r.yieldRate, r.unplaced]).toEqual([std.mode, std.sheetCount, std.yieldRate, std.unplaced])
      expect(r.sheets).toEqual(std.sheets)
    }
  })
})
