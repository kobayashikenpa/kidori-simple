// 固定した1枚：画面に出ていた1枚をまるごと写して持つ。写しから描き、写しからチェックの一覧を出すので、
// 部材や設定が変わっても固定した1枚は動かない（仕様書 8）。
// kidori の progress/frozen.ts をもとに、材料（boardId・材料名・厚み）・木目・重ね切り・手持ち・端材の行・
// 材料ごとのまとめ（materialSummaries ほか）と、残りの材料の表示（sheetProgress）を外したもの
import { normalizeSheet } from '../defaults'
import { cutQuantity, partLabels } from '../parts'
import { round1 } from '../round'
import type { DimensionResult, FrozenSheet, Job, PartDimensions, SheetLayout } from '../types'

/** 1枚の写し（深いコピー）。元の結果とつながりを持たない */
function copyLayout(layout: SheetLayout): SheetLayout {
  return JSON.parse(JSON.stringify(layout)) as SheetLayout
}

/**
 * 画面に出ている1枚を写して、固定した1枚を作る（チェックは空）。
 * 板（妻手・長手をそろえる）・刃厚・端切りは job.settings から写す。mode はその1枚を並べた切り方（PackingResult.mode）
 */
export function freezeSheet(
  job: Pick<Job, 'settings'>,
  mode: 'vertical' | 'horizontal',
  layout: SheetLayout,
  id: string,
  now: Date,
): FrozenSheet {
  return {
    id,
    sheet: normalizeSheet(job.settings.sheet),
    mode,
    kerf: job.settings.kerf,
    trim: job.settings.trim,
    layout: copyLayout(layout),
    checked: [],
    frozenAt: now.toISOString(),
  }
}

/** 固定した1枚（切り終わりを含む）の片の数（部材の id → 片の数）。packJob で部材の枚数から引く */
export function frozenDemand(job: Pick<Job, 'frozenSheets'>): Map<string, number> {
  const out = new Map<string, number>()
  for (const s of job.frozenSheets) {
    for (const p of s.layout.placements) out.set(p.partId, (out.get(p.partId) ?? 0) + 1)
  }
  return out
}

// ---------- 表示用のまとめ ----------

export interface FrozenDrift {
  partId: string
  /** 今の部材の表示用の名前（名前が空なら #行番号。部材が無ければ写しの名前） */
  name: string
  /** size：木取り寸法が違う（エラーで出ないときも）／count：固定した片の数 ＞ 今の枚数（枚数が空は 0 とみなす）／removed：部材が無い */
  reason: 'size' | 'count' | 'removed'
}

export interface FrozenSheetView {
  sheet: FrozenSheet
  /** 「部材が変わっています」。空なら変わっていない。写しの片の並びで、部材ごとに1つ */
  drift: FrozenDrift[]
  /** 切り終わり（completedAt がある） */
  complete: boolean
}

/** 今の木取り寸法の表示（W×H。片の sizeLabel と同じ形）。寸法が出なければ null */
function currentSizeLabel(d: PartDimensions | undefined): string | null {
  if (!d || !d.cut || d.errors.length > 0) return null
  return `${round1(d.cut.W)}×${round1(d.cut.H)}`
}

/**
 * 固定した1枚ごとの表示用のまとめ（frozenSheets の並び）。dims は computeDimensions(job) の結果。
 * 1つの部材に理由が重なったら removed → count → size の順で1つにする（固定は外さない）
 */
export function frozenSheetViews(job: Pick<Job, 'parts' | 'frozenSheets'>, dims: DimensionResult): FrozenSheetView[] {
  const demand = frozenDemand(job)
  const partById = new Map(job.parts.map((p) => [p.id, p]))
  const labels = partLabels(job.parts)
  const dimById = new Map(dims.parts.map((d) => [d.partId, d]))
  return job.frozenSheets.map((sheet): FrozenSheetView => {
    const drift: FrozenDrift[] = []
    const seen = new Set<string>()
    for (const pl of sheet.layout.placements) {
      if (seen.has(pl.partId)) continue
      seen.add(pl.partId)
      const part = partById.get(pl.partId)
      let reason: FrozenDrift['reason'] | null = null
      if (!part) reason = 'removed'
      else if ((demand.get(pl.partId) ?? 0) > cutQuantity(part.quantity)) reason = 'count'
      else {
        const label = currentSizeLabel(dimById.get(part.id))
        const labels = sheet.layout.placements.filter((x) => x.partId === pl.partId).map((x) => x.sizeLabel)
        if (label === null || labels.some((l) => l !== label)) reason = 'size'
      }
      if (reason) drift.push({ partId: pl.partId, name: labels.get(pl.partId) ?? pl.name, reason })
    }
    return { sheet, drift, complete: sheet.completedAt !== undefined }
  })
}
