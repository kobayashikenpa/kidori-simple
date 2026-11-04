// 固定した1枚（kidori の progress/frozen.test.ts をもとに、材料・厚み・木目・重ね切りを外し、見本を仕様書 6章の棚にしたもの）
import { describe, expect, it } from 'vitest'
import { freezeAt, dimsOf, NOW, pack, withPart } from '../fixtures/progress'
import { shelfJob } from '../fixtures/shelf'
import type { Job } from '../types'
import { freezeSheet, frozenDemand, frozenSheetViews } from './frozen'

const drift = (job: Job) => frozenSheetViews(job, dimsOf(job)).map((v) => v.drift.map((d) => [d.name, d.reason]))

describe('freezeSheet（固定した1枚の写しを作る）', () => {
  it('板・切り方・刃厚・端切りを写し、チェックは空', () => {
    const job = shelfJob()
    job.settings = { ...job.settings, kerf: 4, trim: 6 }
    const r = pack(job)
    const f = freezeSheet(job, r.mode, r.sheets[0], 'sheet-1', NOW)
    expect(f).toEqual({
      id: 'sheet-1',
      sheet: { sizeKind: 'shihachi', width: 1220, length: 2430 },
      mode: 'vertical',
      kerf: 4,
      trim: 6,
      layout: r.sheets[0],
      checked: [],
      frozenAt: NOW.toISOString(),
    })
    expect(f.completedAt).toBeUndefined()
  })

  it('深いコピー：元の layout・設定の板を書き換えても写しは変わらない', () => {
    const job = shelfJob()
    const r = pack(job)
    const layout = r.sheets[0]
    const before = JSON.parse(JSON.stringify(layout))
    const f = freezeSheet(job, r.mode, layout, 's', NOW)
    layout.placements[0].x = 999
    layout.cuts[0].within.w = 1
    layout.placements.push({ ...layout.placements[0] })
    job.settings.sheet.width = 910
    expect(f.layout).toEqual(before)
    expect(f.sheet.width).toBe(1220)
  })

  it('自由入力で妻手・長手を逆に入れた板は、そろえて写す', () => {
    const job = shelfJob()
    job.settings.sheet = { sizeKind: 'custom', width: 2430, length: 1220 }
    const r = pack(job)
    expect(freezeSheet(job, r.mode, r.sheets[0], 's', NOW).sheet).toEqual({ sizeKind: 'custom', width: 1220, length: 2430 })
  })

  it('横切り優先で計算した1枚は、写しの切り方も horizontal', () => {
    const job = shelfJob()
    job.settings.cutMode = 'horizontal'
    const r = pack(job)
    expect(freezeSheet(job, 'horizontal', r.sheets[0], 's', NOW).mode).toBe('horizontal')
  })
})

describe('frozenDemand（固定した片の数。部材ごと）', () => {
  it('固定した1枚が無ければ空', () => {
    expect(frozenDemand(shelfJob()).size).toBe(0)
  })

  it('切り終わりの1枚も含めて、片の数を部材ごとに数える', () => {
    let job = freezeAt(shelfJob(), 0)
    job = freezeAt(job, 0)
    job.frozenSheets[1].completedAt = NOW.toISOString()
    // 1枚目：天板・側板×2・棚板、2枚目（固定したあとの計算の1枚目）：棚板×2
    const d = frozenDemand(job)
    expect(Object.fromEntries(d)).toEqual({ 'part-tenita': 1, 'part-gawaita': 2, 'part-tanaita': 3 })
  })
})

describe('frozenSheetViews（部材が変わっています）', () => {
  it('変わっていなければ drift は空、切り終わりでなければ complete は false', () => {
    const job = freezeAt(shelfJob(), 0)
    const [v] = frozenSheetViews(job, dimsOf(job))
    expect(v.drift).toEqual([])
    expect(v.complete).toBe(false)
    expect(v.sheet).toBe(job.frozenSheets[0])
  })

  it('固定したあと部材の寸法を変えると size（変えた部材だけ。第2.2版から部材どうしの参照は無い）。固定は外れない', () => {
    const job = withPart(withPart(freezeAt(shelfJob(), 0), 'part-tenita', { expr: { W: '450', H: '1800' } }), 'part-tanaita', { expr: { W: '379', H: '1700' } })
    expect(drift(job)).toEqual([
      [
        ['天板', 'size'],
        ['棚板', 'size'],
      ],
    ])
    // 枚数0 の全体を変えても、固定した1枚の部材は変わらない
    expect(drift(withPart(freezeAt(shelfJob(), 0), 'part-zentai', { expr: { W: '450', H: '1800' } }))).toEqual([[]])
    expect(job.frozenSheets).toHaveLength(1)
  })

  it('切り代を変えても木取り寸法が変わるので size', () => {
    const job = freezeAt(shelfJob(), 1)
    job.settings = { ...job.settings, allowance: 5 }
    expect(drift(job)).toEqual([[['棚板', 'size']]])
  })

  it('0.04mm だけの違いは同じ寸法（小数第1位で比べる）', () => {
    const job = withPart(freezeAt(shelfJob(), 0), 'part-gawaita', { expr: { W: '400', H: '700.04' } })
    expect(drift(job)).toEqual([[]])
  })

  it('固定した片の数より枚数を減らすと count。増やすのは変わっていない', () => {
    const job = freezeAt(shelfJob(), 0)
    expect(drift(withPart(job, 'part-gawaita', { quantity: 1 }))).toEqual([[['側板', 'count']]])
    expect(drift(withPart(job, 'part-gawaita', { quantity: 0 }))).toEqual([[['側板', 'count']]])
    expect(drift(withPart(job, 'part-gawaita', { quantity: 4 }))).toEqual([[]])
  })

  it('部材を消すと removed（写しの名前）。名前を変えただけなら変わっていない', () => {
    const job = freezeAt(shelfJob(), 0)
    const removed = { ...job, parts: job.parts.filter((p) => p.id !== 'part-tenita') }
    // 天板を消しても、ほかの部材は変わらない（第2.2版から部材どうしの参照は無い）
    expect(drift(removed)).toEqual([[['天板', 'removed']]])
    expect(drift(withPart(job, 'part-gawaita', { name: '側板L' }))).toEqual([[]])
  })

  it('寸法がエラー（数字でない）になったら size', () => {
    const job = withPart(freezeAt(shelfJob(), 1), 'part-tanaita', { expr: { W: '(', H: '100' } })
    expect(drift(job)).toEqual([[['棚板', 'size']]])
  })

  it('切り終わりは complete', () => {
    const job = freezeAt(shelfJob(), 1, { partId: 'part-tanaita', n: 2 })
    expect(frozenSheetViews(job, dimsOf(job))[0].complete).toBe(true)
  })
})
