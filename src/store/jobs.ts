// 仕事・部材・設定の操作（純粋関数）。元のデータは書き換えず、新しいデータを返す。
// kidori の store/jobs.ts を参考に作り直したもの（材料・フラッシュ・重ね切り・手持ちは無い）。
// updatedAt は reducer の側で付ける
import { createJob, normalizeSheet } from '../engine/defaults'
import { copyHistory } from '../engine/history'
import { moveParts, sameOrder, sortParts, type SortKey, type SortOrder } from '../engine/order'
import { BOARD_SIZES, type CutMode, type DimensionResult, type Job, type Part, type Settings, type Sheet } from '../engine/types'

/** 仕事への操作の結果。失敗したときは画面にそのまま出せる日本語の理由 */
export type OpResult = { ok: true; job: Job } | { ok: false; message: string }

const ok = (job: Job): OpResult => ({ ok: true, job })
const fail = (message: string): { ok: false; message: string } => ({ ok: false, message })

/** id を作る。crypto.randomUUID が無い環境（古いブラウザ・http の画面）でも動くようにする */
export function newId(prefix: string): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return `${prefix}-${c.randomUUID()}`
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

// ---------- 仕事 ----------

/** 新しい仕事の名前の初期値（例：「10/25 」＝月/日 と半角スペース。続けて打てるように。仕様書 22） */
export function defaultJobName(now: Date): string {
  return `${now.getMonth() + 1}/${now.getDate()} `
}

/** 新しい仕事：いつも初期値の設定から始める（仕様書 10）。名前が空なら「10/25」（日付だけ。前後の空白は取る） */
export function makeJob(name: string, now: Date, id: string): Job {
  return createJob({ id, name: name.trim() || defaultJobName(now).trim(), now: now.toISOString() })
}

/** 仕事の名前を変える。空の名前は断る */
export function renameJob(job: Job, name: string): OpResult {
  const t = name.trim()
  if (!t) return fail('仕事の名前を入れてください')
  if (t === job.name) return ok(job)
  return ok({ ...job, name: t })
}

/** コピーの名前（「本棚のコピー」。暫定） */
export function copyJobName(name: string): string {
  return `${name}のコピー`
}

/**
 * 仕事をコピーする。設定はそのまま引き継ぐ（仕様書 4）。部材はそのまま写し、id は新しくする。
 * 切った記録（固定した1枚）と仕上がりの完了のチェックは写さない（暫定。kidori と同じく切った記録は写さない）。
 * 履歴はそのまま写す（第2.1版。仕様書 25.1。履歴の中の仕上がりのチェックも写しのまま）。
 * 元の仕事は書き換えない
 */
export function copyJob(job: Job, now: Date, id: string, makeId: (prefix: string) => string): Job {
  const base = createJob({ id, name: copyJobName(job.name), now: now.toISOString(), settings: job.settings })
  const parts: Part[] = job.parts.map((p) => ({
    id: makeId('part'),
    name: p.name,
    expr: { W: p.expr.W, H: p.expr.H },
    quantity: p.quantity,
    rotatable: p.rotatable,
    finishedDone: false,
  }))
  return { ...base, parts, history: copyHistory(job.history) }
}

/** 仕事を一覧から消す。開いていた仕事を消したときは、何も開いていない状態にする */
export function deleteJob(
  jobs: readonly Job[],
  currentJobId: string | null,
  jobId: string,
): { jobs: Job[]; currentJobId: string | null } {
  return {
    jobs: jobs.filter((j) => j.id !== jobId),
    currentJobId: currentJobId === jobId ? null : currentJobId,
  }
}

// ---------- 設定 ----------

const CUT_MODES: readonly CutMode[] = ['vertical', 'horizontal']

/** 設定（板のほか）を変える。刃厚・端切り・切り代は 0 以上 */
export function updateSettings(job: Job, patch: Partial<Omit<Settings, 'sheet'>>): OpResult {
  const labels = { kerf: '刃厚', trim: '端切り', allowance: '切り代' } as const
  for (const key of ['kerf', 'trim', 'allowance'] as const) {
    const v = patch[key]
    if (v !== undefined && !(Number.isFinite(v) && v >= 0)) return fail(`${labels[key]}は 0 以上の数を入れてください`)
  }
  if (patch.cutMode !== undefined && !CUT_MODES.includes(patch.cutMode)) return fail('切り方が正しくありません')
  const { sheet: _sheet, ...rest } = patch as Partial<Settings>
  return ok({ ...job, settings: { ...job.settings, ...rest } })
}

/**
 * 板のサイズを変える（設定・3×6 と 4×8 の比べで選んだとき）。
 * 3×6・4×8 は決まった大きさにし、自由入力は 0 より大きい妻手・長手（入れた順によらず小さいほうを妻手にそろえる）
 */
