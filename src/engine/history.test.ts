// 仕事ごとの履歴（第2.1版。仕様書 25.1）：残す・この内容に戻す・メモを直す・削除・最大 20件
import { describe, expect, it } from 'vitest'
import { computeDimensions } from './dimensions'
import { freezeAt } from './fixtures/progress'
import { shelfJob } from './fixtures/shelf'
import { addHistory, copyHistory, historyEntry, HISTORY_LIMIT, removeHistory, restoreHistory, setHistoryMemo } from './history'
import { packJob } from './packing'
import type { HistoryEntry, Job } from './types'

const T0 = new Date('2026-11-04T09:00:00.000Z')
const T1 = new Date('2026-11-04T10:00:00.000Z')

function okJob(r: { ok: true; job: Job } | { ok: false; message: string }): Job {
  if (!r.ok) throw new Error(r.message)
  return r.job
}

function counter(start = 0) {
  let n = start
  return (prefix: string) => `${prefix}-${++n}`
}

const resultOf = (job: Job) => packJob(job, computeDimensions(job))

/** 見本の棚の今の内容を履歴に残した仕事 */
function saved(job: Job = shelfJob(), id = 'h-1', memo = '初めの案', now = T0): Job {
  return okJob(addHistory(job, historyEntry(job, resultOf(job), { id, memo, now })))
}

describe('historyEntry（残す中身）', () => {
  it('設定・部材（名前・W・H・枚数・回転・仕上がりのチェック）・必要な枚数・歩留まり・日時・メモが入る。部材の id は入らない', () => {
    const job = shelfJob()
    job.settings = { ...job.settings, kerf: 4, cutMode: 'horizontal' }
    job.parts[1] = { ...job.parts[1], rotatable: true, finishedDone: true }
    const r = resultOf(job)
    const e = historyEntry(job, r, { id: 'h-1', memo: '扉なし', now: T0 })
    expect(e).toEqual({
      id: 'h-1',
      savedAt: T0.toISOString(),
      memo: '扉なし',
      settings: job.settings,
      parts: [
        { name: '全体', expr: { W: '400', H: '1800' }, quantity: 0, rotatable: false, finishedDone: false },
        { name: '天板', expr: { W: '400', H: '1800' }, quantity: 1, rotatable: true, finishedDone: true },
        { name: '側板', expr: { W: '400', H: '700' }, quantity: 2, rotatable: false, finishedDone: false },
        { name: '棚板', expr: { W: '379', H: '1760' }, quantity: 3, rotatable: false, finishedDone: false },
      ],
      sheetCount: r.sheetCount,
      yieldRate: r.yieldRate,
    })
    expect(Object.keys(e)).not.toContain('adjusts')
  })

  it('見本（4×8・縦切り優先）は 必要な板 2枚・歩留まり 57.2%', () => {
    const e = historyEntry(shelfJob(), resultOf(shelfJob()), { id: 'h', memo: '', now: T0 })
    expect(e.sheetCount).toBe(2)
    expect(Math.round(e.yieldRate * 1000) / 10).toBe(57.2)
  })

  it('写しなので、あとで仕事の設定・部材を変えても履歴は変わらない', () => {
    const job = shelfJob()
    const e = historyEntry(job, resultOf(job), { id: 'h', memo: '', now: T0 })
    job.settings.sheet.width = 910
    job.settings.kerf = 9
    job.parts[0].expr.W = '999'
    expect(e.settings.sheet.width).toBe(1220)
    expect(e.settings.kerf).toBe(3)
    expect(e.parts[0].expr.W).toBe('400')
  })

  it('メモの前後の空白は外す', () => {
    expect(historyEntry(shelfJob(), resultOf(shelfJob()), { id: 'h', memo: '  案A \n', now: T0 }).memo).toBe('案A')
  })
})

