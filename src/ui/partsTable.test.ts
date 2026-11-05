import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../engine/dimensions'
import { shelfJob } from '../engine/fixtures/shelf'
import { newPart } from '../store/jobs'
import type { DimensionError } from '../engine/types'
import {
  cutDimCell,
  cutQuantityText,
  inputRow,
  isBlankPart,
  nextCell,
  quantityFromText,
  quantityText,
  rotationState,
  tableDimCell,
  tableRowCount,
  addRowsMin,
  sessionTableMinRows,
  setSessionTableMinRows,
  errorsWhileEditing,
  cellBarText,
  fxBarField,
} from './partsTable'

describe('部材の表の行（仕様書 15.1）', () => {
  it('5行に満たないときは5行、そうでなければ部材の数 ＋ 空の行1つ（仕様書 21.4）', () => {
    expect(tableRowCount(0)).toBe(5)
    expect(tableRowCount(3)).toBe(5)
    expect(tableRowCount(4)).toBe(5)
    expect(tableRowCount(5)).toBe(6)
    expect(tableRowCount(25)).toBe(26)
  })

  it('「＋ 5行足す」で空の行が5行増え、いちばん下の行に入れるとまた1行増える（仕様書 16.6）', () => {
    const min = addRowsMin(0)
    expect(min).toBe(10)
    expect(tableRowCount(0, min)).toBe(10)
    expect(tableRowCount(9, min)).toBe(10)
    expect(tableRowCount(10, min)).toBe(11)
    // 部材が多いときも、今の行の数から5行増える
    expect(addRowsMin(25)).toBe(31)
    expect(tableRowCount(25, addRowsMin(25))).toBe(31)
    // 2回押すと 5 ＋ 10行
    expect(tableRowCount(0, addRowsMin(0, addRowsMin(0)))).toBe(15)
  })

  it('足した行は仕事ごとに覚える（保存しない）', () => {
    expect(sessionTableMinRows('job-x')).toBe(5)
    setSessionTableMinRows('job-x', 10)
    expect(sessionTableMinRows('job-x')).toBe(10)
    expect(sessionTableMinRows('job-y')).toBe(5)
  })

  it('何も入っていない部材（名前・W・H・枚数が空）だけが空とみなされる', () => {
    expect(isBlankPart(newPart('a', { quantity: null }))).toBe(true)
    expect(isBlankPart(newPart('a', { quantity: null, rotatable: true }))).toBe(true)
    expect(isBlankPart(newPart('a', { quantity: 0 }))).toBe(false)
    expect(isBlankPart(newPart('a', { quantity: null, name: '天板' }))).toBe(false)
    expect(isBlankPart(newPart('a', { quantity: null, expr: { W: '', H: '700' } }))).toBe(false)
  })

  it('途中の空の行を押すと、いちばん上の空の行になる', () => {
    expect(inputRow(2, 4)).toBe(2)
    expect(inputRow(4, 4)).toBe(4)
    expect(inputRow(8, 4)).toBe(4)
  })

  it('「次へ」：名前は縦に進む（次の行の名前）。幅 → 長さ → 枚数 → 次の行の幅（名前の列には進まない。仕様書 29.1）', () => {
    expect(nextCell({ row: 0, field: 'name' }, 4)).toEqual({ row: 1, field: 'name' })
    expect(nextCell({ row: 3, field: 'name' }, 4)).toEqual({ row: 4, field: 'name' })
    // 空の行のまま次へ：同じ空の行
    expect(nextCell({ row: 4, field: 'name' }, 4)).toEqual({ row: 4, field: 'name' })
    expect(nextCell({ row: 0, field: 'W' }, 4)).toEqual({ row: 0, field: 'H' })
    expect(nextCell({ row: 0, field: 'H' }, 4)).toEqual({ row: 0, field: 'qty' })
    expect(nextCell({ row: 0, field: 'qty' }, 4)).toEqual({ row: 1, field: 'W' })
    // 最後の部材の次は空の行の幅
    expect(nextCell({ row: 3, field: 'qty' }, 4)).toEqual({ row: 4, field: 'W' })
    expect(nextCell({ row: 4, field: 'qty' }, 4)).toEqual({ row: 4, field: 'W' })
  })

  it('枚数の文字と枚数（空は null、0 は寸法だけ）', () => {
    expect(quantityText(null)).toBe('')
    expect(quantityText(0)).toBe('0')
    expect(quantityFromText('')).toBeNull()
    expect(quantityFromText('0')).toBe(0)
    expect(quantityFromText('12')).toBe(12)
  })
})

describe('部材の表の W・H の欄（見本 6章）', () => {
  const job = shelfJob()
  const dims = computeDimensions(job)
  const cell = (name: string, axis: 'W' | 'H') => {
    const p = job.parts.find((x) => x.name === name)!
    return tableDimCell(p, dims.parts.find((d) => d.partId === p.id), axis)
  }

  it('数値はその数値（仕上がり）', () => {
    expect(cell('全体', 'W')).toEqual({ kind: 'number', value: 400 })
    expect(cell('棚板', 'W')).toEqual({ kind: 'number', value: 379 })
    expect(cell('棚板', 'H')).toEqual({ kind: 'number', value: 1760 })
  })

  it('空の欄は空（エラーにしない）', () => {
    const p = newPart('x', { quantity: null, expr: { W: '', H: '700' } })
    expect(tableDimCell(p, undefined, 'W')).toEqual({ kind: 'empty' })
  })
})

