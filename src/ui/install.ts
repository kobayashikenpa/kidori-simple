// ホーム画面に追加の案内（仕様書 30.3）。どの案内を出すかの判断と、「閉じた」の記憶（端末ごと。kidori-simple.ui に置く）
import type { KeyValueStorage } from '../store/storage'
import { UI_KEY } from './partsTab'

/** 出す案内：none＝出さない、prompt＝ボタンでインストールの確認（Android の Chrome など）、ios＝共有ボタンの手順、menu＝ブラウザのメニューの手順 */
export type InstallKind = 'none' | 'prompt' | 'ios' | 'menu'

/**
 * どの案内を出すか。ホーム画面から開いている（standalone）・閉じたことがあるときは出さない。
 * iPhone・iPad（Safari）は手順、インストールの確認を出せるブラウザはボタン、それ以外はメニューの手順
 */
export function installKind(o: { userAgent: string; standalone: boolean; canPrompt: boolean; closed: boolean }): InstallKind {
  if (o.standalone || o.closed) return 'none'
  if (o.canPrompt) return 'prompt'
  if (/iPhone|iPad|iPod/.test(o.userAgent) || (/Macintosh/.test(o.userAgent) && /Mobile/.test(o.userAgent))) return 'ios'
  return 'menu'
}

function readUi(storage: KeyValueStorage | null): Record<string, unknown> {
  try {
    const raw = storage?.getItem(UI_KEY)
    if (!raw) return {}
    const v: unknown = JSON.parse(raw)
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** 案内を閉じたことがあるか */
export function loadInstallClosed(storage: KeyValueStorage | null): boolean {
  return readUi(storage).installClosed === true
}

/** 案内を閉じたことを覚える（ほかの画面の状態は残す）。書けなくても、いまの画面では閉じる */
export function saveInstallClosed(storage: KeyValueStorage | null): void {
  try {
    storage?.setItem(UI_KEY, JSON.stringify({ ...readUi(storage), installClosed: true }))
  } catch {
    // 保存できなくても画面は動く
  }
}
