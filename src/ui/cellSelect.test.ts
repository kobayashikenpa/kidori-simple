import { describe, expect, it } from 'vitest'
import type { PasteSkip } from '../engine/clipboard/cells'
import {
  clampRange,
  clipText,
  fillExtension,
  fillHint,
  fillTarget,
  fillText,
  fixedCorner,
  flagState,
  hasPartCell,
  isSingleAt,
  keepActive,
  pasteText,
  rangeHas,
  rangeText,
  singleRange,
  spanRange,
} from './cellSelect'

describe('選んでいる範囲（仕様書 17.1）', () => {
  it('2つのセルを角にした四角（どちらが左上でもよい）', () => {
    expect(spanRange({ row: 1, col: 1 }, { row: 2, col: 2 })).toEqual({ top: 1, left: 1, rows: 2, cols: 2 })
    expect(spanRange({ row: 2, col: 2 }, { row: 1, col: 1 })).toEqual({ top: 1, left: 1, rows: 2, cols: 2 })
    expect(spanRange({ row: 3, col: 0 }, { row: 3, col: 0 })).toEqual(singleRange({ row: 3, col: 0 }))
  })

  it('範囲の中か・1つのセルだけか', () => {
    const r = { top: 1, left: 1, rows: 2, cols: 2 }
    expect(rangeHas(r, { row: 2, col: 2 })).toBe(true)
    expect(rangeHas(r, { row: 3, col: 2 })).toBe(false)
    expect(rangeHas(r, { row: 1, col: 0 })).toBe(false)
    expect(isSingleAt(singleRange({ row: 1, col: 2 }), { row: 1, col: 2 })).toBe(true)
    expect(isSingleAt(r, { row: 1, col: 1 })).toBe(false)
    expect(isSingleAt(null, { row: 1, col: 1 })).toBe(false)
  })

  it('取っ手を引くときは反対の角が動かない', () => {
    const r = { top: 1, left: 1, rows: 2, cols: 2 }
    expect(fixedCorner(r, 'end')).toEqual({ row: 1, col: 1 })
    expect(fixedCorner(r, 'start')).toEqual({ row: 2, col: 2 })
    // 右下の取っ手を左上へ越えて引いても四角になる
    expect(spanRange(fixedCorner(r, 'end'), { row: 0, col: 0 })).toEqual({ top: 0, left: 0, rows: 2, cols: 2 })
  })

  it('起点は範囲の中ならそのまま、外に出たら動かない角', () => {
    const fixed = { row: 2, col: 2 }
    expect(keepActive({ row: 1, col: 1 }, { top: 1, left: 1, rows: 2, cols: 2 }, fixed)).toEqual({ row: 1, col: 1 })
    expect(keepActive({ row: 1, col: 1 }, { top: 2, left: 2, rows: 1, cols: 2 }, fixed)).toEqual(fixed)
  })

  it('表の行が減ったら範囲を収める', () => {
    expect(clampRange({ top: 8, left: 0, rows: 4, cols: 4 }, 10)).toEqual({ top: 8, left: 0, rows: 2, cols: 4 })
    expect(clampRange({ top: 10, left: 0, rows: 1, cols: 1 }, 10)).toBeNull()
  })
})

describe('セルの手伝い', () => {
  it('部材の行を選んでいるか', () => {
    expect(hasPartCell([{ row: 5, col: 'W' }], 3)).toBe(false)
    expect(hasPartCell([{ row: 5, col: 'W' }, { row: 2, col: 'H' }], 3)).toBe(true)
  })
})

describe('今コピーしているもの', () => {
  it('1つのセルは中身を短く、範囲は 行×列', () => {
    expect(clipText(null)).toBeNull()
    expect(clipText({ rows: 1, cols: 1, cells: [['400']] })).toBe('コピー中：1つ（400）')
    expect(clipText({ rows: 1, cols: 1, cells: [['']] })).toBe('コピー中：1つ（空）')
    expect(clipText({ rows: 1, cols: 1, cells: [['天板.W - メラミン1 * 2']] })).toBe('コピー中：1つ（天板.W - メラミ…）')
    expect(clipText({ rows: 2, cols: 2, cells: [['1', '2'], ['3', '4']] })).toBe('コピー中：2行×2列')
  })
  it('切り取りは「切り取り中」', () => {
    const cut = { jobId: 'j', range: { top: 0, left: 1, rows: 1, cols: 1 } }
    expect(clipText({ rows: 1, cols: 1, cells: [['400']], cut })).toBe('切り取り中：1つ（400）')
    expect(clipText({ rows: 2, cols: 1, cells: [['1'], ['2']], cut })).toBe('切り取り中：2行×1列')
  })
})

