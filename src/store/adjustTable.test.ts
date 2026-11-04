// 調整寸法の表（第1.7版。仕様書 21.1・21.3）：保存データ・ファイル・store の操作
import { describe, expect, it } from 'vitest'
import { usableAdjusts } from '../engine/adjusts'
import { MELAMINE_ID, SHEET_ID, shelfAdjusts, legacyShelfJob as shelfJob } from '../engine/fixtures/shelf'
import { formulaText } from '../engine/formula/display'
import { backupFile } from '../engine/transfer/backup'
import { jobFile } from '../engine/transfer/share'
import type { AdjustRow, AppData } from '../engine/types'
import { validateAdjust } from './jobs'
import { initialState, reduce, type Env, type StoreAction, type StoreState } from './reducer'
import { parseAppData } from './storage'

const T0 = new Date(2026, 9, 25, 9, 0, 0)

function env(): Env {
  let n = 0
  return { newId: (prefix) => `${prefix}-${++n}`, now: T0 }
}

const draftRows = (): AdjustRow[] => [...shelfAdjusts(), { id: 'adjust-hozo', name: 'ほぞ', value: null }, { id: 'adjust-v', name: '', value: 12 }]

function data(adjusts: AdjustRow[] = shelfAdjusts()): AppData {
  return { version: 1, jobs: [shelfJob(), shelfJob('job-b', '別の棚')], adjusts, cellClip: null, adjustClip: null }
}

function start(adjusts?: AdjustRow[]): StoreState {
  return initialState({ status: 'ok', data: data(adjusts), currentJobId: 'job-shelf', canSave: true, numbering: { replaced: false, cleared: [] } })
}

function run(state: StoreState, action: StoreAction, e: Env = env()) {
  const r = reduce(state, action, e)
  if (!r.ok) throw new Error(r.message)
  return r
}

describe('保存データ', () => {
  it('第1.6版までの保存データ（adjustClip なし・調整寸法は全部そろった形）をそのまま読める', () => {
    const old = JSON.parse(JSON.stringify({ version: 1, jobs: [shelfJob()], adjusts: shelfAdjusts(), cellClip: null }))
    const d = parseAppData(old)
    expect(d?.adjusts).toEqual(shelfAdjusts())
    expect(d?.adjustClip).toBeNull()
  })

  it('書きかけの行（名前だけ・寸法だけ）とクリップを読み戻せる。名前も寸法も空の行は外す', () => {
    const saved = { ...data(draftRows()), adjustClip: { rows: 1, cols: 2, cells: [['ほぞ', '']], cut: { top: 2, left: 0, rows: 1, cols: 2 } } }
    const raw = JSON.parse(JSON.stringify({ ...saved, adjusts: [...saved.adjusts, { id: 'blank', name: ' ', value: null }] }))
    const d = parseAppData(raw)
    expect(d?.adjusts).toEqual(draftRows())
    expect(d?.adjustClip).toEqual(saved.adjustClip)
  })

  it('寸法が 0・文字の行、同じ id の行があれば読めない。クリップの形が違えば捨てる', () => {
    expect(parseAppData({ ...data(), adjusts: [{ id: 'a', name: 'x', value: 0 }] })).toBeNull()
    expect(parseAppData({ ...data(), adjusts: [{ id: 'a', name: 'x', value: '1' }] })).toBeNull()
    expect(parseAppData({ ...data(), adjusts: [{ id: 'a', name: 'x', value: 1 }, { id: 'a', name: 'y', value: 1 }] })).toBeNull()
    expect(parseAppData({ ...data(), adjustClip: { rows: 1, cols: 3, cells: [['a', 'b', 'c']] } })?.adjustClip).toBeNull()
    expect(parseAppData({ ...data(), adjustClip: { rows: 1, cols: 1, cells: [['1']], cut: { top: 0, left: 1, rows: 1, cols: 2 } } })?.adjustClip).toEqual({
      rows: 1,
      cols: 1,
      cells: [['1']],
    })
  })
})

describe('ファイル（共有・バックアップ・取り込み）', () => {
  it('共有・バックアップには書きかけの行を入れない（前の版でも読める形）', () => {
    const job = shelfJob()
    job.parts[2].expr.H = '700 - {n:adjust-hozo}'
    expect(jobFile(job, draftRows()).adjusts.map((a) => a.id)).toEqual([MELAMINE_ID])
    expect(backupFile(data(draftRows())).adjusts.map((a) => a.id)).toEqual([MELAMINE_ID, SHEET_ID])
  })

  it('今までの「追加」は書きかけの行と重ならない', () => {
    expect(validateAdjust(draftRows(), { name: 'ほぞ', value: 12 })).toBeNull()
    expect(validateAdjust(draftRows(), { name: 'メラミン', value: 1 })).toBe('「メラミン1」はもうあります')
  })
})

