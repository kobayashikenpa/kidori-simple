// 保存データの状態と、その変え方（reducer）。React に依存しないのでテストしやすい。
// kidori の store/reducer.ts を参考に作り直したもの。
// 操作の中で id・時刻を作るので、reduce は「id の作り方と今の時刻（env）」を引数で受ける純粋関数にする。
// 画面からは JobStore の dispatch で1回だけ当てる（React が reducer を2回呼んでも id がずれないように、結果の状態を置き換える）
import {
  clearCells,
  clearCutSource,
  copyCells,
  cutCells,
  deleteRows,
  fillCells,
  pasteCells,
  type CellSelection,
  type PasteRenamed,
  type PasteSkip,
} from '../engine/clipboard/cells'
import {
  clearAdjustCells,
  copyAdjustCells,
  cutAdjustCells,
  deleteAdjustRows,
  fillAdjustCells,
  insertAdjustRow,
  pasteAdjustCells,
  setAdjustCell,
  type AdjustPasteSkip,
  type AdjustRenamed,
  type AdjustSelection,
} from '../engine/clipboard/adjustCells'
import { duplicatePart } from '../engine/clipboard/copy'
import { mergeNumbering, NO_NUMBERING, type NumberingReport } from '../engine/migrate/numbers'
import { addHistory, historyEntry, removeHistory, restoreHistory, setHistoryMemo } from '../engine/history'
import { packJob } from '../engine/packing'
import { computeDimensions } from '../engine/dimensions'
import type { SortKey, SortOrder } from '../engine/order'
import { setPartCheck, setPieceCheck, type SheetTarget } from '../engine/progress/checks'
import type { AdjustCellPos, AdjustRow, AppData, CellPos, CellRange, Job, Part, Settings, Sheet } from '../engine/types'
import {
  addAdjust,
  addPart,
  copyJob,
  insertPart,
  deleteJob,
  makeJob,
  moveJobParts,
  newPart,
  removeAdjusts,
  removePart,
  renameJob,
  setAllRotatable,
  setSheet,
  sortJobParts,
  updateAdjust,
  updatePart,
  updateSettings,
  type AdjustDraft,
  type AdjustsResult,
  type OpResult,
} from './jobs'
import { sampleJob } from './sample'
import type { LoadResult } from './storage'

export interface StoreState {
  data: AppData
  /** 開いている仕事。null なら開いていない */
  currentJobId: string | null
  /** 読み込みに失敗したときの知らせ（画面の上に出す） */
  loadError: string | null
  /** 保存してよいか（壊れたデータを守るため、保存を止めることがある） */
  canSave: boolean
  /**
   * 前の版の式を数字に置き換えたときの知らせ（第2.2版。仕様書 26.4）。まだ知らせていないものだけ持つ（保存しない）。
   * 開いたときの置き換え（storage の loadSaved）と、ファイルの取り込み（replaceData の numbering）で入り、
   * 画面が知らせを閉じたら dismissNumbering で消す（1度だけ知らせる）。文は engine/migrate/numbers の numberingMessage
   */
  numbering: NumberingReport
}

/** 操作の中で使う id の作り方と今の時刻 */
export interface Env {
  newId: (prefix: string) => string
  now: Date
}

/** 部材の操作の対象の仕事（省略で開いている仕事） */
interface OnJob {
  jobId?: string
}

/** 選んだセル：セルの配列（第1.2版）か、四角い範囲（第1.3版。行全体・列全体も engine の rowRange・columnRange で四角にする） */
export type SelectionArg = { cells: CellPos[] } | { range: CellRange }

const selectionOf = (a: SelectionArg): CellSelection => ('range' in a ? a.range : a.cells)

/** 調整寸法の表で選んだセル（第1.7版）：セルの配列か四角い範囲（left は 0＝名前・1＝寸法） */
export type AdjustSelectionArg = { cells: AdjustCellPos[] } | { range: CellRange }

const adjustSelectionOf = (a: AdjustSelectionArg): AdjustSelection => ('range' in a ? a.range : a.cells)

