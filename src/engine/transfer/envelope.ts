// 共有・バックアップのファイルの形（仕様書 15.3・15.4）。React・ブラウザに依存しない。
// kidori の store/transfer/envelope.ts を参考に、kidori-simple 用に作り直したもの（材料・フラッシュは無い。版の移し替え・作った時刻は持たない）
import type { Adjust, Job } from '../types'

/** ファイルの app。kidori のファイル（app: 'kidori'）は読まない */
export const TRANSFER_APP = 'kidori-simple'
/** 取り込みでも読む、分ける前のアプリ（キドリライト）のファイルの app。中身の形は同じ */
export const LEGACY_TRANSFER_APP = 'kidori-lite'
/** ファイルの形の版。形を変えたら上げる */
export const TRANSFER_VERSION = 1
/** 読む文字列の大きさの上限（20MB。kidori と同じ） */
export const MAX_TRANSFER_SIZE = 20 * 1024 * 1024
/** 読めないときの文言（仕様書 15.3） */
export const READ_FAILED = '読み込めませんでした'

/** 仕事1つのファイル（この仕事を送る）。切り出しチェック・仕上がりの完了・履歴は外してある（履歴は空の並び） */
export interface JobFile {
  app: typeof TRANSFER_APP
  kind: 'job'
  version: typeof TRANSFER_VERSION
  job: Job
  /** その仕事の式で使っている調整寸法だけ */
  adjusts: Adjust[]
}

/** バックアップのファイル（全部の仕事と調整寸法の一覧。チェック・履歴も含めてそのまま。第2.0版までのファイルは履歴が無い） */
export interface BackupFile {
  app: typeof TRANSFER_APP
  kind: 'backup'
  version: typeof TRANSFER_VERSION
  jobs: Job[]
  adjusts: Adjust[]
}

export type TransferFile = JobFile | BackupFile
