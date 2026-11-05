// 部材の表の［木取り］のタブ（仕様書 15.1・5.1）：仕上がりのタブと同じ表の形で、番号・名前・木取り寸法 幅・長さ（W・H。仕様書 27.5）・枚数（切った数）を見るだけ。
// 押しても編集しない（入力は［仕上がり］のタブ）。枚数 0 は「切らない」、枚数が空の行は薄く出す。
// 木取り寸法は engine（computeDimensions の cutByAxis）、切った数は engine（partCutProgress）の結果を並べるだけ
// 第2.4版（仕様書 28.1。2026-11-05 オーナー「木取りでも見れるようにはして」）：幅・長さのセルを押すと、選んだ印（枠）を付け、
// 画面の下の式の欄にその部材の仕上がりの式（または数字）を出す（見るだけ。欄を押しても入力しない・✓ は無い）。
// もう一度押すか、ほかの所を押すと欄を閉じる
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { hasName } from '../../engine/parts'
import { sizeLabel } from '../../engine/size'
import type { PartCutProgress } from '../../engine/progress/partProgress'
import type { Axis, DimensionResult, Job } from '../../engine/types'
import { fmt } from '../format'
import { CELL_COL_LABEL } from '../cellSelect'
import { cutDimCell, cutQuantityText } from '../partsTable'
import { useOutsideEnd, usePadHeight } from '../useGrid'

/** 画面での寸法の呼び方（W は「幅」、H は「長さ」。仕様書 27.5） */
const AXIS_LABEL: Record<Axis, string> = { W: CELL_COL_LABEL.W, H: CELL_COL_LABEL.H }

interface Props {
  job: Job
  dims: DimensionResult
  progress: readonly PartCutProgress[]
}

/** 押して選んだセル（部材の id と 幅・長さ） */
interface Picked {
  partId: string
  axis: Axis
}

export function CutTable({ job, dims, progress }: Props) {
  const parts = job.parts
  const [picked, setPicked] = useState<Picked | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  // 部材が無くなった（仕事を切り替えた・消した）ら、選んでいないことにする
  const pickedRow = picked ? parts.findIndex((p) => p.id === picked.partId) : -1
  const pickedPart = pickedRow >= 0 ? parts[pickedRow] : undefined
  const on = picked !== null && pickedPart !== undefined
  // ほかの所（表と欄の外）を押したら閉じる
  useOutsideEnd(on, (t) => !!tableRef.current?.contains(t) || !!dockRef.current?.contains(t), () => setPicked(null))
  // 欄の高さ（表の下に同じだけ余白を足して、最後の行が欄に隠れないようにする）
  const dockH = usePadHeight(dockRef, on ? `${picked.partId}:${picked.axis}` : null)

  if (parts.length === 0) return <p className="placeholder">部材はまだありません</p>

  const press = (partId: string, axis: Axis) =>
    setPicked((cur) => (cur && cur.partId === partId && cur.axis === axis ? null : { partId, axis }))
  const barText = on ? sizeLabel(pickedPart.expr[picked.axis]) : ''
  const barWho = pickedPart ? (hasName(pickedPart) ? pickedPart.name : `#${pickedRow + 1}`) : ''

  return (
    <>
    <div className="pt cut" ref={tableRef} role="table" aria-label="部材の表（木取り寸法。見るだけ。幅・長さを押すと仕上がりの式を下に出す）">
      <div className="pt-row pt-head" role="row">
        <span role="columnheader">番号</span>
        <span role="columnheader">名前</span>
        <span role="columnheader">{AXIS_LABEL.W}</span>
        <span role="columnheader">{AXIS_LABEL.H}</span>
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
          const isPicked = on && picked.partId === part.id && picked.axis === axis
          return (
            <button
              type="button"
              role="cell"
              className={`pt-cell pt-dim${c.kind === 'error' ? ' bad' : ''}${isPicked ? ' picked' : ''}`}
              aria-label={`${label} の ${AXIS_LABEL[axis]}：${text}（押すと仕上がりの式を下に出す）`}
              aria-pressed={isPicked}
              onClick={() => press(part.id, axis)}
            >
              {c.kind === 'error' ? 'エラー' : c.kind === 'empty' ? null : <span className="num">{fmt(c.value)}</span>}
            </button>
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
      {on && <div className="pt-spacer" style={{ height: dockH }} aria-hidden="true" />}
      {on &&
        createPortal(
          <div className="fxdock" ref={dockRef}>
            <div className="fxdock-in">
              <div className="fx-row">
                <div
                  className="fx-bar view"
                  role="status"
                  aria-label={`${barWho} の 仕上がりの${AXIS_LABEL[picked.axis]}：${barText || '空'}（見るだけ）`}
                >
                  <span className="fx-text num">
                    <span className="fx-chars">{barText}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
