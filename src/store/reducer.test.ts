import { describe, expect, it } from 'vitest'
import { computeDimensions } from '../engine/dimensions'
import { legacyShelfJob, shelfAdjusts, shelfJob } from '../engine/fixtures/shelf'
import { packJob } from '../engine/packing'
import { importTransfer } from '../engine/transfer/importFile'
import { readTransferFile } from '../engine/transfer/read'
import { buildJobFile } from '../engine/transfer/share'
import { currentJob, initialState, reduce, type Env, type StoreAction, type StoreState } from './reducer'

const T0 = new Date(2026, 9, 21, 9, 0, 0)
const T1 = new Date(2026, 9, 21, 10, 0, 0)

function env(now = T0): Env {
  let n = 0
  return { newId: (prefix) => `${prefix}-${++n}`, now }
}

function start(): StoreState {
  return initialState({
    status: 'ok',
    data: { version: 1, jobs: [shelfJob()], cellClip: null },
    currentJobId: 'job-shelf',
    canSave: true,
    numbering: { replaced: false, cleared: [] },
  })
}

function run(state: StoreState, action: StoreAction, e: Env = env()) {
  const r = reduce(state, action, e)
  if (!r.ok) throw new Error(r.message)
  return r
}

describe('仕事の操作', () => {
  it('作る：名前が無ければ日付だけの「10/21」、開く、作った id を返す', () => {
    const r = run(start(), { type: 'createJob' })
    const job = currentJob(r.state)
    expect(job?.name).toBe('10/21')
    expect(r.id).toBe(job?.id)
    expect(r.state.data.jobs).toHaveLength(2)
  })

  it('開く・閉じる。無い仕事は開けない', () => {
    let s = run(start(), { type: 'openJob', id: null }).state
    expect(currentJob(s)).toBeNull()
    s = run(s, { type: 'openJob', id: 'job-shelf' }).state
    expect(currentJob(s)?.id).toBe('job-shelf')
    expect(reduce(s, { type: 'openJob', id: 'nope' }, env()).ok).toBe(false)
  })

  it('名前を変えると updatedAt が付く', () => {
    const s = run(start(), { type: 'renameJob', jobId: 'job-shelf', name: '本棚' }, env(T1)).state
    expect(s.data.jobs[0]).toMatchObject({ name: '本棚', updatedAt: T1.toISOString() })
  })

  it('コピー：設定を引き継ぎ、開いている仕事は変えない', () => {
    let s = run(start(), { type: 'updateSettings', patch: { allowance: 5 } }).state
    const r = run(s, { type: 'copyJob', jobId: 'job-shelf' })
    s = r.state
    expect(s.data.jobs).toHaveLength(2)
    const c = s.data.jobs[1]
    expect(c.id).toBe(r.id)
    expect(c.name).toBe('棚のコピー')
    expect(c.settings.allowance).toBe(5)
    expect(s.currentJobId).toBe('job-shelf')
  })

  it('削除：開いていた仕事なら閉じる', () => {
    const s = run(start(), { type: 'deleteJob', jobId: 'job-shelf' }).state
    expect(s.data.jobs).toEqual([])
    expect(s.currentJobId).toBeNull()
  })

  it('見本を足す：「見本 棚」を一覧の最後に足し、開いている仕事は変えない（仕様書 16.7）', () => {
    const s0 = start()
    const r = run(s0, { type: 'addSample' })
    expect(r.state.currentJobId).toBe('job-shelf')
    expect(r.state.data.jobs).toHaveLength(2)
    const sample = r.state.data.jobs[1]
    expect(r.id).toBe(sample.id)
    expect(sample.name).toBe('見本 棚')
    expect(sample.parts.map((p) => [p.name, p.expr.W, p.expr.H])).toEqual([
      ['天板', '400', '1800'],
      ['側板', '400', '700'],
      ['棚板', '379', '1760'],
    ])
    const p = packJob(sample, computeDimensions(sample))
    expect(p.sheets).toHaveLength(2)
    expect(Math.round(p.yieldRate * 1000) / 10).toBe(57.2)
  })

  it('何回押しても1つずつ足す', () => {
    const s = run(start(), { type: 'addSample' }).state
    const r = run(s, { type: 'addSample' }, { newId: (p) => `${p}-x${Math.random()}`, now: T0 })
    expect(r.state.data.jobs.map((j) => j.name)).toEqual(['棚', '見本 棚', '見本 棚'])
  })
})

