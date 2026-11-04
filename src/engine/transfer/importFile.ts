// ファイルから取り込む：読んだファイルを今の保存データに足す（仕様書 15.3・15.4）。純粋関数（元のデータは書き換えない）。
// kidori の importShared・importBackup・rekeyJob（store/jobs.ts）を参考に、材料・フラッシュ・重ね切りの組を外したもの。
// 第2.2版（仕様書 26.4）：前の版のファイルの式は、ファイルの中の調整寸法の一覧で計算した数字に置き換えてから足す。
// 調整寸法の一覧はもう持たないので、今の保存データに足さない（第2.1版までは表示名で合わせて足していた）
import { NO_NUMBERING, numberizeJob, type ClearedSize, type NumberingReport } from '../migrate/numbers'
import type { AppData, FrozenSheet, HistoryEntry, Job, Part } from '../types'
import type { TransferFile } from './envelope'

export interface ImportResult {
  /** 取り込んだあとの保存データ（仕事は後ろに足す。今ある仕事・コピーしたセルは変えない） */
  data: AppData
  /** 足した仕事の id（足した順） */
  jobIds: string[]
  /** 画面に出す知らせ（「「本棚」を取り込みました」「3件の仕事を追加しました」） */
  message: string
  /**
   * 前の版のファイルの式を数字に置き換えたか・エラーで空にしたもの（第2.2版。仕様書 26.4）。
   * 仕事の名前・id は取り込んだあとのもの。画面は store の replaceData に numbering として渡し、1度だけ知らせる
   */
  numbering: NumberingReport
}

/** 重ならない仕事の名前：同じ名前（前後の空白を除く）があれば「棚のコピー」「棚のコピー2」…（暫定） */
function uniqueJobName(name: string, taken: readonly string[]): string {
  const set = new Set(taken.map((n) => n.trim()))
  if (!set.has(name.trim())) return name
  const base = `${name.trim()}のコピー`
  if (!set.has(base)) return base
  for (let i = 2; ; i++) if (!set.has(`${base}${i}`)) return `${base}${i}`
}

/**
 * 仕事の id を新しくした写し（深いコピー）。部材の id、
 * keepProgress なら固定した1枚の id・片の partId／pieceId・checked もつけ替える。keepProgress でなければ固定した1枚と仕上がりの完了を外す。
 * 履歴（第2.1版）は keepProgress（バックアップ）なら写す（履歴の id は仕事の中だけで重ならなければよいのでそのまま）。
 * keepProgress でなければ外す（送るファイルには入れない）
 */
function rekeyJob(job: Job, newId: (prefix: string) => string, keepProgress: boolean): Job {
  const partIds = new Map<string, string>()
  const parts: Part[] = job.parts.map((p) => {
    const id = newId('part')
    partIds.set(p.id, id)
    return { ...p, id, expr: { W: p.expr.W, H: p.expr.H }, finishedDone: keepProgress ? p.finishedDone : false }
  })
  /** 片の id（`${partId}#n`）の部材の部分をつけ替える */
  const piece = (pieceId: string) => {
    const i = pieceId.lastIndexOf('#')
    if (i < 0) return pieceId
    const to = partIds.get(pieceId.slice(0, i))
    return to === undefined ? pieceId : `${to}${pieceId.slice(i)}`
  }
  const frozenSheets: FrozenSheet[] = keepProgress
    ? job.frozenSheets.map((f) => {
        const copy = JSON.parse(JSON.stringify(f)) as FrozenSheet
        copy.id = newId('frozen')
        for (const pl of copy.layout.placements) {
          pl.partId = partIds.get(pl.partId) ?? pl.partId
          pl.pieceId = piece(pl.pieceId)
        }
        copy.checked = copy.checked.map(piece)
        return copy
      })
    : []
  const history: HistoryEntry[] = keepProgress
    ? job.history.map((h) => ({
        ...h,
        settings: { ...h.settings, sheet: { ...h.settings.sheet } },
        parts: h.parts.map((p) => ({ ...p, expr: { W: p.expr.W, H: p.expr.H } })),
      }))
    : []
  return {
    ...job,
    id: newId('job'),
    settings: { ...job.settings, sheet: { ...job.settings.sheet } },
    parts,
    frozenSheets,
    history,
  }
}

/**
 * 読んだファイル（readTransferFile の file）を今の保存データに足す。
 * - 仕事・部材・固定した1枚の id は振り直し、コピーとして後ろに足す（今ある仕事は変えない）。名前が重なれば「◯◯のコピー」
 * - 前の版の式は、ファイルの中の調整寸法の一覧（file.adjusts）で計算した仕上がり寸法の数字にする。エラーは空にして numbering で返す
 * - 共有（kind: job）：切り出しチェック・仕上がりの完了・履歴は無し。作った日・変えた日は now
 * - バックアップ（kind: backup）：切り出しチェック・仕上がりの完了・履歴も戻す。作った日・変えた日はファイルのまま
 * - 履歴の無い前のファイル（第2.0版まで）は、読むときに空の履歴になっている（readTransferFile → readJob）
 */
export function importTransfer(
  data: AppData,
  file: TransferFile,
  newId: (prefix: string) => string,
  now: Date,
): ImportResult {
  const names = data.jobs.map((j) => j.name)
  const incoming = file.kind === 'job' ? [file.job] : file.jobs
  const keepProgress = file.kind === 'backup'
  const cleared: ClearedSize[] = []
  let replaced = false
  const jobs = incoming.map((src) => {
    // 送るファイルの履歴は取り込まない（rekeyJob で外す）ので、先に外してから置き換える
    const numbered = numberizeJob(keepProgress ? src : { ...src, history: [] }, file.adjusts)
    const job = rekeyJob(numbered.job, newId, keepProgress)
    const name = uniqueJobName(src.name, names)
    names.push(name)
    replaced ||= numbered.report.replaced
    for (const c of numbered.report.cleared) cleared.push({ ...c, jobId: job.id, jobName: name })
    if (keepProgress) return { ...job, name }
    const t = now.toISOString()
    return { ...job, name, createdAt: t, updatedAt: t }
  })
  return {
    data: { ...data, jobs: [...data.jobs, ...jobs] },
    jobIds: jobs.map((j) => j.id),
    message: file.kind === 'job' ? `「${jobs[0].name}」を取り込みました` : `${jobs.length}件の仕事を追加しました`,
    numbering: replaced ? { replaced, cleared } : NO_NUMBERING,
  }
}
