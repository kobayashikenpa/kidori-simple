// 仕事ごとの履歴とメモ（第2.1版。仕様書 25.1）：木取りの画面の結果の下に置く。
// - メモの欄（スマホのキーボード）と「履歴に残す」。押したときだけ残す（自動では残さない）。残したらメモの欄は空にする
// - その下にこの仕事の履歴の一覧（新しい順・最大 20件）。1行に メモ（空なら「メモなし」）・日時・板のサイズ・必要な枚数・歩留まり・部材の数
// - 行を長押し（押しても）でメニュー：この内容に戻す（確認つき）・メモを直す・削除（確認つき）。出し方は仕事の画面（JobsScreen）と同じ Sheet
// 残す・戻す・メモ・削除は store のアクション（engine/history）。画面では計算しない
import { useState, type FormEvent, type KeyboardEvent } from 'react'
import { HISTORY_LIMIT } from '../../engine/history'
import type { HistoryEntry, Job } from '../../engine/types'
import type { ReduceResult, StoreAction } from '../../store/reducer'
import { historyMeta, historyTitle } from '../kidoriView'
import { useLongPress } from '../useLongPress'
import { Help } from './Help'
import { Sheet } from './Sheet'

/** 長押しのメニューで、いま何をしているか（menu：3つのボタン） */
type Mode = { kind: 'menu' | 'restore' | 'memo' | 'delete'; historyId: string } | null

interface Props {
  job: Job
  dispatch: (action: StoreAction) => ReduceResult
}

/** スマホのキーボードの「完了」（Enter）はキーボードを閉じるだけ（履歴は「履歴に残す」を押したときだけ残す） */
const blurOnEnter = (e: KeyboardEvent<HTMLInputElement>) => {
  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
  e.preventDefault()
  e.currentTarget.blur()
}

