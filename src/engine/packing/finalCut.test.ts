// 最終縦カットの位置（仕様書 25.3）：元の板の右端から、いちばん左の帯の左の端まで（端切りを含む）
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { computeDimensions } from '../dimensions'
import { freezeAt, pack } from '../fixtures/progress'
import { shelfJob } from '../fixtures/shelf'
import type { CutMode, Job, Part, Sheet, SheetLayout } from '../types'
import { finalCutFromRight } from './finalCut'
import { packJob } from './index'

function run(job: Job) {
  return packJob(job, computeDimensions(job))
}

function withMode(mode: CutMode, job: Job = shelfJob()): Job {
  job.settings.cutMode = mode
  return job
}

function part(id: string, W: number, H: number, quantity: number): Part {
  return { id, name: id, expr: { W: String(W), H: String(H) }, quantity, rotatable: false, finishedDone: false }
}

const SABUROKU: Sheet = { sizeKind: 'saburoku', width: 910, length: 1820 }

/** 3×6・刃厚3・端切り5・切り代0 で、指定の部材だけの仕事（寸法がそのまま木取り寸法になる） */
function jobOf(mode: CutMode, parts: Part[]): Job {
  const job = createJob({ id: 'job', name: '仕事', now: '2026-11-04T00:00:00.000Z' })
  job.settings = { ...job.settings, sheet: { ...SABUROKU }, kerf: 3, trim: 5, allowance: 0, cutMode: mode }
  job.parts = parts
  return job
}

const cutsOf = (job: Job) => run(job).sheets.map((s) => finalCutFromRight(s))

describe('finalCutFromRight：見本（4×8・刃厚3・端切り5・切り代10）', () => {
  it('縦切り優先：1枚目は帯が 410＋3＋410＋3＋389 ＝ 1215 で左の端まで届くので出さない（null）', () => {
    expect(cutsOf(withMode('vertical'))[0]).toBeNull()
  })

  it('縦切り優先：2枚目は 端切り5 ＋ 棚板389 ＋ 刃厚3 ＋ 棚板389 ＝ 右から 786', () => {
    expect(cutsOf(withMode('vertical'))).toEqual([null, 786])
  })

  it('横切り優先（横長の図の右から）：1枚目 5 ＋ 天板1810 ＝ 1815、2枚目 5 ＋ 棚板1770 ＝ 1775', () => {
    expect(cutsOf(withMode('horizontal'))).toEqual([1815, 1775])
  })

  it('値は最後の「帯を切る」切り方（切る順番）の位置と同じ所を指す', () => {
    for (const mode of ['vertical', 'horizontal'] as const) {
      for (const s of run(withMode(mode)).sheets) {
        const v = finalCutFromRight(s)
        if (v === null) continue
        const strips = s.cuts.filter((c) => c.kind === 'strip')
        const last = strips[strips.length - 1]
        const right = mode === 'horizontal' ? s.boardLength : s.boardWidth
        expect(v).toBe(right - last.at)
      }
    }
  })
})

