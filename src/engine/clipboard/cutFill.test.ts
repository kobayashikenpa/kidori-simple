// 範囲（四角）・切り取り・オートフィル（第1.3版。仕様書 17.1・17.3・17.4）
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import type { CellClip, CellPos, CellRange, Job, Part } from '../types'
import {
  clearCells,
  clearCutSource,
  columnRange,
  copyCells,
  cutCells,
  deleteRows,
  fillCells,
  pasteCells,
  rangeCells,
  rowRange,
  selectedPartIds,
  selectionRange,
  type PasteCellsResult,
} from './cells'

function ids(): (prefix: string) => string {
  let n = 0
  return (prefix) => `${prefix}-new${++n}`
}

function part(id: string, name: string, W = '100', H = '200', quantity: number | null = 1): Part {
  return { id, name, expr: { W, H }, quantity, rotatable: false, finishedDone: false }
}

function jobOf(id: string, ...parts: Part[]): Job {
  const job = createJob({ id, name: id, now: '2026-10-23T00:00:00.000Z' })
  job.parts = parts
  return job
}

const R = (top: number, left: number, rows: number, cols: number): CellRange => ({ top, left, rows, cols })

function ok(r: PasteCellsResult): Extract<PasteCellsResult, { ok: true }> {
  if (!r.ok) throw new Error(r.message)
  return r
}

function clipOk(r: ReturnType<typeof copyCells>): CellClip {
  if (!r.ok) throw new Error(r.message)
  return r.clip
}

const table = (job: Job) => job.parts.map((p) => [p.name, p.expr.W, p.expr.H, p.quantity])

/** 棚：全体・天板・側板・棚板 */
const shelf = (id = 'job-a') =>
  jobOf(
    id,
    part('p0', '全体', '400', '1800', 0),
    part('p1', '天板', '400', '1800', 1),
    part('p2', '側板', '400', '700', 2),
    part('p3', '棚板', '380', '1760', 3),
  )

describe('範囲（四角）', () => {
  it('四角からセルの配列（上から・左から）', () => {
    expect(rangeCells(R(2, 1, 2, 2))).toEqual<CellPos[]>([
      { row: 2, col: 'W' },
      { row: 2, col: 'H' },
      { row: 3, col: 'W' },
      { row: 3, col: 'H' },
    ])
  })

  it('表をはみ出す所・負の行は入れない。空の四角は空の配列', () => {
    expect(rangeCells(R(-1, 3, 2, 3))).toEqual([{ row: 0, col: 'qty' }])
    expect(rangeCells(R(0, 0, 0, 4))).toEqual([])
  })

  it('行全体は 名前〜枚数', () => {
    expect(rowRange(3)).toEqual(R(3, 0, 1, 4))
    expect(rowRange(1, 2)).toEqual(R(1, 0, 2, 4))
  })

  it('列全体は 部材の数の行（空の行は入れない）。部材が無ければ1行', () => {
    expect(columnRange(shelf(), 1)).toEqual(R(0, 1, 4, 1))
    expect(columnRange(shelf(), 2, 2)).toEqual(R(0, 2, 4, 2))
    expect(columnRange(jobOf('e'), 0)).toEqual(R(0, 0, 1, 1))
  })

  it('セルの配列・四角のどちらからも四角を出す（四角でなければ null）', () => {
    expect(selectionRange([{ row: 1, col: 'H' }, { row: 0, col: 'W' }, { row: 0, col: 'H' }, { row: 1, col: 'W' }])).toEqual(R(0, 1, 2, 2))
    expect(selectionRange([{ row: 0, col: 'W' }, { row: 2, col: 'W' }])).toBeNull()
    expect(selectionRange(R(0, 3, 2, 3))).toEqual(R(0, 3, 2, 1))
    expect(selectionRange(R(0, 0, 0, 1))).toBeNull()
  })

  it('今の関数（コピー・貼り付け・クリア・行を削除）は四角でも呼べる', () => {
    const job = shelf()
    expect(clipOk(copyCells(job, R(1, 0, 2, 2))).cells).toEqual([
      ['天板', '400'],
      ['側板', '400'],
    ])
    const clip: CellClip = { rows: 1, cols: 1, cells: [['5']] }
    expect(table(ok(pasteCells(job, clip, columnRange(job, 3), ids())).job).map((r) => r[3])).toEqual([5, 5, 5, 5])
    expect(table(clearCells(job, R(3, 1, 1, 2)))[3]).toEqual(['棚板', '', '', 3])
    expect(selectedPartIds(job, rowRange(1, 2))).toEqual(['p1', 'p2'])
    expect(deleteRows(job, rowRange(0)).parts.map((p) => p.id)).toEqual(['p1', 'p2', 'p3'])
  })
})