describe('部材の操作（開いている仕事）', () => {
  it('足す・変える・消す。変えるたびに updatedAt', () => {
    let r = run(start(), { type: 'addPart', part: { name: '地板', expr: { W: '400', H: '300' } } }, env(T1))
    let job = currentJob(r.state)!
    expect(job.parts.at(-1)).toMatchObject({ id: r.id, name: '地板', quantity: 1, rotatable: false })
    expect(job.updatedAt).toBe(T1.toISOString())
    r = run(r.state, { type: 'updatePart', partId: r.id!, patch: { quantity: 2 } })
    job = currentJob(r.state)!
    expect(job.parts.at(-1)?.quantity).toBe(2)
    r = run(r.state, { type: 'removePart', partId: job.parts.at(-1)!.id })
    expect(currentJob(r.state)!.parts).toHaveLength(4)
  })

  it('同じ名前の部材も足せる（第2.2版。仕様書 26.3）', () => {
    const r = run(start(), { type: 'addPart', part: { name: '天板', expr: { W: '400', H: '1800' } } })
    expect(currentJob(r.state)!.parts.filter((p) => p.name === '天板')).toHaveLength(2)
  })

  it('名前を変えても、ほかの部材の寸法は変わらない（式の書き換えはない）', () => {
    const s0 = start()
    const s = run(s0, { type: 'updatePart', partId: 'part-tenita', patch: { name: '天板A' } }).state
    expect(currentJob(s)!.parts.map((p) => p.expr)).toEqual(currentJob(s0)!.parts.map((p) => p.expr))
  })

  it('複製は元の後ろに「棚板のコピー」', () => {
    const r = run(start(), { type: 'duplicatePart', partId: 'part-tanaita' })
    const job = currentJob(r.state)!
    expect(job.parts.at(-1)).toMatchObject({ id: r.id, name: '棚板のコピー' })
  })

  it('上に行を入れる・行を削除・全部回転', () => {
    let r = run(start(), { type: 'insertPart', index: 2, part: { name: '', quantity: null } })
    let job = currentJob(r.state)!
    expect(job.parts[2]).toMatchObject({ id: r.id, name: '', quantity: null })
    r = run(r.state, { type: 'deleteRows', cells: [{ row: 2, col: 'W' }, { row: 0, col: 'qty' }] })
    job = currentJob(r.state)!
    expect(job.parts.map((p) => p.name)).toEqual(['天板', '側板', '棚板'])
    expect(reduce(r.state, { type: 'deleteRows', cells: [{ row: 8, col: 'W' }] }, env())).toEqual({ ok: false, message: '削除する行を選んでください' })
    r = run(r.state, { type: 'setAllRotatable', rotatable: true })
    expect(currentJob(r.state)!.parts.every((p) => p.rotatable)).toBe(true)
  })

  it('仕事を開いていなければ断る', () => {
    const s = run(start(), { type: 'openJob', id: null }).state
    expect(reduce(s, { type: 'addPart', part: { name: 'a' } }, env())).toEqual({ ok: false, message: '仕事が開かれていません' })
  })

  it('設定と板のサイズを変える', () => {
    let s = run(start(), { type: 'updateSettings', patch: { kerf: 4, cutMode: 'horizontal' } }).state
    s = run(s, { type: 'setSheet', sheet: { sizeKind: 'saburoku', width: 0, length: 0 } }).state
    expect(currentJob(s)!.settings).toMatchObject({ kerf: 4, cutMode: 'horizontal', sheet: { width: 910, length: 1820 } })
    expect(reduce(s, { type: 'updateSettings', patch: { kerf: -1 } }, env()).ok).toBe(false)
  })
})

