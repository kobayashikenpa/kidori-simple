// 板を減らせるときのお知らせ（仕様書 19.2）：切り代を優先して、今の値から 1mm ずつ小さくして 1mm まで・最後に 0.5mm で計算し直し、
// 必要な板の枚数が減る一番大きい値を知らせる。切り代で減らないときだけ端切りを同じように試す。設定は変えない（知らせるだけ）。
// kidori の hints/saving.ts をもとに、材料ごとの分け・重ね切り（組）・手持ち・フラッシュの部材だけに切り代を足す決まり・
// 部材ごとの切り代の上書きを外し、板は1種類（settings.sheet）にしたもの
import { computeDimensions } from '../dimensions'
import { packJob } from '../packing'
import { round1 } from '../round'
import type { Job, PackingResult } from '../types'

export type SavingKind = 'allowance' | 'trim'

export interface SavingHint {
  /** 変える設定と、その値（mm） */
  change: { kind: SavingKind; value: number }
  /** 今の必要な板の枚数（固定した1枚を含む） */
  from: number
  /** 変えたあとの必要な板の枚数（固定した1枚を含む） */
  to: number
  /** 画面にそのまま出せる文（例：「切り代を 7mm にすると、板が 1 枚減ります」） */
  message: string
}

const KIND_LABEL: Record<SavingKind, string> = { allowance: '切り代', trim: '端切り' }

/** 試す値の最後（0mm は試さない） */
export const SMALLEST_STEP = 0.5

/**
 * 試す値：今の値より小さい整数を大きい値から 1 まで（1mm 刻み）、最後に 0.5。0 は試さない。
 * 今の値が整数なら 今−1 から、小数なら切り捨てた値から。今の値が 0.5 以下なら何も試さない
 * （例：10 → 9…1, 0.5、7.5 → 7…1, 0.5、1 → 0.5、0.5 → なし）。kidori と同じ
 */
export function smallerSteps(current: number): number[] {
  const c = round1(current)
  const out: number[] = []
  for (let v = Math.ceil(c) - 1; v >= 1; v--) out.push(v)
  if (c > SMALLEST_STEP) out.push(SMALLEST_STEP)
  return out
}

/** お知らせの文（kidori の「◯◯を ◯mm にすると、」の形。材料名の代わりに「板」） */
export function savingMessage(kind: SavingKind, value: number, from: number, to: number): string {
  return `${KIND_LABEL[kind]}を ${round1(value)}mm にすると、板が ${from - to} 枚減ります`
}

function pack(job: Job): PackingResult {
  return packJob(job, computeDimensions(job))
}

/** 試した結果で減ったか：必要な枚数が減り、入らない部材が増えない（kidori と同じ） */
function reduced(base: PackingResult, trial: PackingResult): boolean {
  return trial.sheetCount < base.sheetCount && trial.unplaced.length <= base.unplaced.length
}

/**
 * 板を減らせるときのお知らせ（仕様書 19.2）。無ければ null。仕事のデータは書き換えない。板・切り方・刃厚は今のまま。
 * 1. 切り代を `smallerSteps` の値で大きい値から計算し直し、必要な枚数が減った最初の値（＝減る一番大きい値）で知らせる
 * 2. 切り代で減らなければ、端切りを同じように試す
 * 切り代と端切りを同時に変える組み合わせは試さない。固定した1枚（frozenSheets）はそのまま数え、残りの部材だけで試す
 * （packJob と同じ）。今の枚数が 1 枚以下なら試さない。
 * 計算は最大で 1 +（切り代の試す数）+（端切りの試す数）回の packJob。減った所で止める（kidori と同じ結果）
 */
export function findSavingHint(job: Job): SavingHint | null {
  const allowances = smallerSteps(job.settings.allowance)
  const trims = smallerSteps(job.settings.trim)
  if (allowances.length === 0 && trims.length === 0) return null

  const base = pack(job)
  // 1枚以下ならそれ以上減らない
  if (base.sheetCount < 2) return null

  const tryKind = (kind: SavingKind, values: readonly number[]): SavingHint | null => {
    for (const value of values) {
      const trial = pack({ ...job, settings: { ...job.settings, [kind]: value } })
      if (!reduced(base, trial)) continue
      return { change: { kind, value }, from: base.sheetCount, to: trial.sheetCount, message: savingMessage(kind, value, base.sheetCount, trial.sheetCount) }
    }
    return null
  }
  return tryKind('allowance', allowances) ?? tryKind('trim', trims)
}
