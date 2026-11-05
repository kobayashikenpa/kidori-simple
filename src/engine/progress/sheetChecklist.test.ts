// 1枚ごとのチェックの一覧（kidori の progress/sheetChecklist.test.ts・sheetPartChecklist.test.ts をもとに、
// 材料・フラッシュ・重ね切りを外し、見本を仕様書 6章の棚にしたもの）
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { pack, withPart } from '../fixtures/progress'
import { shelfJob } from '../fixtures/shelf'
import type { Job, Part } from '../types'
import { pieceReleaseSteps, sheetChecklist, sheetPartChecklist } from './sheetChecklist'

const shape = (rows: ReturnType<typeof sheetPartChecklist>) => rows.map((r) => [r.name, r.pieceIds.length, r.done])

describe('sheetChecklist（1片1行。切る順番に取り出される順）', () => {
  it('見本の1枚目：取り出す工程の小さい順', () => {
    const job = shelfJob()
    const [first] = pack(job).sheets
    const steps = pieceReleaseSteps(first)
    const rows = sheetChecklist(job, first, [])
    const got = rows.map((r) => steps.get(r.pieceId)!)
    expect(got).toEqual([...got].sort((a, b) => a - b))
    expect(rows).toHaveLength(first.placements.length)
    expect(rows.map((r) => r.name)).toEqual(['天板', '側板', '側板', '棚板'])
  })

  it('見本のすべての1枚・両方の切り方で、行は取り出す工程の小さい順', () => {
    for (const mode of ['vertical', 'horizontal'] as const) {
      const job = shelfJob()
      job.settings.cutMode = mode
      for (const s of pack(job).sheets) {
        const steps = pieceReleaseSteps(s)
        const got = sheetChecklist(job, s, []).map((r) => steps.get(r.pieceId)!)
        expect(got).toEqual([...got].sort((a, b) => a - b))
        expect(got).toHaveLength(s.placements.length)
      }
    }
  })

  it('チェックした片だけ done。寸法は写しの木取り寸法', () => {
    const job = shelfJob()
    const [first] = pack(job).sheets
    const rows = sheetChecklist(job, first, ['part-gawaita#2'])
    expect(rows.map((r) => [r.pieceId, r.sizeLabel, r.done])).toEqual([
      ['part-tenita#1', '410×1810', false],
      ['part-gawaita#1', '410×710', false],
      ['part-gawaita#2', '410×710', true],
      ['part-tanaita#1', '389×1770', false],
    ])
  })

  it('部材名を変えると行の名前もついてくる。部材を消すと写しの名前。寸法は今の寸法が変わっても写しのまま', () => {
    const job = shelfJob()
    const [first] = pack(job).sheets
    expect(sheetChecklist(withPart(job, 'part-gawaita', { name: '側板L' }), first, [])[1].name).toBe('側板L')
    const removed = { ...job, parts: job.parts.filter((p) => p.id !== 'part-gawaita') }
    expect(sheetChecklist(removed, first, [])[1].name).toBe('側板')
    const changed = withPart(job, 'part-gawaita', { expr: { W: '全体.W', H: '500' } })
    expect(sheetChecklist(changed, first, [])[1].sizeLabel).toBe('410×710')
  })

  it('同じ工程で取り出される片（最後の切り分けの上と下）は、配置の順（上が先）', () => {
    // 4×8 の縦切り優先は長手を端切りしないので、長さ 2430 に 1227 + 3 + 1200 がぴったり：最後の切り分け1本で両方が取り出される
    const part = (id: string, H: number): Part => ({ id, name: id, expr: { W: '390', H: String(H - 10) }, quantity: 1, rotatable: false, finishedDone: false })
    const base = createJob({ id: 'j', name: 'j', now: '2026-10-20T00:00:00.000Z' })
    const job: Job = { ...base, settings: { ...base.settings, allowance: 10 }, parts: [part('上', 1227), part('下', 1200)] }
    const [s] = pack(job).sheets
    expect(s.placements.map((p) => p.name)).toEqual(['上', '下'])
    const steps = pieceReleaseSteps(s)
    expect(steps.get('上#1')).toBe(steps.get('下#1'))
    expect(sheetChecklist(job, s, []).map((r) => r.name)).toEqual(['上', '下'])
  })
})

describe('sheetPartChecklist（同じ部材を1行にまとめる）', () => {
  it('見本の1枚目：天板 ×1・側板 ×2・棚板 ×1 の3行（切る順）', () => {
    const job = shelfJob()
    const [first] = pack(job).sheets
    const rows = sheetPartChecklist(job, first, [])
    expect(shape(rows)).toEqual([
      ['天板', 1, false],
      ['側板', 2, false],
      ['棚板', 1, false],
    ])
    expect(rows.map((r) => r.partId)).toEqual(['part-tenita', 'part-gawaita', 'part-tanaita'])
    expect(rows.flatMap((r) => r.pieceIds)).toEqual(sheetChecklist(job, first, []).map((r) => r.pieceId))
    expect(rows[1].sizeLabel).toBe('410×710')
  })

  it('見本の2枚目：棚板 ×2 の1行', () => {
    const job = shelfJob()
    expect(shape(sheetPartChecklist(job, pack(job).sheets[1], []))).toEqual([['棚板', 2, false]])
  })

  it('片がすべてチェック済みの行だけ done（側板の片の1つだけなら false）', () => {
    const job = shelfJob()
    const [first] = pack(job).sheets
    expect(shape(sheetPartChecklist(job, first, ['part-tenita#1', 'part-gawaita#1']))).toEqual([
      ['天板', 1, true],
      ['側板', 2, false],
      ['棚板', 1, false],
    ])
  })

  it('部材名は今の名前。部材が無ければ写しの名前', () => {
    const job = shelfJob()
    const [first] = pack(job).sheets
    const named = withPart(job, 'part-tanaita', { name: '中棚' })
    const renamed = { ...named, parts: named.parts.filter((p) => p.id !== 'part-tenita') }
    expect(sheetPartChecklist(renamed, first, []).map((r) => r.name)).toEqual(['天板', '側板', '中棚'])
  })
})