describe('セルのコピーと貼り付け（第1.2版）', () => {
  it('セルをコピーするとアプリが覚え（仕事は変えない）、ほかの仕事の選んだセルに貼れる。行が足りなければ部材が増える', () => {
    const s0 = start()
    let r = run(s0, { type: 'copyCells', cells: [{ row: 1, col: 'name' }, { row: 1, col: 'W' }, { row: 2, col: 'name' }, { row: 2, col: 'W' }] })
    expect(r.state.data.cellClip).toEqual({ rows: 2, cols: 2, cells: [['天板', '400'], ['側板', '400']] })
    expect(r.state.data.jobs).toBe(s0.data.jobs)
    r = run(r.state, { type: 'createJob', name: '別' })
    r = run(r.state, { type: 'addPart', part: { name: '天板', expr: { W: '1', H: '1' }, quantity: 1 } })
    r = run(r.state, { type: 'pasteCells', cells: [{ row: 0, col: 'name' }] }, env(T1))
    expect(currentJob(r.state)!.parts.map((p) => [p.name, p.expr.W])).toEqual([
      ['天板', '400'],
      ['側板', '400'],
    ])
    expect(r.paste).toEqual({ pasted: 4, skipped: [] })
    expect(currentJob(r.state)!.updatedAt).toBe(T1.toISOString())
  })

  it('貼れなかったセルが結果に返る（枚数に名前・W・H に名前）', () => {
    let s = run(start(), { type: 'copyCells', cells: [{ row: 1, col: 'name' }] }).state
    const r = run(s, { type: 'pasteCells', cells: [{ row: 0, col: 'qty' }, { row: 2, col: 'H' }, { row: 3, col: 'name' }] })
    s = r.state
    expect(r.paste?.pasted).toBe(1)
    expect(r.paste?.skipped.map((x) => [x.cell, x.reason])).toEqual([
      [{ row: 0, col: 'qty' }, 'notQuantity'],
      [{ row: 2, col: 'H' }, 'notSize'],
    ])
    expect(currentJob(s)!.parts[2].expr.H).toBe('700')
  })

  it('離れたセルはコピーできない。コピーが無ければ貼れない', () => {
    expect(reduce(start(), { type: 'copyCells', cells: [{ row: 0, col: 'W' }, { row: 2, col: 'W' }] }, env())).toEqual({
      ok: false,
      message: 'コピーは1つのセルか、四角い範囲を選んでください',
    })
    expect(reduce(start(), { type: 'pasteCells', cells: [{ row: 0, col: 'W' }] }, env())).toEqual({ ok: false, message: 'コピーしたセルがありません' })
  })

  it('消す：中身を空に。全部空になった部材は消える', () => {
    const r = run(start(), { type: 'clearCells', cells: [{ row: 0, col: 'name' }, { row: 0, col: 'W' }, { row: 0, col: 'H' }, { row: 0, col: 'qty' }, { row: 1, col: 'H' }] })
    expect(currentJob(r.state)!.parts.map((p) => [p.name, p.expr.H])).toEqual([
      ['天板', ''],
      ['側板', '700'],
      ['棚板', '1760'],
    ])
  })
})


