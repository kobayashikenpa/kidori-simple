// 仕事の画面の「ホーム画面に追加」の案内（仕様書 30.3）
import { useEffect, useState } from 'react'
import { installKind, loadInstallClosed, saveInstallClosed } from '../install'
import { canPromptInstall, isStandalone, onInstallPromptChange, promptInstall } from '../platform/installPrompt'

function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function InstallHint() {
  const [canPrompt, setCanPrompt] = useState(canPromptInstall)
  const [closed, setClosed] = useState(() => loadInstallClosed(safeStorage()))
  useEffect(() => onInstallPromptChange(() => setCanPrompt(canPromptInstall())), [])

  const kind = installKind({ userAgent: navigator.userAgent, standalone: isStandalone(), canPrompt, closed })
  if (kind === 'none') return null

  const close = () => {
    saveInstallClosed(safeStorage())
    setClosed(true)
  }

  return (
    <section className="install-hint" aria-label="ホーム画面に追加">
      <div className="install-text">
        <strong>ホーム画面に追加</strong>
        {kind === 'prompt' && <span>アプリとして入れると、電波が無い現場でも開けます。</span>}
        {kind === 'ios' && (
          <span>
            Safari の下の <b>共有ボタン（□に↑）</b> →「<b>ホーム画面に追加</b>」で、アプリとして入ります。一度開いておけば、電波が無い現場でも開けます。
          </span>
        )}
        {kind === 'menu' && (
          <span>
            ブラウザの <b>メニュー（︙）</b> →「<b>ホーム画面に追加</b>」か「<b>アプリをインストール</b>」で、アプリとして入ります。一度開いておけば、電波が無い現場でも開けます。
          </span>
        )}
      </div>
      <div className="install-actions">
        {kind === 'prompt' && (
          <button type="button" className="btn small primary" onClick={() => void promptInstall().then((ok) => ok && close())}>
            入れる
          </button>
        )}
        <button type="button" className="btn small" onClick={close}>
          閉じる
        </button>
      </div>
    </section>
  )
}