export function HistoryPanel({ job, dispatch }: Props) {
  const [memo, setMemo] = useState('')
  const [mode, setMode] = useState<Mode>(null)
  const [memoText, setMemoText] = useState('')
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const longPress = useLongPress()
  const history = job.history

  const reset = () => setMode(null)

  const add = () => {
    const full = history.length >= HISTORY_LIMIT
    const r = dispatch({ type: 'addHistory', memo })
    if (!r.ok) {
      setNotice({ ok: false, text: r.message })
      return
    }
    setMemo('')
    setNotice({
      ok: true,
      text: full ? `履歴に残しました。${HISTORY_LIMIT}件を超えたので、一番古いものを消しました` : '履歴に残しました',
    })
  }

  const openMenu = (e: HistoryEntry) => {
    setNotice(null)
    setMode({ kind: 'menu', historyId: e.id })
  }

  const restore = (e: HistoryEntry) => {
    const r = dispatch({ type: 'restoreHistory', historyId: e.id })
    reset()
    setNotice(r.ok ? { ok: true, text: `「${historyTitle(e)}」の内容に戻しました` } : { ok: false, text: r.message })
  }

  const startMemo = (e: HistoryEntry) => {
    setMemoText(e.memo)
    setMode({ kind: 'memo', historyId: e.id })
  }

  const submitMemo = (ev: FormEvent, e: HistoryEntry) => {
    ev.preventDefault()
    const r = dispatch({ type: 'setHistoryMemo', historyId: e.id, memo: memoText })
    reset()
    if (!r.ok) setNotice({ ok: false, text: r.message })
  }

  const remove = (e: HistoryEntry) => {
    const r = dispatch({ type: 'removeHistory', historyId: e.id })
    reset()
    setNotice(r.ok ? { ok: true, text: `「${historyTitle(e)}」の履歴を消しました` } : { ok: false, text: r.message })
  }

  /** メニューを出している履歴（消えていたら出さない） */
  const entry = mode ? history.find((h) => h.id === mode.historyId) : undefined
  const frozen = job.frozenSheets.length > 0

  return (
    <div className="hist">
      <h3>
        <Help title={`履歴（${history.length}件）`}>
          今の設定（板のサイズ・刃厚・端切り・切り代・切り方）と部材を、メモをつけてこの仕事の中に残せます。寸法を変えて試す前などに「履歴に残す」を押してください（自動では残りません）。
          残した行を押すか長押しすると、この内容に戻す・メモを直す・削除 のメニューが出ます。
          戻すと、今の設定と部材がその内容に置き換わり、切り出しチェックと固定した1枚は外れます。
          1つの仕事に {HISTORY_LIMIT}件まで残せ、それを超えると一番古いものから消えます。
        </Help>
      </h3>

      <div className="card stack hist-add">
        <div className="field">
          <label className="label" htmlFor="hist-memo">
            メモ
          </label>
          <input
            id="hist-memo"
            className="input"
            value={memo}
            enterKeyHint="done"
            onKeyDown={blurOnEnter}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>
        <button type="button" className="btn primary wide" onClick={add}>
          履歴に残す
        </button>
        {notice && (
          <p className={`msg ${notice.ok ? 'ok' : 'err'}`} role={notice.ok ? 'status' : 'alert'} style={{ margin: 0 }}>
            {notice.text}
          </p>
        )}
      </div>

      {history.length === 0 ? (
        <p className="lead hist-none">まだ履歴がありません。メモを入れて「履歴に残す」を押すと、ここに出ます。</p>
      ) : (
        <>
          <ul className="job-list hist-list">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="job-row"
                  aria-label={`履歴 ${historyTitle(h)}、${historyMeta(h)}。押すか長押しでメニュー`}
                  {...longPress(
                    () => openMenu(h),
                    () => openMenu(h),
                  )}
                >
                  <span className={`job-name hist-memo${h.memo === '' ? ' none' : ''}`}>{historyTitle(h)}</span>
                  <span className="job-meta num">{historyMeta(h)}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="job-hint">押すか長押しでメニュー</p>
        </>
      )}

      {mode && entry && (
        <Sheet title={historyTitle(entry)} onClose={reset}>
          {mode.kind === 'memo' ? (
            <form className="stack" onSubmit={(ev) => submitMemo(ev, entry)}>
              <div className="field">
                <label className="label" htmlFor="hist-memo-edit">
                  メモ
                </label>
                <input
                  id="hist-memo-edit"
                  className="input"
                  value={memoText}
                  enterKeyHint="done"
                  autoFocus
                  onChange={(e) => setMemoText(e.target.value)}
                />
              </div>
              <div className="foot">
                <button type="button" className="btn" onClick={() => setMode({ kind: 'menu', historyId: entry.id })}>
                  やめる
                </button>
                <button type="submit" className="btn primary">
                  メモを決める
                </button>
              </div>
            </form>
          ) : mode.kind === 'restore' ? (
            <div className="stack confirm-box" role="alertdialog" aria-label="この内容に戻す確認">
              <p style={{ margin: 0 }}>
                {historyMeta(entry)} の内容に戻しますか？今の設定（板のサイズ・刃厚・端切り・切り代・切り方）と部材が、この履歴の内容に置き換わります。
                <strong>
                  切り出しチェックはすべて外れ{frozen ? '、固定した1枚も外して並べ直します' : 'ます'}。
                </strong>
                今の内容を残したいときは、先に「履歴に残す」を押してください。
              </p>
              <div className="foot">
                <button type="button" className="btn" onClick={() => setMode({ kind: 'menu', historyId: entry.id })}>
                  やめる
                </button>
                <button type="button" className="btn danger solid" onClick={() => restore(entry)}>
                  戻す
                </button>
              </div>
            </div>
          ) : mode.kind === 'delete' ? (
            <div className="stack confirm-box" role="alertdialog" aria-label="削除の確認">
              <p style={{ margin: 0 }}>
                この履歴（{historyMeta(entry)}）を消しますか？今の設定と部材は変わりません。
                <strong>元に戻せません。</strong>
              </p>
              <div className="foot">
                <button type="button" className="btn" onClick={() => setMode({ kind: 'menu', historyId: entry.id })}>
                  やめる
                </button>
                <button type="button" className="btn danger solid" onClick={() => remove(entry)}>
                  消す
                </button>
              </div>
            </div>
          ) : (
            <div className="job-menu">
              <p className="job-meta num">{historyMeta(entry)}</p>
              <button type="button" className="btn wide" onClick={() => setMode({ kind: 'restore', historyId: entry.id })}>
                この内容に戻す
              </button>
              <button type="button" className="btn wide" onClick={() => startMemo(entry)}>
                メモを直す
              </button>
              <button type="button" className="btn danger wide" onClick={() => setMode({ kind: 'delete', historyId: entry.id })}>
                削除
              </button>
            </div>
          )}
        </Sheet>
      )}
    </div>
  )
}