describe('store：調整寸法の表の操作', () => {
  it('セルに入力：表の下に名前を入れると行が増え、寸法を入れると式で使える', () => {
    let r = run(start(), { type: 'setAdjustCell', pos: { row: 2, col: 'name' }, text: 'ほぞ' })
    expect(r.id).toBe('adjust-1')
    r = run(r.state, { type: 'setAdjustCell', pos: { row: 2, col: 'value' }, text: '15' })
    expect(r.state.data.adjusts[2]).toEqual({ id: 'adjust-1', name: 'ほぞ', value: 15 })
    expect(r.state.data.jobs.map((j) => j.updatedAt)).toEqual(start().data.jobs.map((j) => j.updatedAt))
  })

  it('セルに入力：表示名が同じなら断る', () => {
    const s = run(start(), { type: 'setAdjustCell', pos: { row: 2, col: 'name' }, text: 'メラミン' }).state
    const r = reduce(s, { type: 'setAdjustCell', pos: { row: 2, col: 'value' }, text: '1' }, env())
    expect(r).toEqual({ ok: false, message: '「メラミン1」はもうあります' })
  })

  it('コピーは adjustClip に（部材の表の cellClip は変えない）。貼ると番号を振る', () => {
    let s = run(start(), { type: 'copyAdjustCells', range: { top: 0, left: 0, rows: 1, cols: 2 } }).state
    expect(s.data.adjustClip).toEqual({ rows: 1, cols: 2, cells: [['メラミン', '1']] })
    expect(s.data.cellClip).toBeNull()
    const r = run(s, { type: 'pasteAdjustCells', range: { top: 2, left: 0, rows: 1, cols: 1 } })
    s = r.state
    expect(s.data.adjusts.map((a) => a.name)).toEqual(['メラミン', 'シート', 'メラミン②'])
    expect(r.adjustPaste?.renamed).toEqual([{ cell: { row: 2, col: 'name' }, from: 'メラミン', to: 'メラミン②' }])
  })

  it('コピーしていなければ貼れない', () => {
    expect(reduce(start(), { type: 'pasteAdjustCells', cells: [{ row: 0, col: 'name' }] }, env())).toEqual({
      ok: false,
      message: 'コピーしたセルがありません',
    })
  })

  it('切り取って貼ると元が空になり、クリップはふつうのコピーになる。行ごと動かすと id がついていく', () => {
    let s = run(start(), { type: 'cutAdjustCells', range: { top: 0, left: 0, rows: 1, cols: 2 } }).state
    expect(s.data.adjustClip?.cut).toEqual({ top: 0, left: 0, rows: 1, cols: 2 })
    s = run(s, { type: 'pasteAdjustCells', range: { top: 2, left: 0, rows: 1, cols: 1 } }).state
    expect(s.data.adjusts.map((a) => a.id)).toEqual([SHEET_ID, MELAMINE_ID])
    expect(s.data.adjustClip?.cut).toBeUndefined()
    const job = s.data.jobs[0]
    expect(formulaText(job.parts[3].expr.W, usableAdjusts(s.data.adjusts))).toBe('天板.W − 20 − メラミン1')
  })

  it('オートフィル・クリア・行を上に挿入・行を削除', () => {
    let s = start()
    let r = run(s, { type: 'fillAdjustCells', from: { top: 1, left: 0, rows: 1, cols: 2 }, to: { top: 1, left: 0, rows: 3, cols: 2 } })
    expect(r.state.data.adjusts.map((a) => a.name)).toEqual(['メラミン', 'シート', 'シート②', 'シート③'])
    expect(r.adjustPaste?.pasted).toBe(4)
    s = r.state
    s = run(s, { type: 'clearAdjustCells', range: { top: 2, left: 1, rows: 2, cols: 1 } }).state
    expect(s.data.adjusts.slice(2).map((a) => a.value)).toEqual([null, null])
    r = run(s, { type: 'insertAdjustRow', index: 1 })
    expect(r.state.data.adjusts[1]).toEqual({ id: r.id, name: '', value: null })
    s = run(r.state, { type: 'deleteAdjustRows', range: { top: 1, left: 0, rows: 4, cols: 1 } }).state
    expect(s.data.adjusts.map((a) => a.id)).toEqual([MELAMINE_ID])
    expect(reduce(s, { type: 'deleteAdjustRows', range: { top: 3, left: 0, rows: 1, cols: 1 } }, env())).toEqual({
      ok: false,
      message: '削除する行を選んでください',
    })
  })

})
