// 部材の表の［木取り］のタブ（仕様書 15.1・5.1）：仕上がりのタブと同じ表の形で、番号・名前・木取り寸法 W・H・枚数（切った数）を見るだけ。
// 押しても編集しない（入力は［仕上がり］のタブ）。枚数 0 は「切らない」、枚数が空の行は薄く出す。
// 木取り寸法は engine（computeDimensions の cutByAxis）、切った数は engine（partCutProgress）の結果を並べるだけ
import { hasName } from '../../engine/parts'
import type { PartCutProgress } from '../../engine/progress/partProgress'
import type { Axis, DimensionResult, Job } from '../../engine/types'
import { fmt } from '../format'
import { cutDimCell, cutQuantityText } from '../partsTable'

interface Props {
  job: Job
  dims: DimensionResult
  progress: readonly PartCutProgress[]
}

export function CutTable({ job, dims, progress }: Props) {
  const parts = job.parts
  if (parts.length === 0) return <p className="placeholder">部材はまだありません</p>
  return (
    <div className="pt cut" role="table" aria-label="部材の表（木取り寸法。見るだけ）">
      <div className="pt-row pt-head" role="row">
        <span role="columnheader">番号</span>
        <span role="columnheader">名前</span>
        <span role="columnheader">W</span>
        <span role="columnheader">H</span>
        <span role="columnheader">枚数</span>
      </div>
      {parts.map((part, i) => {
        const d = dims.parts.find((x) => x.partId === part.id)
        const prog = progress.find((x) => x.partId === part.id)
        const named = hasName(part)
        const label = named ? part.name : `#${i + 1}`
        const noCut = part.quantity === 0
        const rowClass = ['pt-row', 'part', part.quantity === null ? 'noqty' : '', noCut ? 'nocut' : ''].filter(Boolean).join(' ')
        const dimEl = (axis: Axis) => {
          const c = cutDimCell(part, d, axis)
          const text = c.kind === 'empty' ? '空' : c.kind === 'error' ? 'エラー' : fmt(c.value)
          return (
            <span role="cell" className={`pt-cell pt-dim${c.kind === 'error' ? ' bad' : ''}`} aria-label={`${axis} ${text}`}>
              {c.kind === 'error' ? 'エラー' : c.kind === 'empty' ? null : <span className="num">{fmt(c.value)}</span>}
            </span>
          )
        }
        const allCut = prog !== undefined && prog.done >= prog.total
        return (
          <div key={part.id} className="pt-item" role="rowgroup">
            <div className={rowClass} role="row">
              <span role="cell" className="pt-cell pt-no">
                <span className="num">{named ? i + 1 : `#${i + 1}`}</span>
                {part.rotatable && (
                  <span className="pt-rot" aria-label="回転してよい">
                    ↺
                  </span>
                )}
              </span>
              <span role="cell" className="pt-cell pt-name">
                {named ? part.name : ''}
              </span>
              {dimEl('W')}
              {dimEl('H')}
              <span role="cell" className="pt-cell pt-qty" aria-label={`${label} の枚数：${part.quantity === null ? '空' : cutQuantityText(part.quantity)}`}>
                <span className={`pt-qty-n${noCut ? ' small' : ''}`}>{cutQuantityText(part.quantity)}</span>
                {prog && (
                  <span className={`pt-cutn num${allCut ? ' all' : ''}`}>
                    切った {prog.done}/{prog.total}
                  </span>
                )}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
