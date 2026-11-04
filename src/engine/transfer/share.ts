// 仕事1つのファイル（この仕事を送る。仕様書 15.3）。React・ブラウザに依存しない。
// kidori の store/transfer/share.ts を参考に作り直したもの（材料・フラッシュ・重ね切りの組は無い。調整寸法はアプリ全体の一覧から選んで入れる）
import { adjustIdsInExpr } from '../formula/usages'
import { usableAdjusts } from '../adjusts'
import { AXES, type AdjustRow, type Job } from '../types'
import { TRANSFER_APP, TRANSFER_VERSION, type JobFile } from './envelope'

/**
 * 送る中身：切り出しチェック（固定した1枚）・仕上がりの完了・履歴（第2.1版。仕様書 25.1）を外した仕事と、その仕事の式で使っている調整寸法だけ
 * （adjusts＝アプリ全体の調整寸法の表の並び。削除した調整寸法・書きかけの行は入らない（第1.7版））。元の仕事は変えない
 */
export function jobFile(job: Job, adjusts: readonly AdjustRow[]): JobFile {
  const used = new Set(job.parts.flatMap((p) => AXES.flatMap((a) => adjustIdsInExpr(p.expr[a]))))
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
    adjusts: usableAdjusts(adjusts).filter((a) => used.has(a.id)).map((a) => ({ ...a })),
  }
}

/** 仕事1つのファイルの中身（JSON の文字列。空白なし） */
export function buildJobFile(job: Job, adjusts: readonly AdjustRow[]): string {
  return JSON.stringify(jobFile(job, adjusts))
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
