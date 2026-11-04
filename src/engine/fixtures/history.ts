// 履歴（第2.1版）のテストで使う手助け：見本の棚の今の内容を履歴に残す
import { computeDimensions } from '../dimensions'
import { addHistory, historyEntry } from '../history'
import { packJob } from '../packing'
import type { Job } from '../types'

/** 今の設定と部材を計算して履歴に残した仕事（id・メモ・日時は引数） */
export function withHistory(job: Job, id: string, memo = '', now = new Date('2026-11-04T09:00:00.000Z')): Job {
  const r = addHistory(job, historyEntry(job, packJob(job, computeDimensions(job)), { id, memo, now }))
  if (!r.ok) throw new Error(r.message)
  return r.job
}
