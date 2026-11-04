// セルのコピーと貼り付け・消す・行を削除（第1.2版。仕様書 16.1）
import { describe, expect, it } from 'vitest'
import { createJob } from '../defaults'
import { computeDimensions } from '../dimensions'
import { MELAMINE_ID, shelfJob } from '../fixtures/shelf'
import type { CellClip, CellCol, CellPos, Job, Part } from '../types'
import {
  cellText,
  clearCells,
  copyCells,
  COPY_SHAPE_MESSAGE,
  deleteRows,
  pasteCells,
  selectedPartIds,
  selectionShape,
  type PasteCellsResult,
} from './cells'

/** 決まった id を順に出す */
function ids(): (prefix: string) => string {
  let n = 0
  return (prefix) => `${prefix}-new${++n}`
}

const c = (row: number, col: CellCol): CellPos => ({ row, col })

function part(id: string, name: string, W = '100', H = '200', quantity: number | null = 1): Part {
  return { id, name, expr: { W, H }, quantity, rotatable: false, finishedDone: false }
}

function jobOf(...parts: Part[]): Job {
  const job = createJob({ id: 'job-x', name: 'x', now: '2026-10-22T00:00:00.000Z' })
  job.parts = parts
  return job
}

const clipOf = (cells: string[][]): CellClip => ({ rows: cells.length, cols: cells[0].length, cells })

function okPaste(r: PasteCellsResult): Extract<PasteCellsResult, { ok: true }> {
  if (!r.ok) throw new Error(r.message)
  return r
}

/** 部材の表を [名前, W, H, 枚数] の行で見る */
const table = (job: Job) => job.parts.map((p) => [p.name, p.expr.W, p.expr.H, p.quantity])

describe('selectionShape（1つ／四角い範囲／それ以外）', () => {
  it('何も選んでいない', () => {
    expect(selectionShape([])).toEqual({ kind: 'none' })
  })

  it('1つのセルは 1行×1列の範囲', () => {
    expect(selectionShape([c(2, 'H')])).toEqual({ kind: 'range', top: 2, left: 2, rows: 1, cols: 1 })
  })

  it('続いた行 × 続いた列（押した順によらない。同じセルを2回入れても1つ）', () => {
    const sel = [c(4, 'H'), c(3, 'W'), c(4, 'W'), c(3, 'H'), c(3, 'H')]
    expect(selectionShape(sel)).toEqual({ kind: 'range', top: 3, left: 1, rows: 2, cols: 2 })
  })

  it('1行に横いっぱい（名前〜枚数）も範囲', () => {
    expect(selectionShape([c(0, 'name'), c(0, 'W'), c(0, 'H'), c(0, 'qty')])).toEqual({ kind: 'range', top: 0, left: 0, rows: 1, cols: 4 })
  })

  it('離れたセル・欠けた四角・飛んだ列や行は範囲でない', () => {
    expect(selectionShape([c(0, 'W'), c(2, 'W')]).kind).toBe('scattered')
    expect(selectionShape([c(0, 'name'), c(0, 'H')]).kind).toBe('scattered')
    expect(selectionShape([c(0, 'W'), c(0, 'H'), c(1, 'W')]).kind).toBe('scattered')
  })
})

describe('copyCells（中身は書いたまま）', () => {
  it('1つのセル：W・H は書いた数字のまま', () => {
    const r = copyCells(shelfJob(), [c(3, 'W')])
    expect(r).toEqual({ ok: true, clip: { rows: 1, cols: 1, cells: [['379']] } })
  })

  it('範囲：名前・W・H・枚数を形つきで。枚数が空・空の行は空の文字', () => {
    const job = shelfJob()
    job.parts[2].quantity = null
    const r = copyCells(job, [c(2, 'name'), c(2, 'W'), c(2, 'H'), c(2, 'qty'), c(3, 'name'), c(3, 'W'), c(3, 'H'), c(3, 'qty'), c(4, 'name'), c(4, 'W'), c(4, 'H'), c(4, 'qty')])
    expect(r.ok && r.clip).toEqual({
      rows: 3,
      cols: 4,
      cells: [
        ['側板', '400', '700', ''],
        ['棚板', '379', '1760', '3'],
        ['', '', '', ''],
      ],
    })
  })

  it('枚数 0（寸法だけ）は「0」', () => {
    expect(cellText(shelfJob(), c(0, 'qty'))).toBe('0')
  })

  it('離れたセル・何も選んでいないときはコピーできない', () => {
    expect(copyCells(shelfJob(), [c(0, 'W'), c(2, 'W')])).toEqual({ ok: false, message: COPY_SHAPE_MESSAGE })
    expect(copyCells(shelfJob(), [])).toEqual({ ok: false, message: COPY_SHAPE_MESSAGE })
  })

  it('写し：コピーしたあと部材を変えてもコピーは変わらない', () => {
    const job = shelfJob()
    const r = copyCells(job, [c(1, 'W')])
    job.parts[1].expr.W = '1'
    expect(r.ok && r.clip.cells).toEqual([['400']])
  })
})

