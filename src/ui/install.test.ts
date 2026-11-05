import { describe, expect, it } from 'vitest'
import type { KeyValueStorage } from '../store/storage'
import { installKind, loadInstallClosed, saveInstallClosed } from './install'
import { loadPartsTab, savePartsTab } from './partsTab'

class MemoryStorage implements KeyValueStorage {
  map = new Map<string, string>()
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36'

describe('installKind（ホーム画面に追加の案内。仕様書 30.3）', () => {
  it('ホーム画面から開いている・閉じたことがあるときは出さない', () => {
    expect(installKind({ userAgent: ANDROID, standalone: true, canPrompt: true, closed: false })).toBe('none')
    expect(installKind({ userAgent: IPHONE, standalone: false, canPrompt: false, closed: true })).toBe('none')
  })
  it('インストールの確認を出せればボタン、iPhone は手順、それ以外はメニューの手順', () => {
    expect(installKind({ userAgent: ANDROID, standalone: false, canPrompt: true, closed: false })).toBe('prompt')
    expect(installKind({ userAgent: IPHONE, standalone: false, canPrompt: false, closed: false })).toBe('ios')
    expect(installKind({ userAgent: ANDROID, standalone: false, canPrompt: false, closed: false })).toBe('menu')
  })
})

describe('閉じたことの記憶', () => {
  it('kidori-simple.ui に置き、選んだタブは残す', () => {
    const st = new MemoryStorage()
    savePartsTab(st, 'cut')
    expect(loadInstallClosed(st)).toBe(false)
    saveInstallClosed(st)
    expect(loadInstallClosed(st)).toBe(true)
    expect(loadPartsTab(st)).toBe('cut')
    expect([...st.map.keys()]).toEqual(['kidori-simple.ui'])
  })
  it('読めない・書けないときも例外を出さない', () => {
    expect(loadInstallClosed(null)).toBe(false)
    expect(() => saveInstallClosed(null)).not.toThrow()
  })
})
