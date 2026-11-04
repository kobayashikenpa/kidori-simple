// ファイルから取り込む：読み込みと、確認の画面に出すまとめ（仕様書 15.3・15.4）。例外を投げない。
// kidori の store/transfer/read.ts を参考に作り直したもの（版の移し替え・一部だけ読む直しは無い。形が違えば読まない）
import { isAdjust, isRecord, readJob, readJobs } from '../shape'
import { LEGACY_TRANSFER_APP, MAX_TRANSFER_SIZE, READ_FAILED, TRANSFER_APP, TRANSFER_VERSION, type BackupFile, type JobFile } from './envelope'

export type TransferRead =
  /** 共有された仕事：「共有された仕事：本棚（部材 4件）」 */
  | { ok: true; kind: 'job'; file: JobFile; summary: { jobName: string; partCount: number } }
  /** バックアップ：仕事の数と名前 */
  | { ok: true; kind: 'backup'; file: BackupFile; summary: { jobCount: number; jobNames: string[] } }
  | { ok: false; message: string }

const failed: TransferRead = { ok: false, message: READ_FAILED }

const isAdjustList = (v: unknown): boolean => Array.isArray(v) && v.every(isAdjust)

/**
 * 選んだファイルの中身（文字列）を読む。
 * 空・JSON でない・形が違う・app が kidori-simple でない（kidori のファイルを含む）・版が違う・20MB 超は「読み込めませんでした」。
 * 仕事・部材・調整寸法の形の確かめは保存データの読み込みと同じ（engine/shape.ts）
 */
export function readTransferFile(text: string): TransferRead {
  try {
    if (typeof text !== 'string' || text.length > MAX_TRANSFER_SIZE) return failed
    const body = text.replace(/^﻿/, '')
    if (body.trim() === '') return failed
    let data: unknown
    try {
      data = JSON.parse(body)
    } catch {
      return failed
    }
    if (!isRecord(data) || (data.app !== TRANSFER_APP && data.app !== LEGACY_TRANSFER_APP) || data.version !== TRANSFER_VERSION) return failed
    if (!isAdjustList(data.adjusts)) return failed
    if (data.kind === 'job') {
      // 第1.3版までの切り方「おまかせ」は縦切り優先にして読む（仕様書 18.2）
      const job = readJob(data.job)
      if (!job) return failed
      const file: JobFile = { app: TRANSFER_APP, kind: 'job', version: TRANSFER_VERSION, job, adjusts: data.adjusts as JobFile['adjusts'] }
      return { ok: true, kind: 'job', file, summary: { jobName: file.job.name, partCount: file.job.parts.length } }
    }
    if (data.kind === 'backup') {
      const jobs = readJobs(data.jobs)
      if (!jobs) return failed
      const file: BackupFile = { app: TRANSFER_APP, kind: 'backup', version: TRANSFER_VERSION, jobs, adjusts: data.adjusts as BackupFile['adjusts'] }
      return { ok: true, kind: 'backup', file, summary: { jobCount: file.jobs.length, jobNames: file.jobs.map((j) => j.name) } }
    }
    return failed
  } catch {
    return failed
  }
}
