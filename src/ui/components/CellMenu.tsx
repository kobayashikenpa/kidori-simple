// 選んでいるセル（範囲）を長押しして出るメニュー（仕様書 17.2。下から出るシート）：
// 切り取り・コピー・貼り付け・クリア／行を上に挿入・行を削除／複製・回転してよい／回転しない・仕上がった／まだ。
// 回転と仕上がりは選んでいる行の部材全部に当て、押してもメニューは開いたまま（今の状態が見えるように）。ほかはメニューを閉じる。
// 行を削除はいつも確かめる（ほかの部材の式が消す部材の寸法を使っていれば示す）。
// 計算は store の reducer（engine/clipboard/cells.ts など）に任せる。押せる／押せないの判定も engine の selectedPartIds を使う
import { useState } from 'react'
import { selectedPartIds } from '../../engine/clipboard/cells'
import { partLabel, partLabelAt } from '../../engine/parts'
import type { CellClip, CellRange, Job } from '../../engine/types'
import { currentJob, type ReduceResult, type StoreAction } from '../../store/reducer'
import { clipText, flagState, pasteText } from '../cellSelect'
import { referencingOthers } from '../partsTable'
import { Segmented } from './Segmented'
import { Sheet } from './Sheet'

interface Props {
  job: Job
  range: CellRange
  /** 見出し（「天板 の W」「3行×2列（2〜4行目）」） */
  title: string
  clip: CellClip | null
  dispatch: (action: StoreAction) => ReduceResult
  onClose: () => void
  /** 操作のあとの知らせ（表の上に短く出す） */
  onNotice: (text: string) => void
  onError: (message: string | null) => void
  /** 「行を上に挿入」：index の位置に空の行を入れて、名前の入力を始めてほしい（呼ぶ側） */
  onInsertAbove: (index: number) => void
  /** 行を削除したあと（選ぶ範囲を直してほしい） */
  onRowsDeleted: () => void
}

type Rotate = 'fixed' | 'free' | 'some'
type Done = 'open' | 'done' | 'some'