/**
 * 調整寸法の表の操作（第1.7版。仕様書 21.1）。どれもアプリ全体の調整寸法の表（AppData.adjusts）を変える（仕事の updatedAt は変えない）。
 * 値・名前が変わる調整寸法をほかの仕事で使っているかの確認は、画面で先に行う
 * （adjustTableOutcome で変えたあとの表を作り、engine/adjusts の adjustChangeUsages(jobs, 前, 後, 開いている仕事) で調べる）
 */
export type AdjustTableAction =
  /** セルに入力する（名前・寸法）。表の下の空の行なら行を足す。結果の id は入れた行の id */
  | { type: 'setAdjustCell'; pos: AdjustCellPos; text: string }
  /** 選んだセルをコピーする（AppData.adjustClip。部材の表の cellClip とは別）。表は変えない */
  | ({ type: 'copyAdjustCells' } & AdjustSelectionArg)
  /** 選んだセルを切り取る（adjustClip.cut に元の範囲）。表はまだ変えない */
  | ({ type: 'cutAdjustCells' } & AdjustSelectionArg)
  /** adjustClip を選んだセルに貼る。結果の adjustPaste に貼った数・貼れなかったセル・番号を振ったセル。切り取りなら元を空にし、クリップをふつうのコピーに */
  | ({ type: 'pasteAdjustCells' } & AdjustSelectionArg)
  /** オートフィル。結果の adjustPaste は貼り付けと同じ形 */
  | { type: 'fillAdjustCells'; from: CellRange; to: CellRange }
  /** 選んだセルの中身を空にする（名前も寸法も空になった行は消える） */
  | ({ type: 'clearAdjustCells' } & AdjustSelectionArg)
  /** 選んだセルのある行をまとめて消す */
  | ({ type: 'deleteAdjustRows' } & AdjustSelectionArg)
  /** 行を上に挿入：index の位置に空の行を入れる。結果の id は入れた行の id（空の行は画面が入力を終えたら removeAdjusts で外す） */
  | { type: 'insertAdjustRow'; index: number }

