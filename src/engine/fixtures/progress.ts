// 切り出しチェック（progress）のテストで使う手助け（見本の棚を計算して、i 枚目を固定する）
import { computeDimensions } from '../dimensions'
import { packJob } from '../packing'
import type { Job, PackingResult } from '../types'
import { freezeSheet } from '../progress/frozen'

export const NOW = new Date('2026-10-20T09:00:00.000Z')
export const LATER = new Date('2026-10-20T10:00:00.000Z')

export const dimsOf = (job: Job) => computeDimensions(job)
export const pack = (job: Job): PackingResult => packJob(job, dimsOf(job))

/** 今の計算の i 枚目（0 から）を固定した1枚として足す。checked は partId の片を先頭から n 個（省略で空） */
export function freezeAt(job: Job, i: number, check?: { partId: string; n: number }): Job {
  const r = pack(job)
  const f = freezeSheet(job, r.mode, r.sheets[i], `sheet-${job.frozenSheets.length + 1}`, NOW)
  if (check) {
    f.checked = f.layout.placements.filter((p) => p.partId === check.partId).slice(0, check.n).map((p) => p.pieceId)
    if (f.checked.length === f.layout.placements.length) f.completedAt = NOW.toISOString()
  }
  return { ...job, frozenSheets: [...job.frozenSheets, f] }
}

/** 部材の一部を書き換えた写し */
export function withPart(job: Job, partId: string, patch: Partial<Job['parts'][number]>): Job {
  return { ...job, parts: job.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)) }
}
