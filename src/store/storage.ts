// localStorage への保存と読み込み。読み書きはすべて try/catch で囲み、失敗しても例外を外に出さない。
// kidori の store/storage.ts を参考に作り直したもの（以前の版からの移し替え・材料・フラッシュなどは無い）。
// キーはすべて「kidori-simple.」で始める（kidori・キドリライトと同じ github.io のドメインで localStorage を分け合うため。kidori は「kidori.」、キドリライトは「kidori-lite.」で、どちらにも触らない）
import { defaultAppData } from '../engine/defaults'
import { clipHasFormula, NO_NUMBERING, numberizeJobs, type NumberingReport } from '../engine/migrate/numbers'
import { isRecord, readCellClip, readJobs, readLegacyAdjusts } from '../engine/shape'
import type { AppData } from '../engine/types'

/** 保存データ（AppData）のキー */
export const DATA_KEY = 'kidori-simple.data.v1'
/** 開いている仕事の id のキー */
export const CURRENT_JOB_KEY = 'kidori-simple.currentJobId'
/**
 * 読めなかった保存データの控えのキーの頭。実際のキーは「頭.日時」（例：kidori-simple.data.v1.broken.2026-10-21T10:00:00.000Z）。
 * 控えを残せたときだけ、そのあとの保存をしてよいことにする（元のデータを失わないため）
 */
export const BROKEN_KEY_PREFIX = 'kidori-simple.data.v1.broken'
/**
 * 式を数字に置き換える前の保存データの控えのキーの頭（第2.2版。仕様書 26.4）。読めなかったときの控えと同じ置き方（「頭.日時」）。
 * 置き換えは開いたときに1回だけ（置き換えたデータを保存し直すので、次からは式が無い）
 */
export const BEFORE_NUMBERS_KEY_PREFIX = 'kidori-simple.data.v1.before-numbers'

export const LOAD_FAILED = '保存データを読めませんでした'

/** localStorage のうち使う部分。テストでは差し替える */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface LoadResult {
  /** ok：読めた / empty：まだ何も保存されていない / error：読めなかった（data は初めの状態） */
  status: 'ok' | 'empty' | 'error'
  data: AppData
  currentJobId: string | null
  /** 画面の上に出す知らせ */
  message?: string
  /** このあと保存してよいか。false のときに保存すると元のデータを上書きしてしまうので、保存しない */
  canSave: boolean
  /**
   * 前の版の式を数字に置き換えたか・エラーで空にしたもの（第2.2版。仕様書 26.4）。画面が1度だけ知らせる
   * （reducer の StoreState.numbering）。置き換えなければ replaced: false
   */
  numbering: NumberingReport
}

export type SaveResult = { ok: true } | { ok: false; message: string }

/** ブラウザの localStorage。使えない環境（プライベートモードの一部など）では null */
export function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

// ---------- 中身の検査 ----------
// 手で書き換えたデータや途中までのデータで画面が真っ白にならないよう、形が違えば「読めない」とする。
// 部材・仕事の形の確かめは、共有・バックアップのファイルの読み込みと同じもの（engine/shape.ts）

/**
 * 保存データを読む（第2.2版）。読めれば中身と、前の版の式を数字に置き換えた結果。読めなければ null。
 * - 仕事（今の部材・履歴の中の部材）の式を、保存データの中の調整寸法の一覧で計算した仕上がり寸法の数字にする（engine/migrate/numbers.ts）
 * - 調整寸法の一覧（adjusts）・調整寸法の表のコピー（adjustClip）は置き換えに使ってから捨てる（仕様書 26.2）
 * - 前の版の保存データなら、式の入ったアプリ内のコピー（cellClip）は捨てる（仕様書 26.4）
 */
export function readAppData(raw: unknown): { data: AppData; numbering: NumberingReport } | null {
  if (!isRecord(raw) || raw.version !== 1) return null
  // 第1.3版までの切り方「おまかせ」は縦切り優先にして読む（readJobs。仕様書 18.2）
  const jobs = readJobs(raw.jobs)
  if (!jobs) return null
  // 前の版の調整寸法の表（式の置き換えにだけ使う。無ければ空。形が違えば前の版と同じく読めない）
  const adjusts = readLegacyAdjusts(raw.adjusts)
  if (!adjusts) return null
  // 同じ id の仕事が2つあると開く・消すがおかしくなるので読めないとする
  if (new Set(jobs.map((j) => j.id)).size !== jobs.length) return null
  // コピーしたセル（第1.2版）は、形が違えば捨てる（仕事を読めなくしないため）。
  // 第1.1版の「コピーした部材」（clipboard）は使わなくなったので、あっても読んで捨てる。
  // 前の版（調整寸法の一覧 adjusts がある保存データ）のコピーに式が入っていれば捨てる（第2.2版。仕様書 26.4）。
  // 第2.2版の保存データでは確かめない（名前に空白・記号を使えるので、式と見分けられないため）
  const clip = readCellClip(raw.cellClip)
  const legacy = raw.adjusts !== undefined
  const cellClip = clip && legacy && clipHasFormula(clip) ? null : clip
  const numbered = numberizeJobs(jobs, adjusts)
  return { data: { version: 1, jobs: numbered.jobs, cellClip }, numbering: numbered.report }
}