export type StoreAction =
  /** 新しい仕事を作る（名前が空なら「10/21 仕事」の形）。open（省略で true）なら開く */
  | { type: 'createJob'; name?: string; open?: boolean }
  /** 仕事を開く（null で閉じる） */
  | { type: 'openJob'; id: string | null }
  | { type: 'renameJob'; jobId: string; name: string }
  /** 仕事をコピーする（設定を引き継ぐ）。開かない */
  | { type: 'copyJob'; jobId: string }
  /** 見本（6章の棚「見本 棚」。数字だけ）を仕事の一覧に足す（仕様書 16.7）。開いている仕事は変えない */
  | { type: 'addSample' }
  /** 仕事を消す。開いていた仕事なら、何も開いていない状態にする */
  | { type: 'deleteJob'; jobId: string }
  | ({ type: 'updateSettings'; patch: Partial<Omit<Settings, 'sheet'>> } & OnJob)
  /** 板のサイズを変える（選んだサイズを仕事に保存する） */
  | ({ type: 'setSheet'; sheet: Sheet } & OnJob)
  /** 部材を最後に足す（id は作る） */
  | ({ type: 'addPart'; part: Partial<Omit<Part, 'id'>> } & OnJob)
  | ({ type: 'updatePart'; partId: string; patch: Partial<Omit<Part, 'id'>> } & OnJob)
  | ({ type: 'removePart'; partId: string } & OnJob)
  /** 部材を index の位置（その部材の上）に入れる（id は作る。番号のメニューの「上に行を入れる」） */
  | ({ type: 'insertPart'; index: number; part: Partial<Omit<Part, 'id'>> } & OnJob)
  /** 全部の部材を回転してよい（true）／回転しない（false）にする */
  | ({ type: 'setAllRotatable'; rotatable: boolean } & OnJob)
  /**
   * 部材を並べ替えて保存する（第2.0版。仕様書 24.1）。W・H は仕上がり寸法（使える調整寸法で計算）、枚数、名前（あいうえお順）で比べる。
   * order は asc＝小さい順（名前はあいうえお順）・desc＝大きい順（名前は逆の順）。空・エラーは一番下。並びが変わらなければ updatedAt は付けない
   */
  | ({ type: 'sortParts'; key: SortKey; order: SortOrder } & OnJob)
  /** 続いた行（from から count 行）を、元の並びの to の位置（to 行目の上。部材の数なら一番下）へ動かす（第2.0版。仕様書 24.2） */
  | ({ type: 'moveParts'; from: number; count: number; to: number } & OnJob)
  /** 部材の複製（元のすぐ後ろ。名前は「棚板のコピー」） */
  | ({ type: 'duplicatePart'; partId: string } & OnJob)
  /**
   * 選んだセルをコピーする（1つのセルか四角い範囲だけ。アプリが覚える＝AppData.cellClip。最後の1回分だけ）。
   * 仕事は変えない（updatedAt も付けない）
   */
  | ({ type: 'copyCells' } & SelectionArg & OnJob)
  /**
   * 選んだセルを切り取る（第1.3版。仕様書 17.3）。コピーと同じく覚え、元（仕事の id と範囲）を cellClip.cut に付ける。
   * 仕事はまだ変えない（貼ったときに元を空にする。貼る前にほかをコピーすると元は残る）
   */
  | ({ type: 'cutCells' } & SelectionArg & OnJob)
  /**
   * コピーしたセルを、選んだセルに貼る（engine の pasteCells）。結果の paste に貼った数・貼れなかったセル。
   * 切り取りなら元のセルを空にし（元がほかの仕事でも）、1つでも貼れたら cellClip をふつうのコピーに変える
   */
  | ({ type: 'pasteCells' } & SelectionArg & OnJob)
  /**
   * オートフィル（第1.3版。仕様書 17.4）：from の範囲の値を、to の範囲（引いたあとの範囲。元を除いた所だけでもよい）へ上下にくり返して入れる。
   * 結果の paste は貼り付けと同じ形（名前の列は、重なる名前に番号を振って入れる。第1.4版）
   */
  | ({ type: 'fillCells'; from: CellRange; to: CellRange } & OnJob)
  /** 選んだセルの中身を消す（行の全部の欄が空になった部材は消える） */
  | ({ type: 'clearCells' } & SelectionArg & OnJob)
  /** 選んだセルのある行の部材をまとめて消す（式で使われているかの確認は画面の側で先に行う） */
  | ({ type: 'deleteRows' } & SelectionArg & OnJob)
  /** 切り出しチェック（その1枚の、ある部材の片をまとめて付け外し） */
  | ({ type: 'setPartCheck'; target: SheetTarget; partId: string; done: boolean } & OnJob)
  /** 切り出しチェック（片1つ） */
  | ({ type: 'setPieceCheck'; target: SheetTarget; pieceId: string; done: boolean } & OnJob)
  /**
   * 履歴に残す（第2.1版。仕様書 25.1）：今の設定・部材（式のまま）と、そのときの必要な枚数・歩留まり（使える調整寸法で packJob。画面と同じ）、
   * メモ・日時を、その仕事の履歴の先頭に足す。21件目で一番古いものを消す。結果の id は残した履歴の id
   */
  | ({ type: 'addHistory'; memo: string } & OnJob)
  /** この内容に戻す：設定と部材を履歴の内容に置き換え（部材の id は新しく振る）、切り出しチェックと固定した1枚を外す。履歴は消さない */
  | ({ type: 'restoreHistory'; historyId: string } & OnJob)
  /** 履歴のメモを直す（前後の空白は外す。空も可）。同じメモなら何もしない */
  | ({ type: 'setHistoryMemo'; historyId: string; memo: string } & OnJob)
  /** 履歴を1件消す */
  | ({ type: 'removeHistory'; historyId: string } & OnJob)
  /** 調整寸法（アプリ全体）を足す */
  | ({ type: 'addAdjust' } & AdjustDraft)
  | ({ type: 'updateAdjust'; adjustId: string } & AdjustDraft)
  /** 調整寸法を消す（1つでも一括でも。書きかけの行・空の行も消せる） */
  | { type: 'removeAdjusts'; adjustIds: string[] }
  /** 調整寸法の表の操作（第1.7版） */
  | AdjustTableAction
  /**
   * 保存データを丸ごと置き換える（ファイルから取り込んだあとの data を入れる。engine/transfer の importTransfer）。
   * 開いている仕事は変えない（新しいデータに無ければ閉じる）。updatedAt は付けない。
   * numbering（importTransfer の numbering）を渡すと、式を数字に置き換えた知らせに足す（第2.2版）
   */
  | { type: 'replaceData'; data: AppData; numbering?: NumberingReport }
  /** 読み込みの知らせを閉じる */
  | { type: 'dismissLoadError' }
  /** 式を数字に置き換えた知らせを閉じる（第2.2版。もう出さない） */
  | { type: 'dismissNumbering' }

