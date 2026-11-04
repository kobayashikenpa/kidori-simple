// localStorage への保存と読み込み。読み書きはすべて try/catch で囲み、失敗しても例外を外に出さない。
// kidori の store/storage.ts を参考に作り直したもの（以前の版からの移し替え・材料・フラッシュなどは無い）。
// キーはすべて「kidori-simple.」で始める（kidori と同じ github.io のドメインで localStorage を分け合うため。kidori は「kidori.」）
import { defaultAppData } from '../engine/defaults'
import { isRecord, readAdjustClip, readAdjustRows, readCellClip, readJobs } from '../engine/shape'
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
// 部材・仕事・調整寸法の形の確かめは、共有・バックアップのファイルの読み込みと同じもの（engine/shape.ts）

/** 保存データとして読めるか。読めれば AppData、読めなければ null */
export function parseAppData(raw: unknown): AppData | null {
  if (!isRecord(raw) || raw.version !== 1) return null
  // 第1.3版までの切り方「おまかせ」は縦切り優先にして読む（readJobs。仕様書 18.2）
  const jobs = readJobs(raw.jobs)
  if (!jobs) return null
  // 調整寸法の表（第1.7版から書きかけの行も。第1.6版までの調整寸法もそのまま読める）
  const adjusts = readAdjustRows(raw.adjusts)
  if (!adjusts) return null
  // 同じ id の仕事が2つあると開く・消すがおかしくなるので読めないとする
  if (new Set(jobs.map((j) => j.id)).size !== jobs.length) return null
  // コピーしたセル（第1.2版）は、形が違えば捨てる（仕事を読めなくしないため）。
  // 第1.1版の「コピーした部材」（clipboard）は使わなくなったので、あっても読んで捨てる
  const cellClip = readCellClip(raw.cellClip)
  // 調整寸法の表のクリップ（第1.7版）。無い・形が違えば null
  const adjustClip = readAdjustClip(raw.adjustClip)
  return { version: 1, jobs, adjusts, cellClip, adjustClip }
}

// ---------- 読み込み ----------

/** 読めなかったデータを控えに残す。残せたら true */
function backupBroken(storage: KeyValueStorage, raw: string, now: Date): boolean {
  try {
    const stamp = now.toISOString()
    for (let i = 0; i < 100; i++) {
      const key = i === 0 ? `${BROKEN_KEY_PREFIX}.${stamp}` : `${BROKEN_KEY_PREFIX}.${stamp}.${i}`
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
 * - 何も無い：初めの状態（仕事なし・調整寸法はメラミン1・シート0.5）
 * - 読めない・壊れている：初めの状態で始め「保存データを読めませんでした」。元のデータは書き換えない。
 *   控え（BROKEN_KEY_PREFIX）に写せたときだけ、このあとの保存をしてよい（写せなければ保存しない）
 * - 開いていた仕事が無くなっていれば、開いていない状態にする
 */
export function loadSaved(storage: KeyValueStorage | null, newId: (prefix: string) => string, now: Date = new Date()): LoadResult {
  const fresh = () => defaultAppData(newId)
  if (!storage) {
    return { status: 'error', data: fresh(), currentJobId: null, message: 'このブラウザでは保存できません。画面を閉じると入力は消えます', canSave: false }
  }
  let raw: string | null
  try {
    raw = storage.getItem(DATA_KEY)
  } catch {
    return { status: 'error', data: fresh(), currentJobId: null, message: `${LOAD_FAILED}。元のデータを守るため、このあとの変更は保存しません`, canSave: false }
  }
  if (raw === null) return { status: 'empty', data: fresh(), currentJobId: null, canSave: true }

  let data: AppData | null = null
  try {
    data = parseAppData(JSON.parse(raw))
  } catch {
    data = null
  }
  if (!data) {
    const saved = backupBroken(storage, raw, now)
    return {
      status: 'error',
      data: fresh(),
      currentJobId: null,
      message: saved
        ? `${LOAD_FAILED}。元のデータは控えに残し、空の一覧で始めます`
        : `${LOAD_FAILED}。元のデータを守るため、このあとの変更は保存しません`,
      canSave: saved,
    }
  }

  let currentJobId: string | null = null
  try {
    currentJobId = storage.getItem(CURRENT_JOB_KEY)
  } catch {
    currentJobId = null
  }
  const found = data.jobs.find((j) => j.id === currentJobId)
  return { status: 'ok', data, currentJobId: found ? found.id : null, canSave: true }
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
