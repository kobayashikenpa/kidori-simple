// 仕事の画面（仕様書 10・22）：保存した仕事の一覧は1行1仕事（名前・部材の数・最後に変えた日・開いている印。新しい順）。
// 行を押すと開き、長押しでメニュー（名前を変える・コピー・この仕事を送る・削除（確認つき））。kidori の JobsScreen.tsx をもとにしたもの。
// 共有とバックアップ（仕様書 15.3・15.4）：この仕事を送る（メニュー）・バックアップを書き出す・ファイルから取り込む（一覧の下）
import { useRef, useState, type ChangeEvent, type FocusEvent, type FormEvent } from 'react'
import { backupFileName, buildBackupFile } from '../../engine/transfer/backup'
import { MAX_TRANSFER_SIZE, READ_FAILED } from '../../engine/transfer/envelope'
import { importTransfer } from '../../engine/transfer/importFile'
import { readTransferFile, type TransferRead } from '../../engine/transfer/read'
import { buildJobFile, jobFileName } from '../../engine/transfer/share'
import type { Job } from '../../engine/types'
import { defaultJobName, newId } from '../../store/jobs'
import { useJobStore } from '../../store/useJobStore'
import { Help } from '../components/Help'
import { ImportDialog } from '../components/ImportDialog'
import { jobMeta, sortJobsNewestFirst } from '../jobList'
import { jsonFile, shareFile } from '../platform/shareSheet'
import { MAKE_FAILED, shareResultText } from '../transferView'
import { useLongPress } from '../useLongPress'
import { Sheet } from '../components/Sheet'

/** 長押しのメニューで、いま何をしているか（menu：4つのボタン） */
type Mode = { kind: 'menu' | 'rename' | 'delete'; jobId: string } | null

/** 名前の欄を開いたとき、カーソルを後ろに置く（「10/25 」に続けて打てるように。仕様書 22） */
const caretToEnd = (e: FocusEvent<HTMLInputElement>) => {
  const el = e.currentTarget
  const n = el.value.length
  try {
    el.setSelectionRange(n, n)
  } catch {
    // 選べない入力欄では何もしない
  }
}