describe('finalCutFromRight：3×6・刃厚3・端切り5', () => {
  it('縦切り優先：幅300 の帯が2本（3本目は 300＋3＋300＋3＋300 ＝ 906 で 905 に1mm 足りない）→ 5 ＋ 300 ＋ 3 ＋ 300 ＝ 608', () => {
    // 1本の帯に 長さ 600 が 3つ（600＋3＋600＋3＋600 ＝ 1806 ≦ 1820）× 帯2本 ＝ 6枚。7枚目は2枚目の板へ
    const r = run(jobOf('vertical', [part('板', 300, 600, 7)]))
    expect(r.sheetCount).toBe(2)
    expect(r.sheets.map((s) => finalCutFromRight(s))).toEqual([608, 305])
  })

  it('縦切り優先：幅299 の帯が3本で 299×3 ＋ 3×2 ＝ 903、左に2mm 余る → 5 ＋ 903 ＝ 908', () => {
    expect(cutsOf(jobOf('vertical', [part('板', 299, 600, 9)]))).toEqual([908])
  })

  it('縦切り優先：451 ＋ 3 ＋ 451 ＝ 905 で使える範囲にぴったり → 出さない（null）', () => {
    expect(cutsOf(jobOf('vertical', [part('板', 451, 1000, 2)]))).toEqual([null])
  })

  it('縦切り優先：450 ＋ 3 ＋ 451 ＝ 904 で左に1mm 余る → 5 ＋ 904 ＝ 909', () => {
    expect(cutsOf(jobOf('vertical', [part('A', 451, 1000, 1), part('B', 450, 1000, 1)]))).toEqual([909])
  })

  it('縦切り優先：1本の帯（幅900）で左に5mm 余る → 905', () => {
    expect(cutsOf(jobOf('vertical', [part('板', 900, 600, 2)]))).toEqual([905])
  })

  it('帯より細い部材は帯の右に寄せるので、帯の幅（いちばん広い部材）で測る：帯 700 に 300 が入っても 5 ＋ 700 ＝ 705', () => {
    // 300 の新しい帯は 700＋3＋300 ＝ 1003 で入らないので、帯 700 の下（1000＋3＋700 ≦ 1820）に右に寄せて置く
    const r = run(jobOf('vertical', [part('広い', 700, 1000, 1), part('細い', 300, 700, 1)]))
    expect(r.sheets[0].placements.map((p) => [p.name, p.x])).toEqual([['広い', 205], ['細い', 605]])
    expect(finalCutFromRight(r.sheets[0])).toBe(705)
  })

  it('横切り優先：長さ600 の帯が2本（妻手の向きに 900 を1枚ずつ）→ 5 ＋ 600 ＋ 3 ＋ 600 ＝ 1208', () => {
    expect(cutsOf(jobOf('horizontal', [part('板', 900, 600, 2)]))).toEqual([1208])
  })

  it('横切り優先：長さ 906 ＋ 3 ＋ 906 ＝ 1815 で使える範囲にぴったり → 出さない（null）', () => {
    expect(cutsOf(jobOf('horizontal', [part('A', 900, 906, 2)]))).toEqual([null])
  })

  it('端切り0：元の板の右端から帯の左の端まで（縦切り優先 300＋3＋300 ＝ 603）', () => {
    const job = jobOf('vertical', [part('板', 300, 600, 6)])
    job.settings.trim = 0
    expect(cutsOf(job)).toEqual([603])
  })

  it('刃厚0：帯の間に刃厚を足さない（5 ＋ 300 ＋ 300 ＝ 605）', () => {
    const job = jobOf('vertical', [part('板', 300, 600, 2)])
    job.settings.kerf = 0
    // 刃厚0 なら 600＋600＋600 ＝ 1800 ≦ 1820 で1本の帯に3つ入るので、2本目の帯ができるよう 4つにする
    job.parts[0].quantity = 4
    expect(cutsOf(job)).toEqual([605])
  })

  it('部材の無い1枚（置いた部材が無い）は出さない', () => {
    const s = run(jobOf('vertical', [part('板', 300, 600, 1)])).sheets[0]
    expect(finalCutFromRight({ ...s, placements: [] })).toBeNull()
  })
})

describe('finalCutFromRight：固定した1枚', () => {
  it('固定した1枚の写し（layout）からも同じ値を出す。部材を変えても固定した1枚の値は変わらない', () => {
    const job = freezeAt(shelfJob(), 1)
    const before = pack(shelfJob()).sheets[1]
    expect(finalCutFromRight(job.frozenSheets[0].layout)).toBe(786)
    expect(finalCutFromRight(job.frozenSheets[0].layout)).toBe(finalCutFromRight(before))
    const changed: Job = { ...job, parts: job.parts.map((p) => (p.id === 'part-tanaita' ? { ...p, expr: { W: '300', H: '1000' } } : p)) }
    expect(finalCutFromRight(changed.frozenSheets[0].layout)).toBe(786)
  })

  it('保存して読み戻した写し（JSON）でも出す。値は配置図の向き（orientation）を使わず、端切りと使える範囲から求める', () => {
    const job = freezeAt(withMode('horizontal'), 0)
    const saved = JSON.parse(JSON.stringify(job.frozenSheets[0].layout)) as Partial<SheetLayout>
    delete saved.orientation
    expect(finalCutFromRight(saved as SheetLayout)).toBe(1815)
  })
})
