// W・H の寸法の文字（第2.2版 仕様書 26.1：数字。第2.3版 仕様書 27.1：数字と ＋ − × ÷ ( ) だけの計算式）
import { describe, expect, it } from 'vitest'
import {
  isSizeFormula,
  isSizeInput,
  normalizeSizeText,
  pastedSize,
  readSize,
  sizeLabel,
  sizeText,
  sizeValueText,
} from './size'

describe('readSize（保存した W・H の文字 → 寸法）', () => {
  it('数字はその数（小数も）', () => {
    expect(readSize('400')).toEqual({ ok: true, value: 400 })
    expect(readSize('379.5')).toEqual({ ok: true, value: 379.5 })
    expect(readSize('0.1')).toEqual({ ok: true, value: 0.1 })
  })

  it('空は「数字を入れてください」（入れている途中の印）', () => {
    expect(readSize('')).toEqual({ ok: false, kind: 'syntax', message: '数字を入れてください', incomplete: true })
    expect(readSize('  ')).toMatchObject({ ok: false, incomplete: true })
  })

  it('「12.」は小数点の後ろがまだ（入れている途中の印）', () => {
    expect(readSize('12.')).toEqual({ ok: false, kind: 'syntax', message: '「12.」の小数点の後ろに数字を入れてください', incomplete: true })
    expect(readSize('.')).toMatchObject({ ok: false, kind: 'syntax', incomplete: true })
  })

  it('0 と、小数第1位に丸めて 0 になる数は 0 以下（0.04）。0.05 は 0.1 として使える', () => {
    expect(readSize('0')).toEqual({ ok: false, kind: 'nonPositive', message: '0 より大きい数を入れてください' })
    expect(readSize('0.04')).toMatchObject({ ok: false, kind: 'nonPositive' })
    expect(readSize('0.05')).toEqual({ ok: true, value: 0.05 })
  })

  it('全角の数字・前後の空白はそろえて読む', () => {
    expect(readSize('４００')).toEqual({ ok: true, value: 400 })
    expect(readSize(' 400 ')).toEqual({ ok: true, value: 400 })
  })
})