export function JobsScreen({ onOpened }: { onOpened: () => void }) {
  const { data, state, dispatch } = useJobStore()
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [mode, setMode] = useState<Mode>(null)
  const [renameText, setRenameText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 送る・書き出す・取り込むの知らせ。jobId があれば（この仕事を送る）一覧の上、無ければ一覧の下のボタンの下に出す */
  const [transferMsg, setTransferMsg] = useState<{ ok: boolean; text: string; jobId?: string } | null>(null)
  /** 読めたファイル（確認の画面を出している間） */
  const [pending, setPending] = useState<Extract<TransferRead, { ok: true }> | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const longPress = useLongPress()

  const jobs = sortJobsNewestFirst(data.jobs)

  const reset = () => {
    setMode(null)
    setError(null)
    setNotice(null)
    setTransferMsg(null)
  }

  const open = (id: string) => {
    if (dispatch({ type: 'openJob', id }).ok) onOpened()
  }

  const startCreate = () => {
    reset()
    setError(null)
    setNewName(defaultJobName(new Date()))
    setCreating(true)
  }

  const create = (e: FormEvent) => {
    e.preventDefault()
    const r = dispatch({ type: 'createJob', name: newName, open: true })
    if (!r.ok) {
      setError(r.message)
      return
    }
    setCreating(false)
    setNewName('')
    onOpened()
  }

  /** 長押し：その仕事のメニューを出す（新しい仕事の入力は閉じる） */
  const openMenu = (job: Job) => {
    reset()
    setCreating(false)
    setMode({ kind: 'menu', jobId: job.id })
  }

  const startRename = (job: Job) => {
    setError(null)
    setRenameText(job.name)
    setMode({ kind: 'rename', jobId: job.id })
  }

  const submitRename = (e: FormEvent, jobId: string) => {
    e.preventDefault()
    const r = dispatch({ type: 'renameJob', jobId, name: renameText })
    if (!r.ok) {
      setError(r.message)
      return
    }
    reset()
  }

  const copy = (job: Job) => {
    reset()
    const r = dispatch({ type: 'copyJob', jobId: job.id })
    if (!r.ok) {
      setError(r.message)
      return
    }
    const made = r.state.data.jobs.find((j) => j.id === r.id)
    setNotice(`「${made?.name ?? ''}」を作りました。一番上に出ています`)
  }

  /** この仕事を送る。共有シートを開けるよう、ファイルは押した操作の中で同期に作る */
  const send = (job: Job) => {
    reset()
    const file = jsonFile(buildJobFile(job), jobFileName(job))
    if (!file) {
      setTransferMsg({ ok: false, text: MAKE_FAILED, jobId: job.id })
      return
    }
    void shareFile(file, job.name).then((r) => {
      const m = shareResultText(r, 'job')
      if (m) setTransferMsg({ ...m, jobId: job.id })
    })
  }

  /** バックアップを書き出す（全部の仕事）。送るときと同じく、ファイルは押した操作の中で作る */
  const exportBackup = () => {
    reset()
    const file = jsonFile(buildBackupFile(data), backupFileName(new Date()))
    if (!file) {
      setTransferMsg({ ok: false, text: MAKE_FAILED })
      return
    }
    void shareFile(file, 'kidori-simple のバックアップ').then((r) => {
      const m = shareResultText(r, 'backup')
      if (m) setTransferMsg(m)
    })
  }

  /** ファイルを選んだ：読んで確認を出す。読めなければ知らせるだけ（今のデータは変えない） */
  const pickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0]
    // 同じファイルをもう一度選べるよう、値を毎回空に戻す
    input.value = ''
    if (!file) return
    reset()
    const fail = () => setTransferMsg({ ok: false, text: READ_FAILED })
    if (file.size > MAX_TRANSFER_SIZE) {
      fail()
      return
    }
    let text: string
    try {
      text = await file.text()
    } catch {
      fail()
      return
    }
    const r = readTransferFile(text)
    if (r.ok) setPending(r)
    else setTransferMsg({ ok: false, text: r.message })
  }

  /** 確認の「取り込む」「追加する」：今のデータに足して保存する。開いている仕事は変えない */
  const importPending = () => {
    const r = pending
    setPending(null)
    if (!r || !state.canSave) return
    try {
      const out = importTransfer(data, r.file, newId, new Date())
      const d = dispatch({ type: 'replaceData', data: out.data, numbering: out.numbering })
      setTransferMsg(d.ok ? { ok: true, text: out.message } : { ok: false, text: d.message })
    } catch {
      setTransferMsg({ ok: false, text: READ_FAILED })
    }
  }

  /** 見本（棚）を足す（仕様書 16.7）。開いている仕事は変えず、一覧に足すだけ */
  const addSample = () => {
    reset()
    const r = dispatch({ type: 'addSample' })
    if (!r.ok) {
      setError(r.message)
      return
    }
    const made = r.state.data.jobs.find((j) => j.id === r.id)
    setNotice(`「${made?.name ?? ''}」を足しました`)
  }

  const remove = (job: Job) => {
    const r = dispatch({ type: 'deleteJob', jobId: job.id })
    reset()
    if (r.ok) setNotice(`「${job.name}」を消しました`)
  }

  /** メニューを出している仕事（消えていたら出さない） */
  const menuJob = mode ? jobs.find((j) => j.id === mode.jobId) : undefined
  const menuIsOpen = menuJob !== undefined && menuJob.id === state.currentJobId
  /** 名前の欄の外に出す失敗の知らせ（見本・コピーなど） */
  const looseError = !creating && mode?.kind !== 'rename' ? error : null

  return (
    <section>
      <h2>
        <Help title="仕事">
          仕事は1回の木取りの入力のまとまり（設定と部材）です。このスマホの中に自動で保存されます。新しい仕事はいつも初めの設定から始まり、コピーした仕事は元の設定を引き継ぎます。
          一覧の行を押すと開きます。長押しすると、名前を変える・コピー・この仕事を送る・削除 のメニューが出ます。
        </Help>
      </h2>

      {creating ? (
        <form className="card stack" onSubmit={create}>
          <div className="field">
            <label className="label" htmlFor="new-job-name">
              新しい仕事の名前
            </label>
            <input
              id="new-job-name"
              className="input"
              value={newName}
              enterKeyHint="done"
              autoFocus
              onFocus={caretToEnd}
              onChange={(e) => setNewName(e.target.value)}
            />
          </div>
          {error && <p className="msg err">{error}</p>}
          <div className="foot">
            <button type="button" className="btn" onClick={() => setCreating(false)}>
              やめる
            </button>
            <button type="submit" className="btn primary">
              作って開く
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn primary wide" onClick={startCreate}>
          ＋ 新しい仕事を作る
        </button>
      )}

      {notice && (
        <p className="msg ok banner" role="status">
          {notice}
        </p>
      )}
      {looseError && (
        <p className="msg err banner" role="alert">
          {looseError}
        </p>
      )}
      {transferMsg?.jobId !== undefined && (
        <p className={`msg ${transferMsg.ok ? 'ok' : 'err'} banner`} role={transferMsg.ok ? 'status' : 'alert'}>
          {transferMsg.text}
        </p>
      )}

      <h3>保存した仕事（{jobs.length}件）</h3>
      {jobs.length === 0 ? (
        <p className="lead">まだ仕事がありません。上の「＋ 新しい仕事を作る」から始めてください。</p>
      ) : (
        <>
          <ul className="job-list">
            {jobs.map((job) => {
              const isOpen = job.id === state.currentJobId
              return (
                <li key={job.id}>
                  <button
                    type="button"
                    className={`job-row${isOpen ? ' open' : ''}`}
                    aria-label={`${job.name}${isOpen ? '（開いている）' : ''}を開く。長押しでメニュー`}
                    {...longPress(
                      () => open(job.id),
                      () => openMenu(job),
                    )}
                  >
                    <span className="job-head">
                      <span className="job-name">{job.name}</span>
                      {isOpen && <span className="chip ok">開いている</span>}
                    </span>
                    <span className="job-meta">{jobMeta(job)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="job-hint">長押しでメニュー</p>
        </>
      )}

      <div className="job-tools">
        <button type="button" className="btn small" onClick={addSample}>
          見本（棚）を追加
        </button>
        <button type="button" className="btn small" onClick={exportBackup}>
          バックアップを書き出す
        </button>
        <button type="button" className="btn small" onClick={() => fileInput.current?.click()}>
          ファイルから取り込む
        </button>
        <Help className="lead" title="見本・共有とバックアップ">
          「見本（棚）を追加」は、試しに使える見本の仕事を足します。ふつうの仕事と同じく直したり消したりできます。
          「この仕事を送る」（行の長押し）は、その仕事（設定・部材）を1つのファイルにして、LINE・メール・AirDrop などで送ります。切り出しチェックと仕上がりの完了は外して送ります。
          「バックアップを書き出す」は、全部の仕事を1つのファイルにします（「ファイル」に保存しておく、新しいスマホに移すなど）。
          「ファイルから取り込む」で、受け取ったファイルやバックアップのファイルを選ぶと、コピーとして仕事に足します（今の仕事は変わりません）。前の版（キドリライトなど）で式を使って入れた W・H は、取り込むときに計算した数字に置き換えます。
          ファイルを持っている人は、誰でも中身を見られます。
        </Help>
        {/* accept は付けない（iPhone で .json が選べないことがあるため。kidori と同じ。中身で判断する） */}
        <input
          ref={fileInput}
          type="file"
          aria-label="取り込むファイル"
          style={{ display: 'none' }}
          onChange={(e) => void pickFile(e)}
        />
      </div>
      {transferMsg && transferMsg.jobId === undefined && <TransferMessage msg={transferMsg} />}

      {mode && menuJob && (
        <Sheet title={menuJob.name} onClose={reset}>
          {mode.kind === 'rename' ? (
            <form className="stack" onSubmit={(e) => submitRename(e, menuJob.id)}>
              <div className="field">
                <label className="label" htmlFor="rename-job">
                  新しい名前
                </label>
                <input
                  id="rename-job"
                  className={`input${error ? ' bad' : ''}`}
                  value={renameText}
                  enterKeyHint="done"
                  autoFocus
                  onFocus={caretToEnd}
                  onChange={(e) => {
                    setRenameText(e.target.value)
                    setError(null)
                  }}
                />
              </div>
              {error && <p className="msg err">{error}</p>}
              <div className="foot">
                <button type="button" className="btn" onClick={reset}>
                  やめる
                </button>
                <button type="submit" className="btn primary">
                  名前を決める
                </button>
              </div>
            </form>
          ) : mode.kind === 'delete' ? (
            <div className="stack confirm-box" role="alertdialog" aria-label="削除の確認">
              <p style={{ margin: 0 }}>
                「{menuJob.name}」を消しますか？{menuIsOpen && 'いま開いている仕事です。'}設定と部材の入力もすべて消えます。
                <strong>元に戻せません。</strong>
              </p>
              <div className="foot">
                <button type="button" className="btn" onClick={() => setMode({ kind: 'menu', jobId: menuJob.id })}>
                  やめる
                </button>
                <button type="button" className="btn danger solid" onClick={() => remove(menuJob)}>
                  消す
                </button>
              </div>
            </div>
          ) : (
            <div className="job-menu">
              <p className="job-meta">{jobMeta(menuJob)}</p>
              <button type="button" className="btn wide" onClick={() => startRename(menuJob)}>
                名前を変える
              </button>
              <button type="button" className="btn wide" onClick={() => copy(menuJob)}>
                コピー
              </button>
              <button type="button" className="btn wide" onClick={() => send(menuJob)}>
                この仕事を送る
              </button>
              <button type="button" className="btn danger wide" onClick={() => setMode({ kind: 'delete', jobId: menuJob.id })}>
                削除
              </button>
            </div>
          )}
        </Sheet>
      )}

      {pending && (
        <ImportDialog read={pending} canSave={state.canSave} onImport={importPending} onCancel={() => setPending(null)} />
      )}
    </section>
  )
}

function TransferMessage({ msg }: { msg: { ok: boolean; text: string } }) {
  return (
    <p className={`msg ${msg.ok ? 'ok' : 'err'}`} role={msg.ok ? 'status' : 'alert'} style={{ margin: 0 }}>
      {msg.text}
    </p>
  )
}