describe('貼り付けの知らせ', () => {
  const skip = (message: string): PasteSkip => ({ cell: { row: 0, col: 'name' }, reason: 'notQuantity', message })
  it('貼った数と、貼れなかった数・理由（同じ理由は1つにまとめる）', () => {
    expect(pasteText(3, [])).toBe('3個のセルに貼りました')
    expect(pasteText(1, [skip('枚数には 0 以上の整数だけ貼れます'), skip('枚数には 0 以上の整数だけ貼れます')])).toBe(
      '1個のセルに貼りました（貼れなかったもの 2個：枚数には 0 以上の整数だけ貼れます）',
    )
    expect(pasteText(0, [])).toBe('貼れるセルがありませんでした')
    expect(pasteText(0, [skip('枚数には 0 以上の整数だけ貼れます')])).toBe('貼れませんでした（貼れなかったもの 1個：枚数には 0 以上の整数だけ貼れます）')
  })
  it('名前に番号を振らないので、番号の一言は足さない（仕様書 26.3）', () => {
    expect(pasteText(2, [])).toBe('2個のセルに貼りました')
    expect(pasteText(1, [skip('W・H には 0 より大きい数だけ貼れます')])).toBe(
      '1個のセルに貼りました（貼れなかったもの 1個：W・H には 0 より大きい数だけ貼れます）',
    )
  })
})

describe('オートフィル（仕様書 17.4）', () => {
  const from = { top: 1, left: 1, rows: 2, cols: 2 }
  it('引いた先が下なら下へ、上なら上へ広げる（列は元のまま）。範囲の中なら null', () => {
    expect(fillTarget(from, { row: 5, col: 3 })).toEqual({ top: 1, left: 1, rows: 5, cols: 2 })
    expect(fillTarget(from, { row: 0, col: 0 })).toEqual({ top: 0, left: 1, rows: 3, cols: 2 })
    expect(fillTarget(from, { row: 2, col: 0 })).toBeNull()
  })
  it('新しく入れる所（点線）', () => {
    expect(fillExtension(from, { top: 1, left: 1, rows: 5, cols: 2 })).toEqual({ top: 3, left: 1, rows: 3, cols: 2 })
    expect(fillExtension(from, { top: 0, left: 1, rows: 3, cols: 2 })).toEqual({ top: 0, left: 1, rows: 1, cols: 2 })
    expect(fillExtension(from, from)).toBeNull()
  })
  it('引いている間、点線の中に出す文', () => {
    expect(fillHint(from, null)).toBeNull()
    expect(fillHint(from, from)).toBeNull()
    expect(fillHint(from, { top: 1, left: 1, rows: 5, cols: 2 })).toBe('下へ3行くり返す')
    expect(fillHint(from, { top: 0, left: 1, rows: 3, cols: 2 })).toBe('上へ1行くり返す')
  })
  it('入れたあとの知らせ', () => {
    const skip: PasteSkip = { cell: { row: 3, col: 'qty' }, reason: 'notQuantity', message: '枚数には 0 以上の整数だけ貼れます' }
    expect(fillText(4, [])).toBe('4個のセルに入れました')
    expect(fillText(4, [skip, skip])).toBe('4個のセルに入れました（入れられなかったもの 2個：枚数には 0 以上の整数だけ貼れます）')
    expect(fillText(0, [skip])).toBe('入れられませんでした（入れられなかったもの 1個：枚数には 0 以上の整数だけ貼れます）')
    expect(fillText(0, [])).toBe('入れるセルがありませんでした')
  })
})

describe('長押しのメニューの手伝い', () => {
  it('回転してよい・仕上がったの今の状態', () => {
    expect(flagState([true, true])).toBe('all')
    expect(flagState([true, false])).toBe('some')
    expect(flagState([false])).toBe('none')
    expect(flagState([])).toBe('none')
  })
  it('範囲の呼び方', () => {
    expect(rangeText({ top: 1, left: 0, rows: 3, cols: 2 })).toBe('3行×2列（2〜4行目）')
    expect(rangeText({ top: 0, left: 0, rows: 1, cols: 4 })).toBe('1行×4列（1行目）')
  })
})
