// ブラウザの「アプリをインストール」の確認（beforeinstallprompt。Android の Chrome など）を受け取っておく（仕様書 30.3）。
// この合図はアプリを開いてすぐに来ることがあるので、画面より先（main.tsx）で受け取り始める

/** beforeinstallprompt の合図（型は標準に無いので必要な所だけ） */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((f) => f())

/** 合図を受け取り始める（1回だけ呼ぶ） */
export function listenInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    // ブラウザが自分で出す案内は止めて、アプリの案内のボタンから出す
    e.preventDefault()
    deferred = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

/** いまインストールの確認を出せるか */
export const canPromptInstall = (): boolean => deferred !== null

/** 出せるかどうかが変わったら呼ぶ */
export function onInstallPromptChange(f: () => void): () => void {
  listeners.add(f)
  return () => listeners.delete(f)
}

/** インストールの確認を出す。入れたら true */
export async function promptInstall(): Promise<boolean> {
  const e = deferred
  if (!e) return false
  deferred = null
  notify()
  try {
    await e.prompt()
    return (await e.userChoice).outcome === 'accepted'
  } catch {
    return false
  }
}

/** ホーム画面から開いているか */
export function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/** サービスワーカー（電波が無くても開けるようにする仕組み。public/sw.js）を登録する。本番のビルドだけ */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined)
  })
}
