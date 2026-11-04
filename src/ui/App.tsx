// 画面の枠（仕様書 9）：上に開いている仕事の名前、下に3つのタブ（仕事・部材・木取り）。
// 仕事を開いていないときは「仕事」以外を押せない。ルーター用のパッケージは使わず、今のタブの状態で切り替える
// 第2.2版（仕様書 26.4）：前の版の式を数字に置き換えたときは、上に1度だけ知らせを出す（閉じると dismissNumbering で消す）
import { useState } from 'react'
import { numberingMessage } from '../engine/migrate/numbers'
import { useJobStore } from '../store/useJobStore'
import { JobsScreen } from './screens/JobsScreen'
import { KidoriScreen } from './screens/KidoriScreen'
import { PartsScreen } from './screens/PartsScreen'

type TabId = 'jobs' | 'parts' | 'kidori'

const TABS: { id: TabId; label: string }[] = [
  { id: 'jobs', label: '仕事' },
  { id: 'parts', label: '部材' },
  { id: 'kidori', label: '木取り' },
]

export default function App() {
  const { job, state, saveError, dispatch } = useJobStore()
  const [picked, setPicked] = useState<TabId>(job ? 'parts' : 'jobs')
  // 仕事を開いていなければ、いつも「仕事」を出す
  const tab: TabId = job ? picked : 'jobs'
  // 式を数字に置き換えた知らせ（開いたとき・ファイルを取り込んだとき。文は engine）
  const numbering = numberingMessage(state.numbering)

  const select = (id: TabId) => {
    setPicked(id)
    window.scrollTo(0, 0)
  }

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">Kidori Simple</span>
        <h1>{job ? job.name : '仕事を開いていません'}</h1>
      </header>
      {state.loadError && (
        <div className="msg err banner banner-row" role="alert">
          <span>{state.loadError}</span>
          <button type="button" className="btn small" onClick={() => dispatch({ type: 'dismissLoadError' })}>
            閉じる
          </button>
        </div>
      )}
      {numbering && (
        <div className={`msg ${state.numbering.cleared.length > 0 ? 'warn' : 'ok'} banner banner-row`} role="status">
          <span className="banner-long">{numbering}</span>
          <button type="button" className="btn small" onClick={() => dispatch({ type: 'dismissNumbering' })}>
            閉じる
          </button>
        </div>
      )}
      {saveError && (
        <p className="msg err banner" role="alert">
          {saveError}
        </p>
      )}

      <main>
        {tab === 'jobs' && <JobsScreen onOpened={() => select('parts')} />}
        {tab === 'parts' && job && <PartsScreen />}
        {tab === 'kidori' && job && <KidoriScreen />}
      </main>

      <nav className="tabbar" aria-label="画面の切り替え">
        <div className="in">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id ? 'page' : undefined}
              disabled={!job && t.id !== 'jobs'}
              onClick={() => select(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