export function setSheet(job: Job, sheet: Sheet): OpResult {
  let next: Sheet
  if (sheet.sizeKind === 'custom') {
    if (!(Number.isFinite(sheet.width) && sheet.width > 0 && Number.isFinite(sheet.length) && sheet.length > 0)) {
      return fail('板の大きさは 0 より大きい数を入れてください')
    }
    next = normalizeSheet(sheet)
  } else if (sheet.sizeKind === 'saburoku' || sheet.sizeKind === 'shihachi') {
    const [width, length] = BOARD_SIZES[sheet.sizeKind]
    next = { sizeKind: sheet.sizeKind, width, length }
  } else {
    return fail('板のサイズが正しくありません')
  }
  return ok({ ...job, settings: { ...job.settings, sheet: next } })
}

// ---------- 部材 ----------

/** 新しい部材の下書き（枚数 1・回転しない） */
export function newPart(id: string, p: Partial<Omit<Part, 'id'>> = {}): Part {
  return { id, name: '', expr: { W: '', H: '' }, quantity: 1, rotatable: false, finishedDone: false, ...p }
}

function validatePartFields(part: Part): string | null {
  // 枚数は空（null。計算に入れない）でもよい（第1.1版）
  if (part.quantity !== null && !(Number.isInteger(part.quantity) && part.quantity >= 0)) return '枚数は 0 以上の整数を入れてください'
  return null
}

/**
 * 部材を最後に足す。名前の前後の空白は外す。
 * 第2.2版（仕様書 26.3）から同じ名前の部材も足せる。名前に使える文字の決まりも無い（式で参照しなくなったため。暫定）
 */
export function addPart(job: Job, part: Part): OpResult {
  return insertPart(job, job.parts.length, part)
}

/** 部材を index の位置（今その位置にある部材の上）に入れる。index が範囲外なら最後。同じ id の部材があれば断る */
export function insertPart(job: Job, index: number, part: Part): OpResult {
  if (job.parts.some((p) => p.id === part.id)) return fail('同じ id の部材があります')
  const p: Part = { ...part, name: part.name.trim(), expr: { W: part.expr.W, H: part.expr.H } }
  const err = validatePartFields(p)
  if (err) return fail(err)
  const i = Number.isInteger(index) && index >= 0 && index <= job.parts.length ? index : job.parts.length
  return ok({ ...job, parts: [...job.parts.slice(0, i), p, ...job.parts.slice(i)] })
}

/**
 * 部材を変える（名前の前後の空白は外す）。第2.2版（仕様書 26.3）から同じ名前にもでき、
 * 名前を変えてもほかの部材は変わらない（式の参照のつけ替えはなくした）
 */
export function updatePart(job: Job, partId: string, patch: Partial<Omit<Part, 'id'>>): OpResult {
  const cur = job.parts.find((p) => p.id === partId)
  if (!cur) return fail('部材が見つかりません')
  const next: Part = {
    ...cur,
    ...patch,
    id: partId,
    name: (patch.name ?? cur.name).trim(),
    expr: { W: patch.expr?.W ?? cur.expr.W, H: patch.expr?.H ?? cur.expr.H },
  }
  const err = validatePartFields(next)
  if (err) return fail(err)
  return ok({ ...job, parts: job.parts.map((p) => (p.id === partId ? next : p)) })
}

/** 部材を消す */
export function removePart(job: Job, partId: string): OpResult {
  if (!job.parts.some((p) => p.id === partId)) return fail('部材が見つかりません')
  return ok({ ...job, parts: job.parts.filter((p) => p.id !== partId) })
}

/** 全部の部材を「回転してよい」（true）か「回転しない」（false）にする。変わらなければ同じ仕事を返す */
export function setAllRotatable(job: Job, rotatable: boolean): OpResult {
  if (job.parts.every((p) => p.rotatable === rotatable)) return ok(job)
  return ok({ ...job, parts: job.parts.map((p) => (p.rotatable === rotatable ? p : { ...p, rotatable })) })
}

/**
 * 部材を並べ替える（第2.0版。仕様書 24.1。engine の sortParts）。dims は computeDimensions(job) の結果。
 * 並びが変わらなければ同じ仕事を返す（updatedAt を付けない）
 */
export function sortJobParts(job: Job, dims: DimensionResult, key: SortKey, order: SortOrder): OpResult {
  const parts = sortParts(job.parts, dims, key, order)
  return ok(sameOrder(parts, job.parts) ? job : { ...job, parts })
}

/**
 * 続いた行（from から count 行）を、元の並びの to の位置（to 行目の上）へ動かす（第2.0版。仕様書 24.2。engine の moveParts）。
 * 並びが変わらなければ同じ仕事を返す
 */
export function moveJobParts(job: Job, from: number, count: number, to: number): OpResult {
  const parts = moveParts(job.parts, from, count, to)
  return ok(sameOrder(parts, job.parts) ? job : { ...job, parts })
}