describe('addHistory（残す）', () => {
  it('新しい順（先頭に足す）。元の仕事は書き換えない', () => {
    const job = shelfJob()
    const a = saved(job, 'h-1', 'A', T0)
    expect(job.history).toEqual([])
    const b = saved(a, 'h-2', 'B', T1)
    expect(b.history.map((h) => [h.id, h.memo, h.savedAt])).toEqual([
      ['h-2', 'B', T1.toISOString()],
      ['h-1', 'A', T0.toISOString()],
    ])
  })

  it(`最大 ${HISTORY_LIMIT}件。21件目を残すと一番古いものを消す`, () => {
    expect(HISTORY_LIMIT).toBe(20)
    let job = shelfJob()
    for (let i = 1; i <= 20; i++) job = saved(job, `h-${i}`, `メモ${i}`)
    expect(job.history).toHaveLength(20)
    expect(job.history[19].id).toBe('h-1')
    job = saved(job, 'h-21', 'メモ21')
    expect(job.history).toHaveLength(20)
    expect(job.history[0].id).toBe('h-21')
    expect(job.history[19].id).toBe('h-2')
    expect(job.history.some((h) => h.id === 'h-1')).toBe(false)
  })

  it('同じ id の履歴があれば断る', () => {
    const job = saved()
    const e = historyEntry(job, resultOf(job), { id: 'h-1', memo: '', now: T1 })
    expect(addHistory(job, e).ok).toBe(false)
  })

  it('切り出しチェック・固定した1枚は変えない（残すだけ）', () => {
    const job = freezeAt(shelfJob(), 0, { partId: 'part-gawaita', n: 1 })
    const next = saved(job)
    expect(next.frozenSheets).toEqual(job.frozenSheets)
    expect(next.parts).toEqual(job.parts)
  })

  it('固定した1枚があるときの必要な枚数・歩留まりは、画面と同じ packJob の結果（固定した1枚を含む）', () => {
    const job = freezeAt(shelfJob(), 0, { partId: 'part-gawaita', n: 1 })
    const r = resultOf(job)
    const e = saved(job).history[0]
    expect([e.sheetCount, e.yieldRate]).toEqual([r.sheetCount, r.yieldRate])
  })
})

describe('restoreHistory（この内容に戻す）', () => {
  /** 残したあと、設定と部材を変え、1枚を固定した仕事 */
  function changed(): Job {
    const job = saved(shelfJob(), 'h-1', '初めの案')
    const next: Job = {
      ...job,
      settings: { ...job.settings, sheet: { sizeKind: 'saburoku', width: 910, length: 1820 }, kerf: 4, allowance: 5, cutMode: 'horizontal' },
      parts: [
        ...job.parts.map((p) => (p.name === '側板' ? { ...p, expr: { W: '全体.W', H: '650' }, quantity: 4 } : p)),
        { id: 'part-extra', name: '扉', expr: { W: '300', H: '600' }, quantity: 2, rotatable: true, finishedDone: true },
      ],
    }
    return freezeAt(next, 0, { partId: 'part-gawaita', n: 1 })
  }

  it('設定と部材を履歴の内容に置き換える（W・H・回転・仕上がりのチェックも戻る）', () => {
    const job = changed()
    const r = okJob(restoreHistory(job, 'h-1', counter()))
    const e = job.history[0]
    expect(r.settings).toEqual(e.settings)
    expect(r.parts.map(({ id: _id, ...p }) => p)).toEqual(e.parts)
    expect(r.parts.map((p) => p.name)).toEqual(['全体', '天板', '側板', '棚板'])
  })

  it('切り出しチェックと固定した1枚を外す。履歴は消さない（並びもそのまま）。名前・作った日は変えない', () => {
    const job = changed()
    expect(job.frozenSheets).toHaveLength(1)
    const r = okJob(restoreHistory(job, 'h-1', counter()))
    expect(r.frozenSheets).toEqual([])
    expect(r.history).toEqual(job.history)
    expect([r.id, r.name, r.createdAt]).toEqual([job.id, job.name, job.createdAt])
  })

  it('戻した部材の id は新しく振る（newId("part")。今の部材・ほかの部材の id と重ならない）', () => {
    const job = changed()
    const r = okJob(restoreHistory(job, 'h-1', counter(100)))
    expect(r.parts.map((p) => p.id)).toEqual(['part-101', 'part-102', 'part-103', 'part-104'])
    expect(r.parts.some((p) => job.parts.some((q) => q.id === p.id))).toBe(false)
  })

  it('戻した内容で計算すると、残したときと同じ必要な枚数・歩留まりになる（調整寸法が同じなら）', () => {
    const job = changed()
    const r = okJob(restoreHistory(job, 'h-1', counter()))
    const res = resultOf(r)
    expect([res.sheetCount, res.yieldRate]).toEqual([job.history[0].sheetCount, job.history[0].yieldRate])
  })

  it('戻したあと仕事の部材を変えても、履歴の中身は変わらない（写しで戻す）', () => {
    const job = changed()
    const r = okJob(restoreHistory(job, 'h-1', counter()))
    r.parts[0].expr.W = '999'
    r.settings.sheet.width = 1
    expect(r.history[0].parts[0].expr.W).toBe('400')
    expect(r.history[0].settings.sheet.width).toBe(1220)
  })

  it('無い履歴は断る', () => {
    expect(restoreHistory(changed(), 'nope', counter()).ok).toBe(false)
  })
})

