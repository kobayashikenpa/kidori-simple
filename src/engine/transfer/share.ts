// 仕事1つのファイル（この仕事を送る。仕様書 15.3）。React・ブラウザに依存しない。
// kidori の store/transfer/share.ts を参考に作り直したもの（材料・フラッシュ・重ね切りの組は無い）
import type { Job } from '../types'
import { TRANSFER_APP, TRANSFER_VERSION, type JobFile } from './envelope'

/**
 * 送る中身：切り出しチェック（固定した1枚）・仕上がりの完了・履歴（第2.1版。仕様書 25.1）を外した仕事。元の仕事は変えない。
 * 調整寸法は第2.2版（仕様書 26.2）でなくしたので、adjusts はいつも空の並び（前の版のアプリでも読めるよう、形は変えない）
 */
export function jobFile(job: Job): JobFile {
  return {
    app: TRANSFER_APP,
    kind: 'job',
    version: TRANSFER_VERSION,
    job: {
      ...job,
      settings: { ...job.settings, sheet: { ...job.settings.sheet } },
      parts: job.parts.map((p) => ({ ...p, expr: { W: p.expr.W, H: p.expr.H }, finishedDone: false })),
      frozenSheets: [],
      history: [],
    },
    adjusts: [],
  }
}

/** 仕事1つのファイルの中身（JSON の文字列。空白なし） */
export function buildJobFile(job: Job): string {
  return JSON.stringify(jobFile(job))
}

/** ファイル名に使えない文字（\ / : * ? " < > |）・制御文字・空白（半角・全角） */
// oxlint-disable-next-line no-control-regex
const BAD_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f\s]/gu
/** ファイル名の名前の部分の長さ（kidori と同じ 50 文字） */
const MAX_NAME_LENGTH = 50

/**
 * 仕事1つのファイル名：`<仕事の名前>.kidori-simple.json`（例：本棚.kidori-simple.json）。
 * 前後の空白を外し、使えない文字・空白は「_」に置き換え、50 文字まで。空なら「仕事.kidori-simple.json」
 */
export function jobFileName(job: Pick<Job, 'name'>): string {
  const base = Array.from(job.name.trim().replace(BAD_CHARS, '_')).slice(0, MAX_NAME_LENGTH).join('')
  return `${base || '仕事'}.kidori-simple.json`
}