describe('全部回転してよい・木取りの表（U-12）', () => {
  it('全部回転してよい／一部／なし（部材が無ければなし）', () => {
    const job = shelfJob()
    expect(rotationState([])).toBe('none')
    expect(rotationState(job.parts)).toBe('none')
    expect(rotationState(job.parts.map((p, i) => ({ ...p, rotatable: i === 1 })))).toBe('some')
    expect(rotationState(job.parts.map((p) => ({ ...p, rotatable: true })))).toBe('all')
  })

  it('木取りの表の枚数：空は空、0 は「切らない」', () => {
    expect(cutQuantityText(null)).toBe('')
    expect(cutQuantityText(0)).toBe('切らない')
    expect(cutQuantityText(3)).toBe('3')
  })

  it('木取りの表の W・H は木取り寸法（仕上がり ＋ 切り代）', () => {
    const job = shelfJob()
    const dims = computeDimensions(job)
    const tanaita = job.parts[3]
    const d = dims.parts.find((x) => x.partId === tanaita.id)
    expect(cutDimCell(tanaita, d, 'W')).toEqual({ kind: 'number', value: 389 })
    expect(cutDimCell(job.parts[2], dims.parts[2], 'H')).toEqual({ kind: 'number', value: 710 })
    expect(cutDimCell(newPart('x'), undefined, 'W')).toEqual({ kind: 'empty' })
  })
})

describe('入力中のセルのエラー（仕様書 26.1）', () => {
  const err = (kind: DimensionError['kind'], extra: Partial<DimensionError> = {}): DimensionError => ({
    partId: 'p',
    axis: 'W',
    kind,
    message: kind,
    ...extra,
  })
  it('入れている途中の形（空・「12.」）は出さない', () => {
    expect(errorsWhileEditing([err('syntax', { incomplete: true })])).toEqual([])
  })
  it('0 以下・数字でないものは出す', () => {
    const shown = [err('nonPositive'), err('syntax')]
    expect(errorsWhileEditing(shown)).toEqual(shown)
  })
})

describe('入力中の式のエラー（第2.3版。仕様書 27.1）', () => {
  const editingErrors = (W: string) => {
    const job = shelfJob()
    job.parts[3].expr.W = W
    const d = computeDimensions(job).parts.find((x) => x.partId === job.parts[3].id)
    return errorsWhileEditing(d?.errors.filter((e) => e.axis === 'W') ?? []).map((e) => e.message)
  }
  it('入れている途中の形（終わりが記号・かっこが閉じていない）は出さない', () => {
    expect(editingErrors('450-')).toEqual([])
    expect(editingErrors('(900-18')).toEqual([])
  })
  it('0 で割る・0 以下になる式は出す', () => {
    expect(editingErrors('1/0')).toEqual(['0 で割っています'])
    expect(editingErrors('50-100')).toEqual(['計算結果が 0 以下になります（−50）'])
  })
  it('計算できる式はエラーなし', () => {
    expect(editingErrors('450-50')).toEqual([])
  })
})

describe('式の欄（第2.4版。仕様書 28.1）', () => {
  const parts = () => {
    const job = shelfJob()
    job.parts[3].expr.W = '400-21'
    job.parts[3].expr.H = '(1800-40)/1'
    job.parts[2].quantity = null
    return job.parts
  }
  const cell = (top: number, left: number, rows = 1, cols = 1) => ({ top, left, rows, cols })
  it('幅・長さのセルは、そのセルの中身だけ（式は × ÷ − の書き方、数字はそのまま）', () => {
    expect(cellBarText(parts(), cell(3, 1))).toBe('400−21')
    expect(cellBarText(parts(), cell(3, 2))).toBe('(1800−40)÷1')
    expect(cellBarText(parts(), cell(0, 1))).toBe('400')
  })
  it('枚数のセルは枚数（空は空、0 は 0）', () => {
    expect(cellBarText(parts(), cell(3, 3))).toBe('3')
    expect(cellBarText(parts(), cell(0, 3))).toBe('0')
    expect(cellBarText(parts(), cell(2, 3))).toBe('')
  })
  it('何も選んでいない・名前のセル・空の行は空', () => {
    expect(cellBarText(parts(), null)).toBe('')
    expect(cellBarText(parts(), cell(3, 0))).toBe('')
    expect(cellBarText(parts(), cell(4, 1))).toBe('')
    expect(cellBarText(parts(), cell(4, 3))).toBe('')
  })
  it('範囲・行・列を選んだら左上のセル', () => {
    expect(cellBarText(parts(), cell(3, 1, 1, 2))).toBe('400−21')
    expect(cellBarText(parts(), cell(2, 2, 2, 2))).toBe('700')
    // 行全体は左上が名前なので空
    expect(cellBarText(parts(), cell(3, 0, 1, 4))).toBe('')
  })
  it('欄を出すのは、左上が幅・長さ・枚数のセルのときだけ（空の行も出す。名前・何も選んでいないときは出さない）', () => {
    expect(fxBarField(cell(3, 1))).toBe('W')
    expect(fxBarField(cell(4, 2))).toBe('H')
    expect(fxBarField(cell(0, 3, 3, 1))).toBe('qty')
    expect(fxBarField(cell(3, 0))).toBeNull()
    expect(fxBarField(cell(3, 0, 1, 4))).toBeNull()
    expect(fxBarField(null)).toBeNull()
  })
})