describe('切り取り', () => {
  it('切り取るとコピーと同じ中身に、元（仕事の id と範囲）が付く', () => {
    const r = cutCells(shelf(), R(2, 1, 2, 2))
    expect(r).toEqual({
      ok: true,
      clip: {
        rows: 2,
        cols: 2,
        cells: [
          ['400', '700'],
          ['380', '1760'],
        ],
        cut: { jobId: 'job-a', range: R(2, 1, 2, 2) },
      },
    })
  })

  it('四角でなければ切り取れない', () => {
    expect(cutCells(shelf(), [{ row: 0, col: 'W' }, { row: 2, col: 'W' }]).ok).toBe(false)
  })

  it('同じ仕事：切り取って貼ると元が空になる（行の全部の欄が空になった部材は消える）', () => {
    const job = shelf()
    job.parts.push(part('p4', '背板', '300', '400', 1))
    const clip = clipOk(cutCells(job, R(4, 1, 1, 3))) // 背板の W・H・枚数
    const r = ok(pasteCells(job, clip, [{ row: 0, col: 'W' }], ids()))
    expect(r.pasted).toBe(3)
    expect(table(r.job)).toEqual([
      ['全体', '300', '400', 1],
      ['天板', '400', '1800', 1],
      ['側板', '400', '700', 2],
      ['棚板', '380', '1760', 3],
      ['背板', '', '', null],
    ])
    expect(r.cutClear).toBeNull()
    // 名前まで切り取って空の行に貼ると、元の部材は消え、下に詰めて足される（名前は同じでも貼れる）
    const clip2 = clipOk(cutCells(job, rowRange(4)))
    const r2 = ok(pasteCells(job, clip2, [{ row: 8, col: 'name' }], ids()))
    expect(r2.skipped).toEqual([])
    expect(table(r2.job)).toEqual([...table(job).slice(0, 4), ['背板', '300', '400', 1]])
    expect(r2.job.parts[4].id).not.toBe('p4')
  })

  it('同じ仕事：貼る先と重なるセルは空にしない（1行下へずらす）', () => {
    const job = jobOf('job-a', part('a', 'A', '1', '2', 1), part('b', 'B', '3', '4', 1), part('c', 'C', '5', '6', 1))
    const clip = clipOk(cutCells(job, R(0, 1, 2, 1))) // W の 1・3
    const r = ok(pasteCells(job, clip, R(1, 1, 1, 1), ids()))
    expect(table(r.job).map((x) => x[1])).toEqual(['', '1', '3'])
  })

  it('ほかの仕事に貼ったとき：空にする元のセルを返し、clearCutSource で元の仕事を空にする', () => {
    const src = shelf('job-a')
    const dst = jobOf('job-b')
    const clip = clipOk(cutCells(src, R(3, 0, 1, 4)))
    const r = ok(pasteCells(dst, clip, [{ row: 0, col: 'name' }], ids()))
    expect(table(r.job)).toEqual([['棚板', '380', '1760', 3]])
    expect(r.cutClear).toEqual({ jobId: 'job-a', cells: rangeCells(R(3, 0, 1, 4)) })
    const cleared = clearCutSource(src, clip, r.cutClear!.cells)
    expect(cleared.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板'])
  })

  it('ほかの仕事に同じ名前があっても、そのまま貼り、元は空にする（第2.2版。仕様書 26.3）', () => {
    const src = shelf('job-a')
    const dst = jobOf('job-b', part('x', '棚板', '1', '1', 1))
    const clip = clipOk(cutCells(src, R(3, 0, 1, 2))) // 棚板・380
    const r = ok(pasteCells(dst, clip, [{ row: 1, col: 'name' }], ids()))
    expect(r.skipped).toEqual([])
    expect(table(r.job)[1].slice(0, 2)).toEqual(['棚板', '380'])
    expect(r.cutClear).toEqual({ jobId: 'job-a', cells: [{ row: 3, col: 'name' }, { row: 3, col: 'W' }] })
  })

  it('貼れなかったセルの元は空にしない（枚数に名前の文字）', () => {
    const src = jobOf('job-a', part('a', 'A', '10', '20', 1), part('b', 'B', '10', '30', 2))
    const dst = jobOf('job-b')
    const clip = clipOk(cutCells(src, R(1, 0, 1, 1))) // B
    const r = ok(pasteCells(dst, clip, [{ row: 0, col: 'qty' }], ids()))
    expect(r.pasted).toBe(0)
    expect(r.cutClear).toBeNull()
  })

  it('同じ仕事の中で切り取った名前は、そのまま動かす', () => {
    const src = shelf('job-a')
    const clip = clipOk(cutCells(src, R(3, 0, 1, 1))) // 棚板
    const r = ok(pasteCells(src, clip, [{ row: 4, col: 'name' }], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板', '', '棚板'])
  })

  it('切り取った名前は、貼る先に同じ名前があってもそのまま貼る', () => {
    const src = jobOf('job-a', part('a', '棚板'), part('b', 'B'))
    const dst = jobOf('job-b', part('x', '棚板'))
    const clip = clipOk(cutCells(src, R(0, 0, 1, 1)))
    const r = ok(pasteCells(dst, clip, [{ row: 1, col: 'name' }], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板', '棚板'])
  })

  it('元のセルを切り取ったあとに書き換えていたら、そのセルは空にしない', () => {
    const src = shelf('job-a')
    const clip = clipOk(cutCells(src, R(1, 1, 1, 2)))
    src.parts[1] = { ...src.parts[1], expr: { W: '999', H: '1800' } }
    expect(table(clearCutSource(src, clip, rangeCells(R(1, 1, 1, 2))))[1]).toEqual(['天板', '999', '', 1])
  })

  it('1つも貼れなければ元は空にしない', () => {
    const job = shelf()
    const clip = clipOk(cutCells(job, R(1, 0, 1, 1))) // 名前「天板」を
    const r = ok(pasteCells(job, clip, [{ row: 0, col: 'qty' }], ids())) // 枚数に
    expect(r.pasted).toBe(0)
    expect(r.job).toBe(job)
    expect(r.cutClear).toBeNull()
  })

  it('切り取りでないクリップは元を空にしない', () => {
    const job = shelf()
    const clip = clipOk(copyCells(job, R(1, 1, 1, 1)))
    const r = ok(pasteCells(job, clip, [{ row: 3, col: 'W' }], ids()))
    expect(table(r.job)[1]).toEqual(['天板', '400', '1800', 1])
    expect(r.cutClear).toBeNull()
  })
})

describe('オートフィル', () => {
  const job4 = () =>
    jobOf('job-a', part('a', 'A', '10', '20', 1), part('b', 'B', '30', '40', 2), part('c', 'C', '50', '60', 3), part('d', 'D', '70', '80', 4))

  it('2行の範囲を下に5行引くと、くり返して入る（数は増やさない）。行が足りなければ部材を足す', () => {
    const job = job4()
    const r = ok(fillCells(job, R(0, 1, 2, 3), R(0, 1, 7, 3), ids()))
    expect(r.skipped).toEqual([])
    expect(r.pasted).toBe(15)
    expect(table(r.job)).toEqual([
      ['A', '10', '20', 1],
      ['B', '30', '40', 2],
      ['C', '10', '20', 1],
      ['D', '30', '40', 2],
      ['', '10', '20', 1],
      ['', '30', '40', 2],
      ['', '10', '20', 1],
    ])
    expect(r.job.parts.slice(4).map((p) => p.id)).toEqual(['part-new1', 'part-new2', 'part-new3'])
  })

  it('式のセルを引くと、式のまま入る（第2.3版。仕様書 27.4）', () => {
    const job = jobOf('job-a', part('a', 'A', '450-50', '1800/2'), part('b', 'B', '30', '40'))
    const r = ok(fillCells(job, R(0, 1, 1, 2), R(0, 1, 3, 2), ids()))
    expect(r.skipped).toEqual([])
    expect(table(r.job).map((x) => [x[1], x[2]])).toEqual([
      ['450-50', '1800/2'],
      ['450-50', '1800/2'],
      ['450-50', '1800/2'],
    ])
  })

  it('引いた先は、元を除いた所だけでもよい', () => {
    const r = ok(fillCells(job4(), R(0, 1, 2, 1), R(2, 1, 2, 1), ids()))
    expect(table(r.job).map((x) => x[1])).toEqual(['10', '30', '10', '30'])
  })

  it('上へ引くと、元の範囲の下の端から上へ並びがつながる', () => {
    const r = ok(fillCells(job4(), R(2, 3, 2, 1), R(0, 3, 4, 1), ids()))
    expect(table(r.job).map((x) => x[3])).toEqual([3, 4, 3, 4])
  })

  it('名前の列も、同じ名前をくり返して入れる（第2.2版。番号を振らない。ほかの列も入る）', () => {
    const r = ok(fillCells(job4(), R(0, 0, 1, 2), R(0, 0, 3, 2), ids()))
    expect(r.skipped).toEqual([])
    expect(table(r.job).slice(0, 3)).toEqual([
      ['A', '10', '20', 1],
      ['A', '10', '40', 2],
      ['A', '10', '60', 3],
    ])
  })

  it('「棚板」の名前を下へ引くと 棚板・棚板（空の行には部材を足す）', () => {
    const job = jobOf('job-a', part('a', '全体'), part('b', '棚板'))
    const r = ok(fillCells(job, R(1, 0, 1, 1), R(1, 0, 3, 1), ids()))
    expect(r.pasted).toBe(2)
    expect(r.job.parts.map((p) => p.name)).toEqual(['全体', '棚板', '棚板', '棚板'])
  })

  it('元の名前が空なら、引いた先の名前も空にする（W・H と同じ）', () => {
    const job = jobOf('job-a', part('a', '', '10', '20'), part('b', 'B', '30', '40'))
    const r = ok(fillCells(job, R(0, 0, 1, 1), R(0, 0, 2, 1), ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['', ''])
  })

  it('枚数の列は 16.1 と同じ決まり（0 以上の整数・空は空に）', () => {
    const job = jobOf('job-a', part('a', 'A', '10', '20', null), part('b', 'B', '30', '40', 2))
    const r = ok(fillCells(job, R(0, 3, 1, 1), R(0, 3, 2, 1), ids()))
    expect(r.job.parts[1].quantity).toBeNull()
  })

  it('引いた先が元の中だけなら、何もしない。元が範囲でなければ知らせる', () => {
    const job = job4()
    const r = ok(fillCells(job, R(0, 1, 2, 2), R(0, 1, 1, 2), ids()))
    expect(r.pasted).toBe(0)
    expect(r.job).toBe(job)
    expect(fillCells(job, R(0, 1, 0, 2), R(0, 1, 3, 2), ids()).ok).toBe(false)
  })

  it('左右に引いても、元の列のまま上下にだけ入る', () => {
    const r = ok(fillCells(job4(), R(0, 1, 1, 1), R(0, 0, 2, 4), ids()))
    expect(table(r.job)[1]).toEqual(['B', '10', '40', 2])
    expect(r.skipped).toEqual([])
  })
})