/** 貼り付けの結果（「◯つのセルに貼りました（貼れなかったもの ◯つ）」） */
export interface PasteSummary {
  pasted: number
  skipped: PasteSkip[]
  /** 名前が重なるので番号を振って貼ったセル（第1.4版。仕様書 18.3） */
  renamed: PasteRenamed[]
}

/** 調整寸法の表の貼り付け・オートフィルの結果（第1.7版） */
export interface AdjustPasteSummary {
  pasted: number
  skipped: AdjustPasteSkip[]
  /** 表示名が重なるので名前に ②③… を付けて貼ったセル */
  renamed: AdjustRenamed[]
}

/**
 * 操作の結果。id は作ったもの（新しい仕事・部材・複製・調整寸法）の id。paste は貼り付け（pasteCells）・オートフィル（fillCells）のときだけ。
 * adjustPaste は調整寸法の表の貼り付け・オートフィルのときだけ
 */
export type ReduceResult =
  | { ok: true; state: StoreState; id?: string; paste?: PasteSummary; adjustPaste?: AdjustPasteSummary }
  | { ok: false; message: string }

/** 調整寸法の表の操作のあとの表とクリップ（adjustTableOutcome） */
export type AdjustTableOutcome =
  | { ok: true; adjusts: AdjustRow[]; adjustClip: AppData['adjustClip']; id?: string; adjustPaste?: AdjustPasteSummary }
  | { ok: false; message: string }

/**
 * 調整寸法の表の操作を当てたあとの表とクリップ（保存データは変えない純粋関数。reduce もこれを使う）。
 * 画面は、これで作った adjusts と今の data.adjusts を adjustChangeUsages に渡して、ほかの仕事で使っている調整寸法が変わるかを先に確かめる
 */