describe('readSize：数字と ＋ − × ÷ ( ) だけの式（第2.3版。仕様書 27.1）', () => {
  it('仕様書の例：450-50 → 400、(900-18)/2 → 441', () => {
    expect(readSize('450-50')).toEqual({ ok: true, value: 400 })
    expect(readSize('(900-18)/2')).toEqual({ ok: true, value: 441 })
  })

  it('× ÷ が先、( ) の中が先', () => {
    expect(readSize('100+20*3')).toEqual({ ok: true, value: 160 })
    expect(readSize('(100+20)*3')).toEqual({ ok: true, value: 360 })
    expect(readSize('900-18*2')).toEqual({ ok: true, value: 864 })
    expect(readSize('1800/2-20')).toEqual({ ok: true, value: 880 })
  })

  it('「＝」は付けない。全角の数字・記号、× ÷ −（U+2212）・空白もそろえて読む', () => {
    expect(readSize('４５０－５０')).toEqual({ ok: true, value: 400 })
    expect(readSize('450 − 50')).toEqual({ ok: true, value: 400 })
    expect(readSize('200×2')).toEqual({ ok: true, value: 400 })
    expect(readSize('800÷2')).toEqual({ ok: true, value: 400 })
    expect(readSize('（９００－１８）／２')).toEqual({ ok: true, value: 441 })
    expect(readSize('＋')).toMatchObject({ ok: false, kind: 'syntax' })
  })

  it('値は丸めずに返す（表示は小数第1位。比べるのも小数第1位で）', () => {
    const r = readSize('1000/3')
    expect(r.ok && r.value).toBeCloseTo(333.3333, 3)
    expect(readSize('0.1+0.2')).toMatchObject({ ok: true })
  })

  it('先頭のマイナスは符号（-50+500 → 450）', () => {
    expect(readSize('-50+500')).toEqual({ ok: true, value: 450 })
  })

  it('0 で割るのはエラー', () => {
    expect(readSize('450/0')).toEqual({ ok: false, kind: 'divideByZero', message: '0 で割っています' })
    expect(readSize('450÷(50-50)')).toMatchObject({ ok: false, kind: 'divideByZero' })
  })

  it('結果が 0 以下（小数第1位に丸めて）はエラー', () => {
    expect(readSize('50-100')).toEqual({ ok: false, kind: 'nonPositive', message: '計算結果が 0 以下になります（−50）' })
    expect(readSize('450-450')).toEqual({ ok: false, kind: 'nonPositive', message: '計算結果が 0 以下になります（0）' })
    expect(readSize('0.1-0.06')).toMatchObject({ ok: false, kind: 'nonPositive' })
    expect(readSize('-5')).toMatchObject({ ok: false, kind: 'nonPositive' })
  })

  it('入れている途中の式（終わりが記号・かっこが閉じていない・「1.」で終わる）は途中の印つきのエラー', () => {
    expect(readSize('450-')).toEqual({ ok: false, kind: 'syntax', message: '式が「−」で終わっています（後ろに数字を入れてください）', incomplete: true })
    expect(readSize('450×')).toMatchObject({ ok: false, kind: 'syntax', message: '式が「×」で終わっています（後ろに数字を入れてください）', incomplete: true })
    expect(readSize('(900-18')).toEqual({ ok: false, kind: 'syntax', message: '閉じかっこ「)」が足りません', incomplete: true })
    expect(readSize('450-50.')).toEqual({ ok: false, kind: 'syntax', message: '「50.」の小数点の後ろに数字を入れてください', incomplete: true })
    expect(readSize('450-.')).toMatchObject({ ok: false, kind: 'syntax', incomplete: true })
  })

  it('計算できない式は理由つきのエラー（途中の印は無い）', () => {
    expect(readSize('450--')).toMatchObject({ ok: false, kind: 'syntax', incomplete: true })
    expect(readSize('*450')).toEqual({ ok: false, kind: 'syntax', message: '式の始めに「×」は置けません' })
    expect(readSize('450+*50')).toEqual({ ok: false, kind: 'syntax', message: '「+」のすぐ後ろに「×」は置けません' })
    expect(readSize('450)')).toEqual({ ok: false, kind: 'syntax', message: '閉じかっこ「)」が多すぎます（対になる「(」がありません）' })
    expect(readSize('()')).toEqual({ ok: false, kind: 'syntax', message: 'かっこ「( )」の中が空です' })
    expect(readSize('2(450)')).toEqual({ ok: false, kind: 'syntax', message: '「2」と「(」の間に ＋ − × ÷ のどれかを入れてください' })
    expect(readSize('450 50')).toMatchObject({ ok: false, kind: 'syntax' })
    expect(readSize('1.2.3+4')).toEqual({ ok: false, kind: 'syntax', message: '「1.2.3」は数字として読めません' })
    expect(readSize('.5+4')).toEqual({ ok: false, kind: 'syntax', message: '「.5」は数字として読めません' })
  })

  it('部材名（天板.W）・調整寸法（{n:…}）・「＝」・ほかの文字を使った式は使えない', () => {
    const msg = (t: string) => `「${t}」は使えません（幅・長さは、数字と ＋ − × ÷ ( ) の式だけです）`
    expect(readSize('天板.W - 20')).toEqual({ ok: false, kind: 'syntax', message: msg('天板.W - 20') })
    expect(readSize('1800-{n:adj-1}')).toEqual({ ok: false, kind: 'syntax', message: msg('1800-{n:adj-1}') })
    expect(readSize('=450-50')).toMatchObject({ ok: false, kind: 'syntax', message: msg('=450-50') })
    expect(readSize('＝400')).toMatchObject({ ok: false, kind: 'syntax' })
    expect(readSize('400mm')).toMatchObject({ ok: false, kind: 'syntax' })
    expect(readSize('2^3')).toMatchObject({ ok: false, kind: 'syntax' })
    expect(readSize('1.2.3')).toMatchObject({ ok: false, kind: 'syntax' })
  })
})