describe('pasteCells：1つのセルをコピーしたとき', () => {
  it('1つのセルを3つのセルに貼ると、3つとも同じ', () => {
    const job = jobOf(part('a', 'A', '100', '200'), part('b', 'B', '300', '400'), part('c', 'C', '500', '600'))
    const r = okPaste(pasteCells(job, clipOf([['379']]), [c(0, 'W'), c(1, 'H'), c(2, 'W')], ids()))
    expect(table(r.job)).toEqual([
      ['A', '379', '200', 1],
      ['B', '300', '379', 1],
      ['C', '379', '600', 1],
    ])
    expect(r.pasted).toBe(3)
    expect(r.skipped).toEqual([])
  })

  it('W・H の数字は、ほかの仕事に貼っても同じ数字（棚板の W 379 を貼る）', () => {
    const src = shelfJob()
    const clip = okCopy(copyCells(src, [c(3, 'W')]))
    const other = jobOf(part('a', 'A', '100', '200'))
    const r = okPaste(pasteCells(other, clip, [c(0, 'W')], ids()))
    expect(r.job.parts[0].expr.W).toBe('379')
    expect(computeDimensions(r.job).parts[0].finished).toEqual({ W: 379, H: 200 })
  })

  it('W・H は数字だけ貼る（第2.2版。仕様書 26.1）：0 より大きい数（全角・小数も）は数字にそろえて貼る。式・名前の文字・0 は貼らない', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'))
    expect(okPaste(pasteCells(job, clipOf([['４００.５０']]), [c(0, 'W')], ids())).job.parts[0].expr.W).toBe('400.5')
    expect(okPaste(pasteCells(job, clipOf([['']]), [c(0, 'H')], ids())).job.parts[0].expr.H).toBe('')
    for (const bad of ['天板.W - 20', '1800 - 40', '棚板', '0', '-5', `{n:${MELAMINE_ID}}`]) {
      const r = okPaste(pasteCells(job, clipOf([[bad]]), [c(0, 'W'), c(1, 'H')], ids()))
      expect(r.pasted).toBe(0)
      expect(r.skipped).toEqual([
        { cell: c(0, 'W'), reason: 'notSize', message: 'W・H には 0 より大きい数だけ貼れます' },
        { cell: c(1, 'H'), reason: 'notSize', message: 'W・H には 0 より大きい数だけ貼れます' },
      ])
      expect(r.job).toBe(job)
    }
  })

  it('仕様書 18.3：「棚板」をコピーして2つのセルに貼ると「棚板1」「棚板2」。コピー元の「棚板」はそのまま', () => {
    const job = jobOf(part('a', '棚板'), part('b', 'B'), part('c', 'C'))
    const clip = okCopy(copyCells(job, [c(0, 'name')]))
    const r = okPaste(pasteCells(job, clip, [c(1, 'name'), c(2, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板', '棚板1', '棚板2'])
    expect(r.pasted).toBe(2)
    expect(r.skipped).toEqual([])
    expect(r.renamed).toEqual([
      { cell: c(1, 'name'), from: '棚板', to: '棚板1' },
      { cell: c(2, 'name'), from: '棚板', to: '棚板2' },
    ])
  })

  it('「棚板1」がもうあれば「棚板2」から。間が空いていれば一番小さい番号（棚板1・棚板3 があれば 棚板2・棚板4）', () => {
    const job = jobOf(part('a', '棚板'), part('b', '棚板1'), part('c', 'C'))
    const r = okPaste(pasteCells(job, clipOf([['棚板']]), [c(2, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板', '棚板1', '棚板2'])
    const job2 = jobOf(part('a', '棚板'), part('b', '棚板1'), part('c', '棚板3'))
    const r2 = okPaste(pasteCells(job2, clipOf([['棚板']]), [c(3, 'name'), c(4, 'name')], ids()))
    expect(r2.job.parts.map((p) => p.name)).toEqual(['棚板', '棚板1', '棚板3', '棚板2', '棚板4'])
  })

  it('番号の重なりも全角・半角の違いを同じとみなす（「棚板１」があれば「棚板2」）', () => {
    const job = jobOf(part('a', '棚板'), part('b', '棚板１'), part('c', 'C'))
    const r = okPaste(pasteCells(job, clipOf([['棚板']]), [c(2, 'name')], ids()))
    expect(r.job.parts[2].name).toBe('棚板2')
  })

  it('名前を複数の名前の欄に貼ると、今の部材と重ならなくても貼るものどうしが重なるので全部に番号を振る', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'), part('c', 'C'))
    const r = okPaste(pasteCells(job, clipOf([['棚板']]), [c(0, 'name'), c(1, 'name'), c(2, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板1', '棚板2', '棚板3'])
    expect(r.pasted).toBe(3)
    expect(r.skipped).toEqual([])
  })

  it('コピー元のセルも貼る先に入っていたら、コピー元は今の名前のまま、ほかに番号を振る', () => {
    const job = jobOf(part('a', '棚板'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['棚板']]), [c(0, 'name'), c(1, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板', '棚板1'])
    expect(r.renamed).toEqual([{ cell: c(1, 'name'), from: '棚板', to: '棚板1' }])
  })

  it('仕様書 18.3：コピーした名前の終わりが数字なら、その数字を外した名前に番号を振る（「棚板1」→「棚板2」。「棚板11」にしない）', () => {
    const job = jobOf(part('a', '棚板1'), part('b', 'B'), part('c', 'C'))
    const clip = okCopy(copyCells(job, [c(0, 'name')]))
    const r = okPaste(pasteCells(job, clip, [c(1, 'name'), c(2, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板1', '棚板2', '棚板3'])
    expect(r.renamed).toEqual([
      { cell: c(1, 'name'), from: '棚板1', to: '棚板2' },
      { cell: c(2, 'name'), from: '棚板1', to: '棚板3' },
    ])
  })

  it('終わりの数字が全角でも、複数桁でも外して振る（「棚板１２」→ 棚板 に番号）', () => {
    const job = jobOf(part('a', '棚板１２'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['棚板１２']]), [c(1, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板１２', '棚板1'])
  })

  it('数字だけの名前は、数字を外すと空になるので、そのまま後ろに番号を振る（「12」→「121」）', () => {
    const job = jobOf(part('a', '12'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['12']]), [c(1, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['12', '121'])
  })

  it('終わりが数字でも、重ならなければ番号を振らずにそのまま貼る', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['棚板5']]), [c(1, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['A', '棚板5'])
    expect(r.renamed).toEqual([])
  })

  it('今の部材と重ならない名前は、番号を振らずにそのまま貼る（ほかの仕事からのコピーなど）', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['棚板']]), [c(1, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['A', '棚板'])
    expect(r.renamed).toEqual([])
  })

  it('今ある部材と同じ名前（全角・半角の違いも）には番号を振る。空の名前はいくつでも貼れる', () => {
    const job = jobOf(part('a', '棚板1'), part('b', 'B'), part('c', 'C'))
    const r = okPaste(pasteCells(job, clipOf([['棚板１']]), [c(1, 'name')], ids()))
    expect(r.pasted).toBe(1)
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板1', '棚板2', 'C'])
    const r2 = okPaste(pasteCells(job, clipOf([['']]), [c(1, 'name'), c(2, 'name')], ids()))
    expect(r2.job.parts.map((p) => p.name)).toEqual(['棚板1', '', ''])
    expect(r2.pasted).toBe(2)
    expect(r2.renamed).toEqual([])
  })

  it('名前に使えない文字（式の記号）は貼らない', () => {
    const job = shelfJob()
    const r = okPaste(pasteCells(job, clipOf([['全体.W']]), [c(1, 'name')], ids()))
    expect(r.pasted).toBe(0)
    expect(r.skipped[0]).toMatchObject({ cell: c(1, 'name'), reason: 'invalidName' })
    expect(r.job.parts[1].name).toBe('天板')
  })

  it('枚数の欄：0 以上の整数（全角も）は貼る、空は空にする。式・文字・小数・マイナスは貼らない', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'), part('c', 'C'))
    expect(okPaste(pasteCells(job, clipOf([['３']]), [c(0, 'qty')], ids())).job.parts[0].quantity).toBe(3)
    expect(okPaste(pasteCells(job, clipOf([['0']]), [c(0, 'qty')], ids())).job.parts[0].quantity).toBe(0)
    expect(okPaste(pasteCells(job, clipOf([['']]), [c(0, 'qty')], ids())).job.parts[0].quantity).toBeNull()
    for (const bad of ['全体.W', '1+1', '1.5', '-1', '棚板']) {
      const r = okPaste(pasteCells(job, clipOf([[bad]]), [c(0, 'qty'), c(1, 'qty')], ids()))
      expect(r.pasted).toBe(0)
      expect(r.skipped).toEqual([
        { cell: c(0, 'qty'), reason: 'notQuantity', message: '枚数には 0 以上の整数だけ貼れます' },
        { cell: c(1, 'qty'), reason: 'notQuantity', message: '枚数には 0 以上の整数だけ貼れます' },
      ])
      expect(r.job).toBe(job)
    }
  })

  it('空の行に貼ると部材を作る（枚数は空から。途中の空の行でも、部材の後ろに詰めて足す）', () => {
    const job = jobOf(part('a', 'A'))
    const r = okPaste(pasteCells(job, clipOf([['500']]), [c(3, 'W'), c(5, 'W')], ids()))
    expect(r.job.parts.map((p) => [p.id, p.name, p.expr.W, p.expr.H, p.quantity])).toEqual([
      ['a', 'A', '100', '200', 1],
      ['part-new1', '', '500', '', null],
      ['part-new2', '', '500', '', null],
    ])
    expect(r.pasted).toBe(2)
  })

  it('空の行に空を貼っても部材は作らない', () => {
    const job = jobOf(part('a', 'A'))
    const r = okPaste(pasteCells(job, clipOf([['']]), [c(1, 'W'), c(1, 'H')], ids()))
    expect(r.job.parts).toHaveLength(1)
  })

  it('何も選んでいなければ断る', () => {
    expect(pasteCells(shelfJob(), clipOf([['1']]), [], ids())).toEqual({ ok: false, message: '貼るセルを選んでください' })
  })
})

describe('pasteCells：範囲をコピーしたとき', () => {
  it('2行×2列の範囲を貼ると、選んだセルの左上から同じ形', () => {
    const job = jobOf(part('a', 'A', '1', '2'), part('b', 'B', '3', '4'), part('c', 'C', '5', '6'), part('d', 'D', '7', '8'))
    const clip = okCopy(copyCells(job, [c(0, 'W'), c(0, 'H'), c(1, 'W'), c(1, 'H')]))
    const r = okPaste(pasteCells(job, clip, [c(2, 'W')], ids()))
    expect(table(r.job)).toEqual([
      ['A', '1', '2', 1],
      ['B', '3', '4', 1],
      ['C', '1', '2', 1],
      ['D', '3', '4', 1],
    ])
    expect(r.pasted).toBe(4)
  })

  it('いくつか選んでいても、一番左上のセルから貼る（選んだセルの数・形は使わない）', () => {
    const job = jobOf(part('a', 'A', '1', '2'), part('b', 'B', '3', '4'), part('c', 'C', '5', '6'))
    const r = okPaste(pasteCells(job, clipOf([['9', '9']]), [c(2, 'H'), c(1, 'W'), c(2, 'W')], ids()))
    expect(table(r.job)).toEqual([
      ['A', '1', '2', 1],
      ['B', '9', '9', 1],
      ['C', '5', '6', 1],
    ])
  })

  it('行が部材の数を越えたら、部材を足す', () => {
    const job = shelfJob()
    const clip = okCopy(copyCells(job, [c(2, 'W'), c(2, 'H'), c(2, 'qty'), c(3, 'W'), c(3, 'H'), c(3, 'qty')]))
    const r = okPaste(pasteCells(job, clip, [c(3, 'W')], ids()))
    expect(r.job.parts).toHaveLength(5)
    expect(table(r.job).slice(3)).toEqual([
      ['棚板', '400', '700', 2],
      ['', '379', '1760', 3],
    ])
    expect(r.job.parts[4]).toMatchObject({ id: 'part-new1', rotatable: false, finishedDone: false })
  })

  it('列が表の右（枚数）をはみ出す分は貼らない（数にも入れない）', () => {
    const job = jobOf(part('a', 'A', '1', '2'))
    const r = okPaste(pasteCells(job, clipOf([['7', '8', '9']]), [c(0, 'H')], ids()))
    expect(table(r.job)).toEqual([['A', '1', '7', 8]])
    expect(r.pasted).toBe(2)
    expect(r.skipped).toEqual([])
  })

  it('名前・W・H・枚数の行まるごとを、ほかの仕事の空の行に貼れる', () => {
    const src = shelfJob()
    const clip = okCopy(copyCells(src, [c(0, 'name'), c(0, 'W'), c(0, 'H'), c(0, 'qty'), c(1, 'name'), c(1, 'W'), c(1, 'H'), c(1, 'qty')]))
    const other = jobOf()
    const r = okPaste(pasteCells(other, clip, [c(0, 'name')], ids()))
    expect(table(r.job)).toEqual([
      ['全体', '400', '1800', 0],
      ['天板', '400', '1800', 1],
    ])
    expect(computeDimensions(r.job).parts[1].finished).toEqual({ W: 400, H: 1800 })
  })

  it('同じ名前は番号を振って貼り、枚数に式は貼られず貼れなかったセルが返る（ほかのセルは貼る）', () => {
    const job = shelfJob()
    // 棚板の行（名前・W・H・枚数）の形で、名前は今ある「天板」、枚数は式
    const clip = clipOf([['天板', '300', '400', '全体.W']])
    const r = okPaste(pasteCells(job, clip, [c(2, 'name')], ids()))
    expect(table(r.job)[2]).toEqual(['天板1', '300', '400', 2])
    expect(r.pasted).toBe(3)
    expect(r.skipped).toEqual([{ cell: c(2, 'qty'), reason: 'notQuantity', message: '枚数には 0 以上の整数だけ貼れます' }])
  })

  it('貼るものどうしで同じ名前（全角・半角の違いも）になるときは、どちらにも番号を振る（書いた文字の後ろに）', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['X'], ['Ｘ']]), [c(0, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['X1', 'Ｘ2'])
    expect(r.skipped).toEqual([])
  })

  it('番号は、重ならずにそのまま貼る名前とも重ならないようにする（「棚板」「棚板1」を貼る → 棚板2・棚板1）', () => {
    const job = jobOf(part('a', '棚板'), part('b', 'B'), part('c', 'C'))
    const r = okPaste(pasteCells(job, clipOf([['棚板'], ['棚板1']]), [c(1, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['棚板', '棚板2', '棚板1'])
  })

  it('名前を入れ替える貼り方（A・B の行に B・A）は、貼ったあとに重ならないので貼れる', () => {
    const job = jobOf(part('a', 'A'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['B'], ['A']]), [c(0, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['B', 'A'])
    expect(r.skipped).toEqual([])
  })

  it('貼れない名前（記号入り）の行は元の名前が残るので、それと重なる名前には番号を振る', () => {
    // 行0 に「B」を貼り、行1 に「棚+板」（使えない）を貼る → 行1 は B のまま → 行0 は B1
    const job = jobOf(part('a', 'A'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['B'], ['棚+板']]), [c(0, 'name')], ids()))
    expect(r.job.parts.map((p) => p.name)).toEqual(['B1', 'B'])
    expect(r.skipped.map((s) => [s.cell, s.reason])).toEqual([[c(1, 'name'), 'invalidName']])
  })

  it('番号を振る名前が名前に使えない（記号入り）ときは、今までどおり貼らない', () => {
    const job = jobOf(part('a', '棚(板'), part('b', 'B'))
    const r = okPaste(pasteCells(job, clipOf([['棚(板']]), [c(1, 'name')], ids()))
    expect(r.job).toBe(job)
    expect(r.skipped.map((s) => s.reason)).toEqual(['invalidName'])
  })

  it('貼って行の全部の欄が空になった部材は消す', () => {
    const job = jobOf(part('a', 'A'), part('b', '', '1', '', null))
    const r = okPaste(pasteCells(job, clipOf([['']]), [c(1, 'W')], ids()))
    expect(r.job.parts.map((p) => p.id)).toEqual(['a'])
  })

  it('部材 150 行に名前・数字をまとめて貼っても、すぐ終わる', () => {
    const job = jobOf(...Array.from({ length: 150 }, (_, i) => part(`p${i}`, `部材${i}`)))
    const names = Array.from({ length: 150 }, (_, i) => c(i, 'name'))
    const widths = Array.from({ length: 150 }, (_, i) => c(i, 'W'))
    const t = performance.now()
    const r1 = okPaste(pasteCells(job, clipOf([['棚板']]), names, ids()))
    const r = okPaste(pasteCells(r1.job, clipOf([['379.5']]), widths, ids()))
    expect(performance.now() - t).toBeLessThan(1000)
    expect(r1.pasted + r.pasted).toBe(300)
    expect([...r1.skipped, ...r.skipped]).toHaveLength(0)
    expect(r.job.parts[149].expr.W).toBe('379.5')
    expect(r.job.parts.slice(0, 3).map((p) => p.name)).toEqual(['棚板1', '棚板2', '棚板3'])
    expect(r.job.parts[149].name).toBe('棚板150')
  })

  it('元の仕事は書き換えない', () => {
    const job = shelfJob()
    const before = JSON.stringify(job)
    pasteCells(job, clipOf([['1', '2'], ['3', '4']]), [c(3, 'W')], ids())
    expect(JSON.stringify(job)).toBe(before)
  })
})

describe('clearCells（消す）', () => {
  it('選んだセルの中身を空にする（枚数は空）', () => {
    const job = shelfJob()
    const next = clearCells(job, [c(1, 'name'), c(2, 'W'), c(3, 'qty')])
    expect(table(next)).toEqual([
      ['全体', '400', '1800', 0],
      ['', '400', '1800', 1],
      ['側板', '', '700', 2],
      ['棚板', '379', '1760', null],
    ])
  })

  it('行の全部の欄が空になった部材は消す。空の行のセルは何もしない', () => {
    const job = shelfJob()
    const next = clearCells(job, [c(0, 'name'), c(0, 'W'), c(0, 'H'), c(0, 'qty'), c(7, 'W')])
    expect(next.parts.map((p) => p.name)).toEqual(['天板', '側板', '棚板'])
  })

  it('空の行だけ選んだときは同じ仕事を返す', () => {
    const job = shelfJob()
    expect(clearCells(job, [c(4, 'W')])).toBe(job)
  })
})

describe('deleteRows（行を削除）・selectedPartIds', () => {
  it('選んだセルのある行の部材をまとめて消す（同じ行のセルが多くても1回）', () => {
    const job = shelfJob()
    const sel = [c(0, 'W'), c(0, 'H'), c(2, 'qty'), c(9, 'name')]
    expect(selectedPartIds(job, sel)).toEqual(['part-zentai', 'part-gawaita'])
    expect(deleteRows(job, sel).parts.map((p) => p.name)).toEqual(['天板', '棚板'])
  })

  it('空の行だけなら同じ仕事を返す', () => {
    const job = shelfJob()
    expect(deleteRows(job, [c(4, 'W')])).toBe(job)
  })
})

function okCopy(r: ReturnType<typeof copyCells>): CellClip {
  if (!r.ok) throw new Error(r.message)
  return r.clip
}