export function adjustTableOutcome(data: Pick<AppData, 'adjusts' | 'adjustClip'>, action: AdjustTableAction, newId: (prefix: string) => string): AdjustTableOutcome {
  const rows = data.adjusts
  switch (action.type) {
    case 'setAdjustCell': {
      const r = setAdjustCell(rows, action.pos, action.text, newId)
      if (!r.ok) return r
      return { ok: true, adjusts: r.adjusts, adjustClip: data.adjustClip, ...(r.id === undefined ? {} : { id: r.id }) }
    }
    case 'copyAdjustCells':
    case 'cutAdjustCells': {
      const sel = adjustSelectionOf(action)
      const r = action.type === 'cutAdjustCells' ? cutAdjustCells(rows, sel) : copyAdjustCells(rows, sel)
      if (!r.ok) return r
      return { ok: true, adjusts: rows, adjustClip: r.clip }
    }
    case 'pasteAdjustCells': {
      const clip = data.adjustClip
      if (!clip) return { ok: false, message: 'コピーしたセルがありません' }
      const r = pasteAdjustCells(rows, clip, adjustSelectionOf(action), newId)
      if (!r.ok) return r
      // 切り取りは1回貼ったらふつうのコピーに（2回目は元を消さない）
      let nextClip = clip
      if (clip.cut && r.pasted > 0) {
        const { cut: _cut, ...copy } = clip
        nextClip = copy
      }
      return { ok: true, adjusts: r.adjusts, adjustClip: nextClip, adjustPaste: { pasted: r.pasted, skipped: r.skipped, renamed: r.renamed } }
    }
    case 'fillAdjustCells': {
      const r = fillAdjustCells(rows, action.from, action.to, newId)
      if (!r.ok) return r
      return { ok: true, adjusts: r.adjusts, adjustClip: data.adjustClip, adjustPaste: { pasted: r.pasted, skipped: r.skipped, renamed: r.renamed } }
    }
    case 'clearAdjustCells':
      return { ok: true, adjusts: clearAdjustCells(rows, adjustSelectionOf(action)), adjustClip: data.adjustClip }
    case 'deleteAdjustRows': {
      const next = deleteAdjustRows(rows, adjustSelectionOf(action))
      if (next === rows) return { ok: false, message: '削除する行を選んでください' }
      return { ok: true, adjusts: next, adjustClip: data.adjustClip }
    }
    case 'insertAdjustRow': {
      const id = newId('adjust')
      return { ok: true, adjusts: insertAdjustRow(rows, action.index, id), adjustClip: data.adjustClip, id }
    }
  }
}

/** 読み込みの結果から最初の状態を作る */
export function initialState(load: LoadResult): StoreState {
  return { data: load.data, currentJobId: load.currentJobId, loadError: load.message ?? null, canSave: load.canSave, numbering: load.numbering }
}

/** 開いている仕事（無ければ null） */
export function currentJob(state: StoreState): Job | null {
  return state.data.jobs.find((j) => j.id === state.currentJobId) ?? null
}

const fail = (message: string): ReduceResult => ({ ok: false, message })
const done = (state: StoreState, id?: string): ReduceResult => (id === undefined ? { ok: true, state } : { ok: true, state, id })

/** 仕事に操作を当てて置き換える。変わったときだけ updatedAt を付ける（同じ仕事が返れば何もしない） */
function onJob(state: StoreState, jobId: string | undefined, env: Env, op: (job: Job) => OpResult, id?: string): ReduceResult {
  const target = jobId ?? state.currentJobId
  if (target === null) return fail('仕事が開かれていません')
  const job = state.data.jobs.find((j) => j.id === target)
  if (!job) return fail('仕事が見つかりません')
  const r = op(job)
  if (!r.ok) return fail(r.message)
  if (r.job === job) return done(state, id)
  const next: Job = { ...r.job, id: job.id, updatedAt: env.now.toISOString() }
  return done({ ...state, data: { ...state.data, jobs: state.data.jobs.map((j) => (j.id === job.id ? next : j)) } }, id)
}

/** 調整寸法の一覧を置き換える（アプリ全体なので、仕事の updatedAt は変えない。暫定） */
function onAdjusts(state: StoreState, r: AdjustsResult, id?: string): ReduceResult {
  if (!r.ok) return fail(r.message)
  return done({ ...state, data: { ...state.data, adjusts: r.adjusts } }, id)
}

