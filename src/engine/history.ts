// 仕事ごとの履歴（第2.1版。仕様書 25.1）。純粋関数（元の仕事は書き換えず、新しい仕事を返す。updatedAt は store の側で付ける）。
// - 残す：今の設定と部材（式のまま）と、そのときの必要な枚数・歩留まりを写して、先頭に足す（新しい順・最大 20件）
// - この内容に戻す：設定と部材を履歴の内容に置き換え、切り出しチェックと固定した1枚を外す。履歴は消さない
// - メモを直す・削除
// 調整寸法はアプリ全体で1つの一覧なので履歴には入れない（戻したときは今の調整寸法で計算する）
import type { HistoryEntry, HistoryPart, Job, PackingResult, Part, Settings } from './types'

/** 1つの仕事に残せる履歴の数（仕様書 25.1【案】）。これを超えたら一番古いものを消す */
export const HISTORY_LIMIT = 20

export type HistoryResult = { ok: true; job: Job } | { ok: false; message: string }

const ok = (job: Job): HistoryResult => ({ ok: true, job })
const fail = (message: string): HistoryResult => ({ ok: false, message })
const NOT_FOUND = '履歴が見つかりません'

function copySettings(s: Settings): Settings {
  return { ...s, sheet: { ...s.sheet } }
}

function historyPart(p: Pick<Part, 'name' | 'expr' | 'quantity' | 'rotatable' | 'finishedDone'>): HistoryPart {
  return { name: p.name, expr: { W: p.expr.W, H: p.expr.H }, quantity: p.quantity, rotatable: p.rotatable, finishedDone: p.finishedDone }
}

function copyEntry(e: HistoryEntry): HistoryEntry {
  return { ...e, settings: copySettings(e.settings), parts: e.parts.map(historyPart) }
}

/** 履歴の並びの深い写し（仕事のコピー・取り込みで使う） */
export function copyHistory(history: readonly HistoryEntry[]): HistoryEntry[] {
  return history.map(copyEntry)
}

/**
 * 今の仕事から履歴の1件を作る（写し。あとで仕事を変えても変わらない）。
 * result は画面に出ている結果（packJob(job, computeDimensions(job))）。必要な枚数・歩留まりはそこから写す。
 * メモの前後の空白は外す
 */
export function historyEntry(
  job: Pick<Job, 'settings' | 'parts'>,
  result: Pick<PackingResult, 'sheetCount' | 'yieldRate'>,
  args: { id: string; memo: string; now: Date },
): HistoryEntry {
  return {
    id: args.id,
    savedAt: args.now.toISOString(),
    memo: args.memo.trim(),
    settings: copySettings(job.settings),
    parts: job.parts.map(historyPart),
    sheetCount: result.sheetCount,
    yieldRate: result.yieldRate,
  }
}

/**
 * 履歴に残す：先頭（新しい順）に足し、HISTORY_LIMIT を超えた古いものを消す。同じ id の履歴があれば断る。
 * 部材・設定・切り出しチェックは変えない
 */
export function addHistory(job: Job, entry: HistoryEntry): HistoryResult {
  if (job.history.some((h) => h.id === entry.id)) return fail('同じ id の履歴があります')
  return ok({ ...job, history: [copyEntry(entry), ...job.history].slice(0, HISTORY_LIMIT) })
}

/**
 * この内容に戻す：設定と部材を履歴の内容（写し）に置き換え、切り出しチェックと固定した1枚（frozenSheets）を外す。
 * 部材の id は newId('part') で新しく振る（第2.1版の未決事項。暫定）。履歴・名前・作った日は変えない
 */
export function restoreHistory(job: Job, historyId: string, newId: (prefix: string) => string): HistoryResult {
  const e = job.history.find((h) => h.id === historyId)
  if (!e) return fail(NOT_FOUND)
  const parts: Part[] = e.parts.map((p) => ({ id: newId('part'), ...historyPart(p) }))
  return ok({ ...job, settings: copySettings(e.settings), parts, frozenSheets: [] })
}

/** メモを直す（前後の空白は外す。空も可）。同じメモなら同じ仕事を返す */
export function setHistoryMemo(job: Job, historyId: string, memo: string): HistoryResult {
  const e = job.history.find((h) => h.id === historyId)
  if (!e) return fail(NOT_FOUND)
  const m = memo.trim()
  if (m === e.memo) return ok(job)
  return ok({ ...job, history: job.history.map((h) => (h.id === historyId ? { ...h, memo: m } : h)) })
}

/** 履歴を1件消す */
export function removeHistory(job: Job, historyId: string): HistoryResult {
  if (!job.history.some((h) => h.id === historyId)) return fail(NOT_FOUND)
  return ok({ ...job, history: job.history.filter((h) => h.id !== historyId) })
}
