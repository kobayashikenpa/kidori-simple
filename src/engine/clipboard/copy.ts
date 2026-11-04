// 部材の複製（番号のメニューの「複製」。仕様書 15.1）。新しく作ったもの（kidori には無い）。
// 第1.1版の部材まるごとのコピー・貼り付け（copyParts・previewPaste・applyPaste）は第1.2版でなくした
// （セルのコピーと貼り付けは cells.ts。仕様書 16.1）。
// 仕事は書き換えず、新しい仕事を返す（updatedAt は保存の側で付ける）
import { normalizePartName } from '../formula/tokenize'
import { hasName } from '../parts'
import type { Job, Part } from '../types'

/** 名前のある部材の、そろえた名前（重なりの判定は名前のある部材どうしだけ） */
function namesOf(parts: readonly Pick<Part, 'name'>[]): Set<string> {
  return new Set(parts.filter(hasName).map((p) => normalizePartName(p.name)))
}

const COPY = 'のコピー'

/**
 * 複製の名前：「棚板のコピー」、あれば「棚板のコピー2」「棚板のコピー3」…（空いている一番小さい番号）。
 * 「棚板のコピー」「棚板のコピー2」を複製するときも「棚板」をもとにする（のコピーのコピー にしない）。
 * 今の部材と比べるのは normalizePartName でそろえた名前。名前が空なら空のまま（仕様書 15.1）
 */
export function duplicateName(job: Pick<Job, 'parts'>, name: string): string {
  if (name.trim() === '') return ''
  const m = new RegExp(`^(.+)${COPY}[0-9０-９]*$`).exec(name)
  const base = m ? m[1] : name
  const taken = namesOf(job.parts)
  for (let n = 1; ; n++) {
    const candidate = n === 1 ? `${base}${COPY}` : `${base}${COPY}${n}`
    if (!taken.has(normalizePartName(candidate))) return candidate
  }
}

export type DuplicateResult = { ok: true; job: Job; partId: string } | { ok: false; message: string }

/**
 * 部材の複製：W・H・枚数・回転を写し、名前は duplicateName、元の部材のすぐ後ろに足す。
 * id は newId('part')（partId で返す。画面で編集を開くため）、仕上がりの完了は外す
 */
export function duplicatePart(job: Job, partId: string, newId: (prefix: string) => string): DuplicateResult {
  const i = job.parts.findIndex((p) => p.id === partId)
  if (i < 0) return { ok: false, message: '部材が見つかりません' }
  const src = job.parts[i]
  const part: Part = {
    id: newId('part'),
    name: duplicateName(job, src.name),
    expr: { W: src.expr.W, H: src.expr.H },
    quantity: src.quantity,
    rotatable: src.rotatable,
    finishedDone: false,
  }
  return { ok: true, job: { ...job, parts: [...job.parts.slice(0, i + 1), part, ...job.parts.slice(i + 1)] }, partId: part.id }
}