describe('切り取り・オートフィル・四角の範囲（第1.3版）', () => {
  const W = (s: StoreState) => currentJob(s)!.parts.map((p) => p.expr.W)

  it('切り取って貼ると元が空になり、クリップはふつうのコピーに変わる（2回目の貼り付けで元を消さない）', () => {
    let r = run(start(), { type: 'cutCells', range: { top: 1, left: 1, rows: 1, cols: 1 } })
    expect(r.state.data.cellClip).toEqual({ rows: 1, cols: 1, cells: [['400']], cut: { jobId: 'job-shelf', range: { top: 1, left: 1, rows: 1, cols: 1 } } })
    expect(W(r.state)[1]).toBe('400') // 切り取っただけでは変えない
    r = run(r.state, { type: 'pasteCells', range: { top: 0, left: 1, rows: 1, cols: 1 } }, env(T1))
    expect(W(r.state).slice(0, 2)).toEqual(['400', ''])
    expect(r.paste).toEqual({ pasted: 1, skipped: [] })
    expect(r.state.data.cellClip).toEqual({ rows: 1, cols: 1, cells: [['400']] })
    // 2回目：元（天板の W）に入れ直しても、もう消さない
    r = run(r.state, { type: 'updatePart', partId: 'part-tenita', patch: { expr: { W: '400', H: '1800' } } })
    r = run(r.state, { type: 'pasteCells', cells: [{ row: 3, col: 'W' }] })
    expect(W(r.state)).toEqual(['400', '400', '400', '400'])
  })

  it('貼る前にほかをコピーすると、元は消さない', () => {
    let s = run(start(), { type: 'cutCells', range: { top: 2, left: 2, rows: 1, cols: 1 } }).state
    s = run(s, { type: 'copyCells', range: { top: 0, left: 1, rows: 1, cols: 1 } }).state
    s = run(s, { type: 'pasteCells', range: { top: 3, left: 2, rows: 1, cols: 1 } }).state
    expect(currentJob(s)!.parts.map((p) => p.expr.H)).toEqual(['1800', '1800', '700', '400'])
  })

  it('ほかの仕事に貼っても、元の仕事のセルを空にする（元の仕事の updatedAt も付く）', () => {
    let s = run(start(), { type: 'cutCells', range: { top: 3, left: 0, rows: 1, cols: 4 } }).state
    s = run(s, { type: 'createJob', name: '別' }).state
    const r = run(s, { type: 'pasteCells', range: { top: 0, left: 0, rows: 1, cols: 1 } }, env(T1))
    expect(currentJob(r.state)!.parts.map((p) => p.name)).toEqual(['棚板'])
    const src = r.state.data.jobs.find((j) => j.id === 'job-shelf')!
    expect(src.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板'])
    expect(src.updatedAt).toBe(T1.toISOString())
    expect(r.state.data.cellClip?.cut).toBeUndefined()
  })

  it('切り取った元の仕事が消えていても、貼れる（元は何もしない）', () => {
    let s = run(start(), { type: 'cutCells', range: { top: 1, left: 1, rows: 1, cols: 1 } }).state
    s = run(s, { type: 'createJob', name: '別' }).state
    s = run(s, { type: 'deleteJob', jobId: 'job-shelf' }).state
    const r = run(s, { type: 'pasteCells', range: { top: 0, left: 1, rows: 1, cols: 1 } })
    expect(W(r.state)).toEqual(['400'])
    expect(r.state.data.cellClip?.cut).toBeUndefined()
  })

  it('オートフィル：2行の範囲を下に5行引くと くり返して入る。名前も同じ名前のまま入る（第2.2版。仕様書 26.3）', () => {
    const r = run(start(), { type: 'fillCells', from: { top: 0, left: 0, rows: 2, cols: 2 }, to: { top: 0, left: 0, rows: 7, cols: 2 } }, env(T1))
    expect(currentJob(r.state)!.parts.map((p) => [p.name, p.expr.W])).toEqual([
      ['全体', '400'],
      ['天板', '400'],
      ['全体', '400'],
      ['天板', '400'],
      ['全体', '400'],
      ['天板', '400'],
      ['全体', '400'],
    ])
    expect(r.paste?.pasted).toBe(10)
    expect(r.paste?.skipped).toEqual([])
    expect(currentJob(r.state)!.updatedAt).toBe(T1.toISOString())
  })

  it('クリア・行を削除も四角の範囲で呼べる', () => {
    let s = run(start(), { type: 'clearCells', range: { top: 0, left: 3, rows: 4, cols: 1 } }).state
    expect(currentJob(s)!.parts.map((p) => p.quantity)).toEqual([null, null, null, null])
    s = run(s, { type: 'deleteRows', range: { top: 1, left: 0, rows: 2, cols: 4 } }).state
    expect(currentJob(s)!.parts.map((p) => p.name)).toEqual(['全体', '棚板'])
  })
})
describe('切り出しチェック', () => {
  it('1つ目のチェックでその1枚を固定する', () => {
    const s = start()
    const job = currentJob(s)!
    const res = packJob(job, computeDimensions(job))
    const layout = res.sheets[0]
    const r = run(s, { type: 'setPartCheck', target: { kind: 'computed', mode: res.mode, layout }, partId: 'part-gawaita', done: true }, env(T1))
    const after = currentJob(r.state)!
    expect(after.frozenSheets).toHaveLength(1)
    expect(after.frozenSheets[0].checked.length).toBe(layout.placements.filter((p) => p.partId === 'part-gawaita').length)
    expect(after.updatedAt).toBe(T1.toISOString())
  })
})

describe('仕事ごとの履歴（第2.1版。仕様書 25.1）', () => {
  /** 開いている仕事の側板の1枚目を固定した状態 */
  function frozen(s: StoreState): StoreState {
    const job = currentJob(s)!
    const res = packJob(job, computeDimensions(job))
    return run(s, { type: 'setPartCheck', target: { kind: 'computed', mode: res.mode, layout: res.sheets[0] }, partId: 'part-gawaita', done: true }).state
  }

  it('残す：今の設定・部材・必要な枚数・歩留まり（今の調整寸法で計算）とメモを先頭に足し、作った id を返す。updatedAt が付く', () => {
    const r = run(start(), { type: 'addHistory', memo: ' 初めの案 ' }, env(T1))
    const job = currentJob(r.state)!
    expect(job.history).toHaveLength(1)
    const h = job.history[0]
    expect(r.id).toBe(h.id)
    expect(h.id).toBe('history-1')
    expect([h.memo, h.savedAt, h.sheetCount]).toEqual(['初めの案', T1.toISOString(), 2])
    expect(Math.round(h.yieldRate * 1000) / 10).toBe(57.2)
    expect(h.settings).toEqual(job.settings)
    expect(h.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板', '棚板'])
    expect(job.updatedAt).toBe(T1.toISOString())
  })

  it('jobId を渡せば開いていない仕事にも残せる。仕事を開いていなければ断る', () => {
    let s = run(start(), { type: 'openJob', id: null }).state
    expect(reduce(s, { type: 'addHistory', memo: '' }, env()).ok).toBe(false)
    s = run(s, { type: 'addHistory', memo: 'a', jobId: 'job-shelf' }).state
    expect(s.data.jobs[0].history).toHaveLength(1)
  })

  it('21件目で一番古いものが消える', () => {
    let s = start()
    let n = 0
    const e: Env = { newId: (p) => `${p}-${++n}`, now: T0 }
    for (let i = 1; i <= 21; i++) s = run(s, { type: 'addHistory', memo: `案${i}` }, e).state
    const h = currentJob(s)!.history
    expect(h).toHaveLength(20)
    expect([h[0].memo, h[19].memo]).toEqual(['案21', '案2'])
  })

  it('この内容に戻す：設定と部材を置き換え、切り出しチェックと固定した1枚を外す。履歴は消さない', () => {
    let s = run(start(), { type: 'addHistory', memo: '初めの案' }).state
    const id = currentJob(s)!.history[0].id
    s = run(s, { type: 'updateSettings', patch: { kerf: 5, cutMode: 'horizontal' } }).state
    s = run(s, { type: 'setSheet', sheet: { sizeKind: 'saburoku', width: 0, length: 0 } }).state
    s = run(s, { type: 'removePart', partId: 'part-tanaita' }).state
    s = frozen(s)
    expect(currentJob(s)!.frozenSheets).toHaveLength(1)
    const before = currentJob(s)!
    const r = run(s, { type: 'restoreHistory', historyId: id }, env(T1))
    const job = currentJob(r.state)!
    expect(job.settings).toEqual(shelfJob().settings)
    expect(job.parts.map((p) => [p.name, p.expr, p.quantity])).toEqual(shelfJob().parts.map((p) => [p.name, p.expr, p.quantity]))
    expect(job.frozenSheets).toEqual([])
    expect(job.history).toEqual(before.history)
    expect(job.updatedAt).toBe(T1.toISOString())
    // 戻した部材の id は新しい（今の部材の id とも重ならない）
    expect(job.parts.some((p) => before.parts.some((q) => q.id === p.id))).toBe(false)
    expect(new Set(job.parts.map((p) => p.id)).size).toBe(4)
    // 戻した内容で計算すると残したときと同じ枚数・歩留まり
    const res = packJob(job, computeDimensions(job))
    expect([res.sheetCount, res.yieldRate]).toEqual([job.history[0].sheetCount, job.history[0].yieldRate])
  })

  it('メモを直す・削除。無い履歴は断る', () => {
    let s = run(start(), { type: 'addHistory', memo: 'A' }).state
    s = run(s, { type: 'addHistory', memo: 'B' }, { newId: () => 'history-b', now: T0 }).state
    const [b, a] = currentJob(s)!.history
    s = run(s, { type: 'setHistoryMemo', historyId: a.id, memo: ' 天板を厚く ' }, env(T1)).state
    expect(currentJob(s)!.history.map((h) => h.memo)).toEqual(['B', '天板を厚く'])
    expect(currentJob(s)!.updatedAt).toBe(T1.toISOString())
    s = run(s, { type: 'removeHistory', historyId: b.id }).state
    expect(currentJob(s)!.history.map((h) => h.id)).toEqual([a.id])
    expect(reduce(s, { type: 'removeHistory', historyId: 'nope' }, env()).ok).toBe(false)
    expect(reduce(s, { type: 'restoreHistory', historyId: 'nope' }, env()).ok).toBe(false)
    expect(reduce(s, { type: 'setHistoryMemo', historyId: 'nope', memo: '' }, env()).ok).toBe(false)
  })

  it('同じメモに直しても updatedAt は付けない', () => {
    const s = run(start(), { type: 'addHistory', memo: 'A' }, env(T0)).state
    const id = currentJob(s)!.history[0].id
    const after = run(s, { type: 'setHistoryMemo', historyId: id, memo: 'A' }, env(T1)).state
    expect(after).toBe(s)
  })

  it('仕事のコピーで履歴もコピーする', () => {
    let s = run(start(), { type: 'addHistory', memo: '初めの案' }).state
    s = run(s, { type: 'copyJob', jobId: 'job-shelf' }).state
    expect(s.data.jobs[1].history).toEqual(s.data.jobs[0].history)
  })
})

describe('読み込みの知らせ', () => {
  it('閉じられる', () => {
    const s = initialState({
      status: 'error',
      data: { version: 1, jobs: [], cellClip: null },
      currentJobId: null,
      message: '保存データを読めませんでした',
      canSave: false,
      numbering: { replaced: false, cleared: [] },
    })
    expect(s.loadError).toBe('保存データを読めませんでした')
    expect(run(s, { type: 'dismissLoadError' }).state.loadError).toBeNull()
  })
})

describe('式を数字に置き換えた知らせ（第2.2版。仕様書 26.4）', () => {
  const report = { replaced: true, cleared: [{ jobId: 'job-shelf', jobName: '棚', partName: '扉', axis: 'W' as const }] }

  it('開いたときに置き換えたら、知らせの状態を持つ。閉じたらもう出さない（1度だけ）', () => {
    const s = initialState({ status: 'ok', data: start().data, currentJobId: null, canSave: true, numbering: report })
    expect(s.numbering).toEqual(report)
    const closed = run(s, { type: 'dismissNumbering' }).state
    expect(closed.numbering).toEqual({ replaced: false, cleared: [] })
    // もう一度閉じても何も変えない
    expect(run(closed, { type: 'dismissNumbering' }).state).toBe(closed)
  })

  it('前の版のファイルを取り込んだら、取り込みの結果の numbering を知らせに足す', () => {
    const s0 = start()
    const file = { app: 'kidori-simple' as const, kind: 'job' as const, version: 1 as const, job: legacyShelfJob(), adjusts: shelfAdjusts() }
    const imported = importTransfer(s0.data, file, env().newId, T1)
    expect(imported.numbering.replaced).toBe(true)
    let s = run(s0, { type: 'replaceData', data: imported.data, numbering: imported.numbering }).state
    expect(s.numbering).toEqual({ replaced: true, cleared: [] })
    expect(currentJob({ ...s, currentJobId: s.data.jobs[1].id })?.parts[3].expr).toEqual({ W: '379', H: '1760' })
    // まだ閉じていない知らせがあれば、つなげる
    s = { ...s, numbering: report }
    const more = { replaced: true, cleared: [{ jobId: 'j2', jobName: '台', partName: '脚', axis: 'H' as const }] }
    expect(run(s, { type: 'replaceData', data: s.data, numbering: more }).state.numbering.cleared).toEqual([...report.cleared, ...more.cleared])
  })

  it('numbering を渡さない置き換えは知らせを変えない', () => {
    const s0 = { ...start(), numbering: report }
    expect(run(s0, { type: 'replaceData', data: s0.data }).state.numbering).toBe(report)
  })
})

describe('取り込んだデータに置き換える', () => {
  it('共有のファイルを取り込むと、仕事がコピーとして足され、開いている仕事・今の仕事は変わらない', () => {
    const s0 = start()
    const read = readTransferFile(buildJobFile(currentJob(s0)!))
    if (!read.ok) throw new Error(read.message)
    const imported = importTransfer(s0.data, read.file, env().newId, T1)
    const s = run(s0, { type: 'replaceData', data: imported.data }).state
    expect(s.data.jobs).toHaveLength(2)
    expect(s.currentJobId).toBe('job-shelf')
    expect(s.data.jobs[0]).toBe(s0.data.jobs[0])
    const copy = s.data.jobs[1]
    expect(copy.name).toBe(`${s0.data.jobs[0].name}のコピー`)
    expect(computeDimensions(copy).parts.map((p) => p.finished)).toEqual(
      computeDimensions(s0.data.jobs[0]).parts.map((p) => p.finished),
    )
  })

  it('開いている仕事が新しいデータに無ければ閉じる', () => {
    const s = run(start(), { type: 'replaceData', data: { version: 1, jobs: [], cellClip: null } }).state
    expect(s.currentJobId).toBeNull()
  })
})

describe('並べ替えと行の移動（第2.0版。仕様書 24）', () => {
  const order = (s: StoreState) => currentJob(s)?.parts.map((p) => p.id)

  it('W の大きい順・小さい順で保存し、updatedAt を付ける（W は仕上がり寸法）', () => {
    let s = run(start(), { type: 'sortParts', key: 'W', order: 'asc' }, env(T1)).state
    expect(order(s)).toEqual(['part-tanaita', 'part-zentai', 'part-tenita', 'part-gawaita'])
    expect(currentJob(s)?.updatedAt).toBe(T1.toISOString())
    s = run(s, { type: 'sortParts', key: 'H', order: 'desc' }).state
    expect(order(s)).toEqual(['part-zentai', 'part-tenita', 'part-tanaita', 'part-gawaita'])
  })

  it('並びが変わらなければ updatedAt は付けない', () => {
    const s0 = start()
    const s = run(s0, { type: 'sortParts', key: 'qty', order: 'asc' }, env(T1)).state
    expect(s).toBe(s0)
  })

  it('並べ替えても寸法は変わらない（式の参照は名前なので）', () => {
    const s0 = start()
    const s = run(s0, { type: 'sortParts', key: 'name', order: 'desc' }).state
    const before = computeDimensions(currentJob(s0)!)
    const after = computeDimensions(currentJob(s)!)
    for (const d of before.parts) expect(after.parts.find((x) => x.partId === d.partId)?.finished).toEqual(d.finished)
  })

  it('行を動かす：続いた2行を一番上へ。updatedAt を付ける', () => {
    const s = run(start(), { type: 'moveParts', from: 2, count: 2, to: 0 }, env(T1)).state
    expect(order(s)).toEqual(['part-gawaita', 'part-tanaita', 'part-zentai', 'part-tenita'])
    expect(currentJob(s)?.updatedAt).toBe(T1.toISOString())
  })

  it('動かす先が同じ所なら何も変えない', () => {
    const s0 = start()
    expect(run(s0, { type: 'moveParts', from: 1, count: 1, to: 2 }).state).toBe(s0)
  })
})