describe('isSizeInput（キーで入れている途中も含めて、W・H に入れられる形か）', () => {
  it('数字と小数点（1つの数に1つまで）・＋ − × ÷ ( )・空白だけなら true（途中の形も通す）', () => {
    for (const t of ['', '1', '12', '12.', '12.5', '.', '.5', '1+2', '450-', '-5', '(900-18)/2', '(', '450×2', '800÷2', '450−50', '1800 - 40', '（1）', '４００', '1.5+2.5']) {
      expect(isSizeInput(t), t).toBe(true)
    }
  })
  it('部材の寸法・調整寸法・「＝」・2つ目の小数点・ほかの文字は false', () => {
    for (const t of ['天板.W', '天板.W-20', '{n:a}', '=400', '＝400', '1.2.3', '1+2.3.4', 'abc', '2^3', '400mm']) {
      expect(isSizeInput(t), t).toBe(false)
    }
  })
})

describe('isSizeFormula（式かどうか。ƒ の印）', () => {
  it('＋ − × ÷ ( ) が入っていれば式', () => {
    for (const t of ['450-50', '(900-18)/2', '200×2', '450−50', '-5', '(400)', '450-', '1/0']) expect(isSizeFormula(t), t).toBe(true)
  })
  it('数字・空・途中の「12.」は式でない', () => {
    for (const t of ['', '400', '379.5', '12.', '４００', ' 400 ']) expect(isSizeFormula(t), t).toBe(false)
  })
})

describe('normalizeSizeText（保存する形にそろえる）', () => {
  it('全角・× ÷ −（U+2212）を半角の + - * / ( ) に、空白を外す', () => {
    expect(normalizeSizeText('４５０ － ５０')).toBe('450-50')
    expect(normalizeSizeText('（900 − 18）÷ 2')).toBe('(900-18)/2')
    expect(normalizeSizeText('200×2')).toBe('200*2')
    expect(normalizeSizeText(' 400 ')).toBe('400')
  })
})

describe('sizeLabel（画面に出す式の書き方）', () => {
  it('* / - を × ÷ − にする（1字は1字のまま。カーソルの位置がずれない）', () => {
    expect(sizeLabel('(900-18)/2')).toBe('(900−18)÷2')
    expect(sizeLabel('200*2+5')).toBe('200×2+5')
    expect(sizeLabel('400')).toBe('400')
    expect(sizeLabel('450-').length).toBe('450-'.length)
  })
})

describe('sizeValueText（表示する値。小数第1位まで）', () => {
  it('数字・式の値。エラーは null', () => {
    expect(sizeValueText('400')).toBe('400')
    expect(sizeValueText('450-50')).toBe('400')
    expect(sizeValueText('1000/3')).toBe('333.3')
    expect(sizeValueText('(900-18)/2')).toBe('441')
    expect(sizeValueText('')).toBeNull()
    expect(sizeValueText('450-')).toBeNull()
    expect(sizeValueText('1/0')).toBeNull()
  })
})

describe('pastedSize（W・H の欄に貼る文字）', () => {
  it('空は空にする', () => {
    expect(pastedSize('')).toBe('')
    expect(pastedSize('  ')).toBe('')
  })
  it('0 より大きい数は数字の文字にそろえて貼る（全角・余分な 0 も）', () => {
    expect(pastedSize('400')).toBe('400')
    expect(pastedSize('４００')).toBe('400')
    expect(pastedSize('400.50')).toBe('400.5')
    expect(pastedSize(' 12.25 ')).toBe('12.25')
  })
  it('値が 0 より大きい数字だけの式は、式のまま（保存する形にそろえて）貼る', () => {
    expect(pastedSize('450-50')).toBe('450-50')
    expect(pastedSize('1800 - 40')).toBe('1800-40')
    expect(pastedSize('（900－18）÷2')).toBe('(900-18)/2')
    expect(pastedSize('200×2')).toBe('200*2')
  })
  it('0・0 以下になる式・計算できない式・0 で割る式・部材の寸法・名前の文字・「12.」は貼らない', () => {
    for (const t of ['0', '0.0', '50-100', '450-', '1/0', '天板', '天板.W', '天板.W-20', '=450-50', '12.', '-5']) {
      expect(pastedSize(t), t).toBeUndefined()
    }
  })
})

describe('sizeText（計算した値 → 保存する数字の文字。小数第1位まで）', () => {
  it('整数はそのまま、小数は第1位に丸める', () => {
    expect(sizeText(379)).toBe('379')
    expect(sizeText(100 / 3)).toBe('33.3')
    expect(sizeText(0.1 + 0.2)).toBe('0.3')
    expect(sizeText(1759.96)).toBe('1760')
  })
})