export function reduce(state: StoreState, action: StoreAction, env: Env): ReduceResult {
  switch (action.type) {
    case 'createJob': {
      const job = makeJob(action.name ?? '', env.now, env.newId('job'))
      const open = action.open ?? true
      return done(
        { ...state, data: { ...state.data, jobs: [...state.data.jobs, job] }, currentJobId: open ? job.id : state.currentJobId },
        job.id,
      )
    }
    case 'openJob':
      if (action.id !== null && !state.data.jobs.some((j) => j.id === action.id)) return fail('仕事が見つかりません')
      return done({ ...state, currentJobId: action.id })
    case 'renameJob':
      return onJob(state, action.jobId, env, (j) => renameJob(j, action.name))
    case 'copyJob': {
      const src = state.data.jobs.find((j) => j.id === action.jobId)
      if (!src) return fail('仕事が見つかりません')
      const job = copyJob(src, env.now, env.newId('job'), env.newId)
      return done({ ...state, data: { ...state.data, jobs: [...state.data.jobs, job] } }, job.id)
    }
    case 'addSample': {
      const job = sampleJob(env.now, env.newId)
      return done({ ...state, data: { ...state.data, jobs: [...state.data.jobs, job] } }, job.id)
    }
    case 'deleteJob': {
      if (!state.data.jobs.some((j) => j.id === action.jobId)) return fail('仕事が見つかりません')
      const r = deleteJob(state.data.jobs, state.currentJobId, action.jobId)
      return done({ ...state, data: { ...state.data, jobs: r.jobs }, currentJobId: r.currentJobId })
    }
    case 'updateSettings':
      return onJob(state, action.jobId, env, (j) => updateSettings(j, action.patch))
    case 'setSheet':
      return onJob(state, action.jobId, env, (j) => setSheet(j, action.sheet))
    case 'addPart': {
      const id = env.newId('part')
      return onJob(state, action.jobId, env, (j) => addPart(j, newPart(id, action.part)), id)
    }
    case 'updatePart':
      return onJob(state, action.jobId, env, (j) => updatePart(j, action.partId, action.patch))
    case 'removePart':
      return onJob(state, action.jobId, env, (j) => removePart(j, action.partId))
    case 'insertPart': {
      const id = env.newId('part')
      return onJob(state, action.jobId, env, (j) => insertPart(j, action.index, newPart(id, action.part)), id)
    }
    case 'setAllRotatable':
      return onJob(state, action.jobId, env, (j) => setAllRotatable(j, action.rotatable))
    case 'sortParts':
      return onJob(state, action.jobId, env, (j) =>
        sortJobParts(j, computeDimensions(j), action.key, action.order),
      )
    case 'moveParts':
      return onJob(state, action.jobId, env, (j) => moveJobParts(j, action.from, action.count, action.to))
    case 'duplicatePart': {
      let id: string | undefined
      const r = onJob(state, action.jobId, env, (j) => {
        const d = duplicatePart(j, action.partId, env.newId)
        if (!d.ok) return d
        id = d.partId
        return { ok: true, job: d.job }
      })
      return r.ok ? done(r.state, id) : r
    }
    case 'copyCells':
    case 'cutCells': {
      const job = state.data.jobs.find((j) => j.id === (action.jobId ?? state.currentJobId))
      if (!job) return fail('仕事が開かれていません')
      const sel = selectionOf(action)
      const r = action.type === 'cutCells' ? cutCells(job, sel) : copyCells(job, sel)
      if (!r.ok) return fail(r.message)
      return done({ ...state, data: { ...state.data, cellClip: r.clip } })
    }
    case 'pasteCells': {
      const clip = state.data.cellClip
      if (!clip) return fail('コピーしたセルがありません')
      let paste: PasteSummary | undefined
      let cutClear: { jobId: string; cells: CellPos[] } | null = null
      const r = onJob(state, action.jobId, env, (j) => {
        const p = pasteCells(j, clip, selectionOf(action), env.newId)
        if (!p.ok) return p
        paste = { pasted: p.pasted, skipped: p.skipped, renamed: p.renamed }
        cutClear = p.cutClear
        return { ok: true, job: p.job }
      })
      if (!r.ok || !paste) return r
      const summary: PasteSummary = paste
      if (!clip.cut || summary.pasted === 0) return { ...r, paste: summary }
      // 切り取り：元がほかの仕事なら、その仕事の元のセルを空にする。クリップはふつうのコピーに変える（2回目は元を消さない）
      let next = r.state
      const clear = cutClear as { jobId: string; cells: CellPos[] } | null
      if (clear) {
        const after = onJob(next, clear.jobId, env, (j) => ({ ok: true, job: clearCutSource(j, clip, clear.cells) }))
        if (after.ok) next = after.state // 元の仕事が消えていれば何もしない
      }
      const { cut: _cut, ...copy } = clip
      return { ok: true, state: { ...next, data: { ...next.data, cellClip: copy } }, paste: summary }
    }
    case 'fillCells': {
      let paste: PasteSummary | undefined
      const r = onJob(state, action.jobId, env, (j) => {
        const p = fillCells(j, action.from, action.to, env.newId)
        if (!p.ok) return p
        paste = { pasted: p.pasted, skipped: p.skipped, renamed: p.renamed }
        return { ok: true, job: p.job }
      })
      return r.ok && paste ? { ...r, paste } : r
    }
    case 'clearCells':
      return onJob(state, action.jobId, env, (j) => ({ ok: true, job: clearCells(j, selectionOf(action)) }))
    case 'deleteRows':
      return onJob(state, action.jobId, env, (j) => {
        const next = deleteRows(j, selectionOf(action))
        return next === j ? { ok: false, message: '削除する行を選んでください' } : { ok: true, job: next }
      })
    case 'setPartCheck':
      return onJob(state, action.jobId, env, (j) =>
        setPartCheck(j, action.target, action.partId, action.done, env.now, env.newId('frozen')),
      )
    case 'setPieceCheck':
      return onJob(state, action.jobId, env, (j) =>
        setPieceCheck(j, action.target, action.pieceId, action.done, env.now, env.newId('frozen')),
      )
    case 'addHistory': {
      const id = env.newId('history')
      return onJob(
        state,
        action.jobId,
        env,
        (j) => addHistory(j, historyEntry(j, packJob(j, computeDimensions(j)), { id, memo: action.memo, now: env.now })),
        id,
      )
    }
    case 'restoreHistory':
      return onJob(state, action.jobId, env, (j) => restoreHistory(j, action.historyId, env.newId))
    case 'setHistoryMemo':
      return onJob(state, action.jobId, env, (j) => setHistoryMemo(j, action.historyId, action.memo))
    case 'removeHistory':
      return onJob(state, action.jobId, env, (j) => removeHistory(j, action.historyId))
    case 'addAdjust': {
      const id = env.newId('adjust')
      return onAdjusts(state, addAdjust(state.data.adjusts, { name: action.name, value: action.value }, id), id)
    }
    case 'updateAdjust':
      return onAdjusts(state, updateAdjust(state.data.adjusts, action.adjustId, { name: action.name, value: action.value }))
    case 'removeAdjusts':
      return onAdjusts(state, removeAdjusts(state.data.adjusts, action.adjustIds))
    case 'setAdjustCell':
    case 'copyAdjustCells':
    case 'cutAdjustCells':
    case 'pasteAdjustCells':
    case 'fillAdjustCells':
    case 'clearAdjustCells':
    case 'deleteAdjustRows':
    case 'insertAdjustRow': {
      const r = adjustTableOutcome(state.data, action, env.newId)
      if (!r.ok) return fail(r.message)
      const unchanged = r.adjusts === state.data.adjusts && r.adjustClip === state.data.adjustClip
      const next = unchanged ? state : { ...state, data: { ...state.data, adjusts: r.adjusts, adjustClip: r.adjustClip } }
      return {
        ok: true,
        state: next,
        ...(r.id === undefined ? {} : { id: r.id }),
        ...(r.adjustPaste === undefined ? {} : { adjustPaste: r.adjustPaste }),
      }
    }
    case 'replaceData': {
      const keep = state.currentJobId !== null && action.data.jobs.some((j) => j.id === state.currentJobId)
      const numbering = action.numbering ? mergeNumbering(state.numbering, action.numbering) : state.numbering
      return done({ ...state, data: action.data, currentJobId: keep ? state.currentJobId : null, numbering })
    }
    case 'dismissLoadError':
      return done({ ...state, loadError: null })
    case 'dismissNumbering':
      return state.numbering.replaced ? done({ ...state, numbering: NO_NUMBERING }) : done(state)
  }
}