describe('setHistoryMemo（メモを直す）・removeHistory（削除）', () => {
  it('メモを直す（前後の空白は外す）。ほかの中身・並びは変えない', () => {
    const job = saved(saved(shelfJob(), 'h-1', 'A'), 'h-2', 'B', T1)
    const r = okJob(setHistoryMemo(job, 'h-1', '  天板を厚く '))
    expect(r.history.map((h) => [h.id, h.memo])).toEqual([
      ['h-2', 'B'],
      ['h-1', '天板を厚く'],
    ])
    expect({ ...r.history[1], memo: 'A' }).toEqual(job.history[1])
    expect(r.parts).toBe(job.parts)
  })

  it('メモを空にできる（画面では「メモなし」）', () => {
    expect(okJob(setHistoryMemo(saved(), 'h-1', '  ')).history[0].memo).toBe('')
  })

  it('同じメモなら同じ仕事を返す（updatedAt を付けない）', () => {
    const job = saved()
    expect(okJob(setHistoryMemo(job, 'h-1', ' 初めの案 '))).toBe(job)
  })

  it('削除：その1件だけ消す。無い履歴は断る', () => {
    const job = saved(saved(shelfJob(), 'h-1', 'A'), 'h-2', 'B', T1)
    expect(okJob(removeHistory(job, 'h-2')).history.map((h) => h.id)).toEqual(['h-1'])
    expect(removeHistory(job, 'nope').ok).toBe(false)
    expect(setHistoryMemo(job, 'nope', 'x').ok).toBe(false)
  })
})

describe('copyHistory（仕事のコピー用の写し）', () => {
  it('同じ中身の深い写し（元とつながりを持たない）', () => {
    const src: HistoryEntry[] = saved(saved(), 'h-2', 'B', T1).history
    const c = copyHistory(src)
    expect(c).toEqual(src)
    c[0].parts[0].expr.W = '1'
    c[0].settings.sheet.width = 1
    expect(src[0].parts[0].expr.W).toBe('400')
    expect(src[0].settings.sheet.width).toBe(1220)
  })
})

describe('数字だけの式（第2.3版。仕様書 27.4）', () => {
  it('履歴には式のまま残し、戻すと式のまま戻る。結果は式の値で計算する', () => {
    const job = shelfJob()
    job.parts[3].expr = { W: '400-21', H: '1800-40' }
    const e = historyEntry(job, resultOf(job), { id: 'h-1', memo: '', now: T0 })
    expect(e.parts[3].expr).toEqual({ W: '400-21', H: '1800-40' })
    expect(e.sheetCount).toBe(resultOf(shelfJob()).sheetCount)
    expect(e.yieldRate).toBe(resultOf(shelfJob()).yieldRate)
    const back = okJob(restoreHistory(okJob(addHistory(job, e)), 'h-1', counter()))
    expect(back.parts[3].expr).toEqual({ W: '400-21', H: '1800-40' })
  })
})
