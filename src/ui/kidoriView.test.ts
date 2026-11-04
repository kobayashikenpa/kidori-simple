import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../engine/dimensions'
import { withHistory } from '../engine/fixtures/history'
import { shelfJob } from '../engine/fixtures/shelf'
import { packJob } from '../engine/packing'
import type { CutMode, Job } from '../engine/types'
import { finalCutLabel, historyMeta, historyTitle, pct, pieceColorClass, PIECE_COLORS, scrapLabel } from './kidoriView'

describe('木取りの画面の文字', () => {
  it('歩留まりは小数第1位までの %', () => {
    expect(pct(0.81234)).toBe('81.2%')
    expect(pct(1)).toBe('100%')
    expect(pct(0)).toBe('0%')
  })
  it('端材は W（妻手方向）×H（長手方向）。横長の配置図は入れ替える', () => {
    expect(scrapLabel({ w: 400, h: 1200 }, 'portrait')).toBe('400×1200')
    expect(scrapLabel({ w: 1200, h: 400 }, 'landscape')).toBe('400×1200')
  })
})

describe('部材の色（仕様書 25.2）', () => {
  it('12色。13 種類目からはくり返す', () => {
    expect(PIECE_COLORS).toBe(12)
    expect(pieceColorClass(0)).toBe('pc0')
    expect(pieceColorClass(5)).toBe('pc5')
    expect(pieceColorClass(6)).toBe('pc6')
    expect(pieceColorClass(11)).toBe('pc11')
    expect(pieceColorClass(12)).toBe('pc0')
    expect(pieceColorClass(25)).toBe('pc1')
  })
  it('部材が見つからない（-1）などは pc0', () => {
    expect(pieceColorClass(-1)).toBe('pc0')
    expect(pieceColorClass(Number.NaN)).toBe('pc0')
  })
})

describe('最終縦カット（仕様書 25.3）', () => {
  const sheets = (mode: CutMode) => {
    const job: Job = shelfJob()
    job.settings.cutMode = mode
    return packJob(job, computeDimensions(job)).sheets
  }
  it('見本・縦切り優先：1枚目は左に余りが無いので出さない、2枚目は「最終縦カット 右から 786mm」', () => {
    expect(sheets('vertical').map(finalCutLabel)).toEqual([null, '最終縦カット 右から 786mm'])
  })
  it('見本・横切り優先は「最終横カット」', () => {
    expect(sheets('horizontal').map(finalCutLabel)).toEqual(['最終横カット 右から 1815mm', '最終横カット 右から 1775mm'])
  })
})

describe('履歴の1行（仕様書 25.1）', () => {
  const now = new Date(2026, 10, 4, 9, 5)
  it('メモがあればメモ、空なら「メモなし」', () => {
    expect(historyTitle({ memo: '扉を広げる前' })).toBe('扉を広げる前')
    expect(historyTitle({ memo: '' })).toBe('メモなし')
  })
  it('日時・板のサイズと必要な枚数・歩留まり・部材の数', () => {
    const job = withHistory(shelfJob(), 'h1', '', now)
    const e = job.history[0]
    expect(historyMeta(e)).toBe(`2026/11/4 09:05・4×8 ${e.sheetCount}枚・歩留まり ${pct(e.yieldRate)}・部材 4件`)
    expect(e.sheetCount).toBe(2)
  })
  it('板が0枚のときの歩留まりは「―」', () => {
    const job = withHistory({ ...shelfJob(), parts: [] }, 'h1', '', now)
    expect(historyMeta(job.history[0])).toBe('2026/11/4 09:05・4×8 0枚・歩留まり ―・部材 0件')
  })
})