export function CellMenu({ job, range, title, clip, dispatch, onClose, onNotice, onError, onInsertAbove, onRowsDeleted }: Props) {
  const [confirm, setConfirm] = useState(false)
  const ids = selectedPartIds(job, range)
  const parts = job.parts.filter((p) => ids.includes(p.id))
  const hasParts = parts.length > 0
  const canInsert = range.top < job.parts.length
  const count = parts.length > 1 ? `（${parts.length}個の部材）` : ''

  /** 1回の操作。失敗したら理由を出して false */
  const run = (action: StoreAction): ReduceResult => {
    const r = dispatch(action)
    onError(r.ok ? null : r.message)
    return r
  }

  const copy = (cut: boolean) => {
    const r = run(cut ? { type: 'cutCells', range } : { type: 'copyCells', range })
    if (!r.ok) return
    onNotice(cut ? '切り取りました。貼る所を長押し→貼り付け' : 'コピーしました。貼る所を長押し→貼り付け')
    onClose()
  }
  const paste = () => {
    const r = run({ type: 'pasteCells', range })
    if (!r.ok) return
    onNotice(r.paste ? pasteText(r.paste.pasted, r.paste.skipped) : '貼りました')
    onClose()
  }
  const clear = () => {
    if (!run({ type: 'clearCells', range }).ok) return
    onNotice('クリアしました')
    onClose()
  }
  const insertAbove = () => {
    onError(null)
    onClose()
    onInsertAbove(range.top)
  }
  const duplicate = () => {
    let last: ReduceResult | null = null
    for (const id of ids) {
      last = run({ type: 'duplicatePart', partId: id })
      if (!last.ok) return
    }
    if (!last?.ok) return
    if (ids.length === 1) {
      const next = currentJob(last.state)
      const copyName = next && last.id ? partLabel(next, last.id) : ''
      const index = job.parts.findIndex((p) => p.id === ids[0])
      onNotice(`${partLabelAt(job.parts[index], index)} を複製して、すぐ下に「${copyName}」を足しました`)
    } else {
      onNotice(`${ids.length}個の部材を複製して、それぞれのすぐ下に足しました`)
    }
    onClose()
  }
  const deleteRows = () => {
    const n = ids.length
    if (!run({ type: 'deleteRows', range }).ok) return
    onNotice(`${n}個の部材を削除しました`)
    onRowsDeleted()
    onClose()
  }
  /** 回転・仕上がり：選んでいる行の部材全部に当てる（メニューは開いたまま） */
  const updateAll = (patch: { rotatable?: boolean; finishedDone?: boolean }) => {
    for (const p of parts) {
      const key = 'rotatable' in patch ? 'rotatable' : 'finishedDone'
      if (p[key] === patch[key]) continue
      if (!run({ type: 'updatePart', partId: p.id, patch }).ok) return
    }
  }

  const rotation = flagState(parts.map((p) => p.rotatable))
  const done = flagState(parts.map((p) => p.finishedDone))
  const refs = confirm ? referencingOthers(job.parts, ids) : []
  const clipNow = clipText(clip)

  return (
    <Sheet title={title} onClose={onClose}>
      {confirm ? (
        <div className="confirm-box stack" role="alertdialog" aria-label="行を削除の確認">
          {refs.length > 0 && (
            <p className="confirm-text">
              <b>{refs.map((r) => `${r.name}（${r.axes.join('・')}）`).join('・')}</b>{' '}
              の式が、消す部材の寸法を使っています。削除すると、その式はエラーになります。
            </p>
          )}
          <p className="confirm-text">
            {ids.length === 1 ? (
              <>「{partLabelAt(parts[0], job.parts.indexOf(parts[0]))}」を削除しますか？</>
            ) : (
              <>
                <b className="num">{ids.length}個</b>の部材を削除しますか？
              </>
            )}
          </p>
          <div className="foot">
            <button type="button" className="btn" onClick={() => setConfirm(false)}>
              やめる
            </button>
            <button type="button" className="btn danger solid" onClick={deleteRows}>
              削除する
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="cm-group">
            <div className="cm-keys four">
              <button type="button" className="btn" onClick={() => copy(true)}>
                切り取り
              </button>
              <button type="button" className="btn" onClick={() => copy(false)}>
                コピー
              </button>
              <button type="button" className="btn primary" disabled={!clip} onClick={paste}>
                貼り付け
              </button>
              <button type="button" className="btn" disabled={!hasParts} onClick={clear}>
                クリア
              </button>
            </div>
            <p className="cm-clip">{clipNow ?? 'コピーしたものはありません'}</p>
          </div>
          <div className="cm-keys two">
            <button type="button" className="btn" disabled={!canInsert} onClick={insertAbove}>
              行を上に挿入
            </button>
            <button type="button" className="btn danger" disabled={!hasParts} onClick={() => setConfirm(true)}>
              行を削除
            </button>
            <button type="button" className="btn wide" disabled={!hasParts} onClick={duplicate}>
              複製（すぐ下に足す）
            </button>
          </div>
          <fieldset className="cm-field" disabled={!hasParts}>
            <legend>回転{count}</legend>
            <Segmented<Rotate>
              ariaLabel="回転"
              value={rotation === 'all' ? 'free' : rotation === 'none' ? 'fixed' : 'some'}
              options={[
                { value: 'fixed', label: '回転しない' },
                { value: 'free', label: '回転してよい ↺' },
              ]}
              onChange={(v) => updateAll({ rotatable: v === 'free' })}
            />
          </fieldset>
          <fieldset className="cm-field" disabled={!hasParts}>
            <legend>仕上がり{count}</legend>
            <Segmented<Done>
              ariaLabel="仕上がり"
              value={done === 'all' ? 'done' : done === 'none' ? 'open' : 'some'}
              options={[
                { value: 'open', label: 'まだ' },
                { value: 'done', label: '仕上がった' },
              ]}
              onChange={(v) => updateAll({ finishedDone: v === 'done' })}
            />
          </fieldset>
        </>
      )}
    </Sheet>
  )
}
