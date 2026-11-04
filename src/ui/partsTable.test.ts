import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../engine/dimensions'
import { legacyShelfJob, shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
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
  referencingOthers,
  rotationState,
  tableDimCell,
  tableRowCount,
  addRowsMin,
  sessionTableMinRows,
  setSessionTableMinRows,
  errorsWhileEditing,
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

  it('「次へ」は 名前 → W → H → 枚数 → 次の行の名前', () => {
    expect(nextCell({ row: 0, field: 'name' }, 4)).toEqual({ row: 0, field: 'W' })
    expect(nextCell({ row: 0, field: 'W' }, 4)).toEqual({ row: 0, field: 'H' })
    expect(nextCell({ row: 0, field: 'H' }, 4)).toEqual({ row: 0, field: 'qty' })
    expect(nextCell({ row: 0, field: 'qty' }, 4)).toEqual({ row: 1, field: 'name' })
    // 最後の部材の次は空の行
    expect(nextCell({ row: 3, field: 'qty' }, 4)).toEqual({ row: 4, field: 'name' })
    // 空の行のまま次へ：同じ空の行の名前
    expect(nextCell({ row: 4, field: 'qty' }, 4)).toEqual({ row: 4, field: 'name' })
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
  const adjusts = shelfAdjusts()
  const dims = computeDimensions(job)
  const cell = (name: string, axis: 'W' | 'H') => {
    const p = job.parts.find((x) => x.name === name)!
    return tableDimCell(p, dims.parts.find((d) => d.partId === p.id), axis, adjusts)
  }

  it('数値はその数値（仕上がり）', () => {
    expect(cell('全体', 'W')).toEqual({ kind: 'number', value: 400 })
    expect(cell('棚板', 'W')).toEqual({ kind: 'number', value: 379 })
    expect(cell('棚板', 'H')).toEqual({ kind: 'number', value: 1760 })
  })

  it('空の欄は空（エラーにしない）', () => {
    const p = newPart('x', { quantity: null, expr: { W: '', H: '700' } })
    expect(tableDimCell(p, undefined, 'W', adjusts)).toEqual({ kind: 'empty' })
  })
})

describe('全部回転してよい・削除の確認・木取りの表（U-12）', () => {
  it('全部回転してよい／一部／なし（部材が無ければなし）', () => {
    const job = shelfJob()
    expect(rotationState([])).toBe('none')
    expect(rotationState(job.parts)).toBe('none')
    expect(rotationState(job.parts.map((p, i) => ({ ...p, rotatable: i === 1 })))).toBe('some')
    expect(rotationState(job.parts.map((p) => ({ ...p, rotatable: true })))).toBe('all')
  })

  it('消す部材の寸法を、残る部材の式が使っているか（消す部材どうしは数えない）', () => {
    // 部材どうしの参照は第2.2版でなくした（U-27 のあとに消せる）。前の版の式の見本で確かめる
    const parts = legacyShelfJob().parts
    expect(referencingOthers(parts, ['part-tanaita'])).toEqual([])
    expect(referencingOthers(parts, ['part-tenita'])).toEqual([{ partId: 'part-tanaita', name: '棚板', axes: ['W', 'H'] }])
    expect(referencingOthers(parts, ['part-tenita', 'part-tanaita'])).toEqual([])
    expect(referencingOthers(parts, ['part-zentai']).map((r) => r.name)).toEqual(['天板', '側板'])
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
    expect(cutDimCell(tanaita, d, 'W', shelfAdjusts())).toEqual({ kind: 'number', value: 389 })
    expect(cutDimCell(job.parts[2], dims.parts[2], 'H', shelfAdjusts())).toEqual({ kind: 'number', value: 710 })
    expect(cutDimCell(newPart('x'), undefined, 'W', shelfAdjusts())).toEqual({ kind: 'empty' })
  })
})

describe('入力中のセルのエラー（仕様書 18.5）', () => {
  const err = (kind: DimensionError['kind'], extra: Partial<DimensionError> = {}): DimensionError => ({
    partId: 'p',
    axis: 'W',
    kind,
    message: kind,
    ...extra,
  })
  it('式の書き方のエラー（記号の抜け・途中で終わる・かっこ）と、打っている途中に出やすい 0 以下・0 で割る は出さない', () => {
    expect(errorsWhileEditing([err('syntax'), err('syntax', { incomplete: true }), err('nonPositive'), err('divideByZero')])).toEqual([])
  })
  it('存在しない部材・削除した調整寸法・循環参照・参照先のエラーは出す', () => {
    const shown = [err('unknownRef'), err('unknownAdjust'), err('cycle'), err('syntax', { from: { partId: 'q', axis: 'W' } })]
    expect(errorsWhileEditing(shown)).toEqual(shown)
  })
})
