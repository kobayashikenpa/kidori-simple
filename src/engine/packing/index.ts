// 木取り計算の入口：部材を片にして、選んだ切り方で1種類の板（settings.sheet）に並べ、切る順番・端材・歩留まりをまとめる。
// kidori の packing/index.ts をもとに、材料ごとの分け・重ね切り（組・端材の行）・手持ち・木取り済み（done）を外したもの。
// - 切り方は設定のとおり（縦切り優先／横切り優先。第1.4版で「おまかせ」をなくした。仕様書 18.2）
// - 帯の並べ方：同じ幅を優先する並べ方と、幅が収まる最初の帯に入れる並べ方の両方を計算し、
//   入らない片が少ないほう → 板が少ないほう → 同じなら同じ幅を優先するほう を採る（仕様書 7。guillotine.ts の chooseWay）
// - 回転してよい片の向き：すでにある帯に長い向きを先に試す並べ方（今まで）と、短い向きを先に試す並べ方も計算し、
//   入らない片が少ないほう → 板が少ないほう → 同じなら今までの並べ方 を採る（仕様書 23。guillotine.ts の chooseLayout）
// - 固定した1枚（frozenSheets）の片は、部材の枚数から引いてから並べる（progress/frozen.ts の frozenDemand）。
//   必要な枚数・全体の歩留まりには、固定した1枚（切り終わりを含む）を足す
import { normalizeSheet } from '../defaults'
import type { DimensionResult, Job, PackingResult, SheetLayout } from '../types'
import { buildCuts } from './cutOrder'
import { chooseLayout, packGuillotine, type OrientFirst, type StripMode } from './guillotine'
import { frozenDemand } from '../progress/frozen'
import { expandPieces, piecesOf, type Piece, type Unplaced } from './pieces'
import { scrapsOf } from './scraps'
import { sheetOrientation, trimRects, usableRect, type BoardSize } from './sheet'
import { combineYield, sheetYield } from './yield'

export { MIN_SCRAP } from './scraps'

/**
 * 並べ方の指定。sameWidthFirst を指定しなければ、同じ幅を優先する並べ方ともう1つの並べ方の両方を計算して、
 * 板が増えないほうを使う（仕様書 7）。true・false はその並べ方だけで計算する（比べるため・テストのため）。
 * orientFirst を指定しなければ、回転してよい片をすでにある帯に置くときの向きを 'long'・'short' の両方で計算して、
 * 板が少なくなるほう（同じなら 'long'）を使う（仕様書 23）。指定するとその向きだけで計算する
 */
export interface PackOptions {
  sameWidthFirst?: boolean
  orientFirst?: OrientFirst
}

interface Layout {
  mode: StripMode
  sheets: SheetLayout[]
  /** 並べられなかった片（横切り優先で長手に入らない片など） */
  unplaced: Piece[]
}

function layout(
  pieces: Piece[],
  board: BoardSize,
  trim: number,
  kerf: number,
  mode: StripMode,
  sameWidthFirst: boolean,
  orientFirst: OrientFirst,
): Layout {
  const usable = usableRect(board, trim, mode)
  const orientation = sheetOrientation(mode)
  const trims = trimRects(board, trim, mode)
  const g = packGuillotine(pieces, usable, kerf, mode, sameWidthFirst, orientFirst)
  const sheets = g.sheets.map((sh, i): SheetLayout => {
    const placements = sh.strips.flatMap((s) => s.items.map((it) => it.placement))
    const y = sheetYield(placements, board)
    return {
      index: i + 1,
      boardWidth: board.width,
      boardLength: board.length,
      orientation,
      trims,
      usable,
      placements,
      cuts: buildCuts(sh, g.frame, board, trim),
      scraps: scrapsOf(sh, g.frame, kerf),
      usedArea: y.usedArea,
      yieldRate: y.yieldRate,
    }
  })
  return { mode, sheets, unplaced: g.unplaced }
}

/** 入らない部材（部材ごとに1つ・部材の並び）：片にできなかった部材と、並べられなかった片の部材 */
function unplacedOf(job: Pick<Job, 'parts'>, known: readonly Unplaced[], pieces: readonly Piece[]): PackingResult['unplaced'] {
  const out: Unplaced[] = [...known]
  for (const p of pieces) {
    if (!out.some((u) => u.partId === p.partId)) out.push({ partId: p.partId, name: p.name, reason: 'tooLarge' })
  }
  const order = new Map(job.parts.map((p, i) => [p.id, i]))
  return out.sort((a, b) => (order.get(a.partId) ?? 0) - (order.get(b.partId) ?? 0))
}

/**
 * 木取りの計算（仕様書 7・8）。dims は computeDimensions(job) の結果（木取り寸法を並べる）。
 * 1. 部材を片にする（枚数0 の行は除く。寸法のエラーは skipped。固定した1枚の片を引く）
 * 必要な枚数（sheetCount）と全体の歩留まりは、固定した1枚（切り終わりを含む）と計算した1枚を合わせて出す
 * 2. 板に向きの入らない部材は unplaced（tooLarge）。向きは設定の切り方の範囲で判定する
 * 3. 設定の切り方で、並べ方（同じ幅の優先 × すでにある帯に先に試す向き）を比べて並べ（chooseLayout）、
 *    切る順番・端材・歩留まりを付ける
 * 仕事のデータは書き換えない
 */
export function packJob(job: Job, dims: DimensionResult, options: PackOptions = {}): PackingResult {
  const { kerf, trim, cutMode } = job.settings
  // 自由入力で妻手・長手を逆に入れても同じ板として計算する
  const sheet = normalizeSheet(job.settings.sheet)
  const board: BoardSize = { width: sheet.width, length: sheet.length }
  const ex = expandPieces(job, dims, frozenDemand(job))
  const { pieces, unplaced } = piecesOf(ex.runs, board, trim, cutMode)
  const rotatable = pieces.some((p) => p.orientations.length > 1)
  const chosen = chooseLayout(
    options,
    (way, orient) => layout(pieces, board, trim, kerf, cutMode, way, orient),
    rotatable,
  )
  // 固定した1枚（切り終わりを含む）と計算した1枚を合わせて数える（architecture.md 3.3。暫定）
  const counted = [...job.frozenSheets.map((f) => f.layout), ...chosen.sheets]
  const total = combineYield(counted.map((s) => ({ usedArea: s.usedArea, boardArea: s.boardWidth * s.boardLength })))
  return {
    sheet,
    mode: chosen.mode,
    sheets: chosen.sheets,
    sheetCount: counted.length,
    yieldRate: total.yieldRate,
    unplaced: unplacedOf(job, unplaced, chosen.unplaced),
    skipped: ex.skipped,
  }
}