/** 保存データとして読めるか。読めれば AppData（前の版の式は数字に置き換えたもの。readAppData）、読めなければ null */
export function parseAppData(raw: unknown): AppData | null {
  return readAppData(raw)?.data ?? null
}

// ---------- 読み込み ----------

/** 元のデータを控え（キーの頭 prefix ＋ 日時）に残す。同じキーがあれば .1・.2 … を付けて上書きしない。残せたら true */
function backupRaw(storage: KeyValueStorage, prefix: string, raw: string, now: Date): boolean {
  try {
    const stamp = now.toISOString()
    for (let i = 0; i < 100; i++) {
      const key = i === 0 ? `${prefix}.${stamp}` : `${prefix}.${stamp}.${i}`
      if (storage.getItem(key) !== null) continue
      storage.setItem(key, raw)
      return storage.getItem(key) === raw
    }
    return false
  } catch {
    return false
  }
}

/**
 * 保存データを読む。
 * - 何も無い：初めの状態（仕事なし）
 * - 読めない・壊れている：初めの状態で始め「保存データを読めませんでした」。元のデータは書き換えない。
 *   控え（BROKEN_KEY_PREFIX）に写せたときだけ、このあとの保存をしてよい（写せなければ保存しない）
 * - 前の版の式があれば数字に置き換える（第2.2版。仕様書 26.4）。置き換える前のデータを控え（BEFORE_NUMBERS_KEY_PREFIX）に1つ残し、
 *   残せたら置き換えたデータを保存し直す（次に開いたときはもう置き換えない＝知らせも1度だけ）。
 *   控えを残せなければ、置き換えた中身で始めるが元のデータは書き換えず、このあとの変更も保存しない
 * - 開いていた仕事が無くなっていれば、開いていない状態にする
 */
export function loadSaved(storage: KeyValueStorage | null, now: Date = new Date()): LoadResult {
  const fresh = () => defaultAppData()
  const numbering = NO_NUMBERING
  if (!storage) {
    return { status: 'error', data: fresh(), currentJobId: null, message: 'このブラウザでは保存できません。画面を閉じると入力は消えます', canSave: false, numbering }
  }
  let raw: string | null
  try {
    raw = storage.getItem(DATA_KEY)
  } catch {
    return { status: 'error', data: fresh(), currentJobId: null, message: `${LOAD_FAILED}。元のデータを守るため、このあとの変更は保存しません`, canSave: false, numbering }
  }
  if (raw === null) return { status: 'empty', data: fresh(), currentJobId: null, canSave: true, numbering }

  let read: { data: AppData; numbering: NumberingReport } | null = null
  try {
    read = readAppData(JSON.parse(raw))
  } catch {
    read = null
  }
  if (!read) {
    const saved = backupRaw(storage, BROKEN_KEY_PREFIX, raw, now)
    return {
      status: 'error',
      data: fresh(),
      currentJobId: null,
      message: saved
        ? `${LOAD_FAILED}。元のデータは控えに残し、空の一覧で始めます`
        : `${LOAD_FAILED}。元のデータを守るため、このあとの変更は保存しません`,
      canSave: saved,
      numbering,
    }
  }
  const { data } = read

  // 前の版の式を数字に置き換えたとき：置き換える前のデータを控えに残してから、置き換えたデータを保存し直す
  let canSave = true
  let message: string | undefined
  if (read.numbering.replaced) {
    if (backupRaw(storage, BEFORE_NUMBERS_KEY_PREFIX, raw, now)) {
      try {
        storage.setItem(DATA_KEY, JSON.stringify(data))
      } catch {
        // 書けなくても元のデータと控えは残っている（次に開いたときにもう一度置き換える）
      }
    } else {
      canSave = false
      message = '式を数字に置き換える前のデータの控えを残せなかったので、元のデータを守るため、このあとの変更は保存しません'
    }
  }

  let currentJobId: string | null = null
  try {
    currentJobId = storage.getItem(CURRENT_JOB_KEY)
  } catch {
    currentJobId = null
  }
  const found = data.jobs.find((j) => j.id === currentJobId)
  return { status: 'ok', data, currentJobId: found ? found.id : null, canSave, numbering: read.numbering, ...(message ? { message } : {}) }
}

// ---------- 保存 ----------

export const SAVE_FAILED = '保存できませんでした（スマホの空き容量が足りないかもしれません）'

/** 保存データと開いている仕事を書く。失敗しても例外を出さず、理由を返す */
export function saveSaved(storage: KeyValueStorage | null, data: AppData, currentJobId: string | null): SaveResult {
  if (!storage) return { ok: false, message: SAVE_FAILED }
  try {
    storage.setItem(DATA_KEY, JSON.stringify(data))
    storage.setItem(CURRENT_JOB_KEY, currentJobId ?? '')
    return { ok: true }
  } catch {
    return { ok: false, message: SAVE_FAILED }
  }
}
