# kidori-simple 設計（第1版）

仕様の正は `docs/spec.md`。この文書は「どこに何を作るか」「データの形」「計算の流れ」「kidori から何を持ってくるか」を決める。
仕様書に書いていないことで、ここで仮に決めたものには **（暫定）** を付け、`docs/tasks.md` 末尾の未決事項に挙げている。

kidori（`~/Documents/kidori`）のコードは **コピーしてから直す**。kidori 本体は変更しない。下で「kidori：◯◯」と書いたものが元のファイル。

## 1. 全体の構成

```
src/
  engine/              計算ロジック（React・ui・store を import しない）
    types.ts             データ型と初期値                       ← kidori：types.ts（大きく削る）
    round.ts             小数第1位の丸め                         ← kidori：round.ts（そのまま）
    defaults.ts          初期の設定・調整寸法・表示名            ← kidori：defaults.ts（材料を外す）
    fixtures/
      shelf.ts           仕様書 6章の例（全体・天板・側板・棚板）。テストで使う。shelfJob(id?, name?)・shelfAdjusts()（メラミン1＝adjust-melamine、シート0.5＝adjust-sheet）
      pieces.ts          帯詰めのテスト用の片（kidori の見本のランバー18・ベニヤ4 と同じ大きさの片、仕様書 6章の棚を全部「回転してよい」にした片）
      progress.ts        切り出しチェックのテスト用（見本の棚を計算して i 枚目を固定する freezeAt など）
    formula/
      tokenize.ts        式 → 字句（数値・参照 部材名.W|H・調整寸法 {n:id}・記号）  ← kidori：tokenize.ts
      parse.ts           字句 → 構文木                           ← kidori：parse.ts
      evaluate.ts        構文木の計算・参照の取り出し            ← kidori：evaluate.ts
      rename.ts          部材名の変更の追従                      ← kidori：rename.ts
      usages.ts          調整寸法を使っている部材を探す（仕事の中・全部の仕事から） ← kidori：usages.ts（厚み・id のつけ替えを外す）
      units.ts           式をカーソルで動く単位に分ける           ← kidori：units.ts
      display.ts         式の表示（{n:id} → 逃げ1 など）         ← kidori：display.ts
    adjusts.ts           調整寸法の表の行（書きかけ）・式で使える調整寸法・変えるときの確認（第1.7版。12.1・12.3）
    dimensions/
      resolve.ts         依存関係（計算順・循環・存在しない部材）← kidori：dimensions/resolve.ts
      index.ts           computeDimensions(job, adjusts)：仕上がり・木取り寸法とエラー
    packing/
      pieces.ts          部材 → 片、回転の向き、入らない片       ← kidori：pieces.ts（材料ごとの分けを外す）。expandPieces(job, dims, frozen)・orientationsFor・piecesOf
      sheet.ts           使える範囲（端切り）・刃厚込みの入り判定 ← kidori：sheet.ts（材料の型を板の大きさ BoardSize に）
      guillotine.ts      帯詰め（同じ幅の優先・並べ方の選び方 chooseWay を含む） ← kidori：guillotine.ts（手持ち packOnStock・SheetSpec を外し、1種類の板だけに）
      cutOrder.ts        切る順番（画面には出さない）            ← kidori：cutOrder.ts（そのまま）
      scraps.ts          端材                                     ← kidori：scraps.ts（そのまま）
      yield.ts           歩留まり                                 ← kidori：yield.ts（そのまま）
      sizes.ts           3×6 と 4×8 の比べ                        ← kidori：sizes.ts（材料の行を外す）
      index.ts           packJob(job, dims, options?)：固定した1枚を除いた入口（第1.4版でおまかせをなくした） ← kidori：packing/index.ts
    hints/
      saving.ts          板を減らせるときのお知らせ findSavingHint(job, adjusts)（第1.5版。11.1） ← kidori：hints/saving.ts（材料ごと・重ね切り・手持ちを外す）
    progress/
      frozen.ts          固定した1枚・部材が変わったことの検出   ← kidori：progress/frozen.ts
      checks.ts          片のチェックの付け外し（1つ目で固定・全部で切り終わり・全部外すと固定を外す） ← kidori：store/jobs.ts の setPieceCheck・setPartCheck
      sheetChecklist.ts  1枚ごとのチェックの一覧（同じ部材を1行）← kidori：sheetChecklist.ts
      partProgress.ts    部材ごとの進み具合（2/5）               ← kidori：partProgress.ts
    clipboard/
      copy.ts            部材の複製・複製の名前（第1.1版の部材まるごとのコピー・貼り付けは第1.2版でなくした）  ← 新しく作る
      cells.ts           セルのコピーと貼り付け・消す・行を削除（第1.2版 E-12。8.1）  ← 新しく作る
    parts.ts             表示用の名前（空なら #行番号）・式から参照できる部材・切り出す枚数（第1.1版 E-10。7.1）
    shape.ts             仕事・部材・調整寸法の形の確かめ（保存データとファイルの読み込みで使う。第1.1版 E-11）
    transfer/            共有とバックアップのファイル（envelope・share・backup・read・importFile。第1.1版 E-11。7.2） ← kidori：store/transfer/ を参考に作り直す
  store/
    storage.ts         localStorage の読み書き（try/catch）       ← kidori：storage.ts を参考に作り直す
    jobs.ts            仕事・部材・調整寸法の操作（純粋関数）
    reducer.ts         状態の変更
    JobStore.tsx       Context + useReducer、変更時の自動保存
  ui/
    App.tsx            下のタブ（仕事・部材・木取り）
    screens/
      JobsScreen.tsx     仕事の一覧
      PartsScreen.tsx    設定（たたむ）・［仕上がり］［木取り］のタブ・部材の一覧
      KidoriScreen.tsx   木取りの結果・切り出しチェック
    components/
      BoardSettings.tsx  木取りの画面の上の板（3×6・4×8・自由入力）・刃厚・端切り・切り代・切り方（第1.2版。SettingsPanel.tsx はなくした）
      AdjustPanel.tsx    部材の画面の上のたたんだ「調整寸法」（第1.2版）
      AdjustList.tsx     調整寸法の一覧・追加（逃げ／ほぞ／自由入力）
      PartRow.tsx        部材の1行（式 ｜ 計算した寸法、仕上がりの完了）
      PartEditor.tsx     部材の編集（名前・W・H・枚数・回転・複製）
      FormulaInput.tsx   式の入力（ボタン・カーソル・調整寸法のボタン。部材の寸法は表のセルを押して入れる＝第1.6版）← kidori の操作を参考
      Numpad.tsx         数字キー
      PastePreview.tsx   貼り付けの確認（第1.2版でなくした）
      SheetDiagram.tsx   配置図（SVG）
      SheetChecklist.tsx 1枚ごとの切り出しチェック
      Help.tsx           「ⓘ」の説明
```

- 画面の切り替えはルーター用のパッケージを使わず、状態（今のタブ）で切り替える（依存を増やさない）
- 計算の呼び出しは画面側で `computeDimensions` → `packJob` の順。`useMemo` で部材・設定・調整寸法が変わったときだけ計算し直す
- 持ってこない kidori のファイル：`flush.ts` `boards.ts` `dimensions/thickness.ts` `dimensions/finished.ts` `dimensions/cutSize.ts`（index.ts にまとめる）`dimensions/explain.ts` `formula/swapThickness` `packing/stack*` `packing/stock.ts` `packing/offcuts.ts` `packing/pairing.ts` `hints/`（第1.5版で `hints/saving.ts` だけ持ってきた。11.1） `migrate/` `progress/` の重ね切り・手持ち・端材の行の部分

## 2. データ型（`src/engine/types.ts`）

寸法は mm の number。比較は小数第1位に丸めてから行い、表示も小数第1位まで。

```ts
/** 部材の寸法の軸（板の面の2つ） */
export type Axis = 'W' | 'H'
export const AXES: readonly Axis[] = ['W', 'H']

// ---------- 入力 ----------

export type CutMode = 'vertical' | 'horizontal' // 縦切り優先 / 横切り優先（第1.4版で 'auto'＝おまかせをなくした。10.1）

export type BoardSizeKind = 'saburoku' | 'shihachi' | 'custom' // 3×6 / 4×8 / 自由入力
export const BOARD_SIZES = { saburoku: [910, 1820], shihachi: [1220, 2430] } as const // [妻手, 長手]

export interface Sheet {
  sizeKind: BoardSizeKind
  width: number   // 妻手（mm）
  length: number  // 長手（mm）。width ≦ length にそろえる
}

export interface Settings {
  sheet: Sheet       // 初期値 4×8
  kerf: number       // 刃厚（初期値 3）
  trim: number       // 端切り（初期値 5）。刃厚を含む
  allowance: number  // 切り代（初期値 10）。W・H に同じ値を足す
  cutMode: CutMode   // 初期値 'vertical'
}

/** 設定の数値の初期値（板はオブジェクトなので defaults.ts の defaultSettings() で作る） */
export const DEFAULT_SETTINGS = { kerf: 3, trim: 5, allowance: 10, cutMode: 'vertical' }

/** 調整寸法（アプリ全体で1つの一覧）。kidori の Nige と同じ形 */
export interface Adjust {
  id: string     // 式からは {n:id} で参照する
  name: string   // 例：逃げ、ほぞ、メラミン、シート
  value: number  // mm。0 より大きい
}

export interface Part {
  id: string
  name: string                  // 仕事の中で重複不可（全角・半角の違いは同じとみなす）
  expr: Record<Axis, string>    // 仕上がり寸法の入力（数値または式）
  quantity: number              // 0 は寸法だけの行
  rotatable: boolean            // 回転してよい。初期値 false
  finishedDone: boolean         // 仕上がりの完了のチェック
}

export interface Job {
  id: string
  name: string
  settings: Settings
  parts: Part[]                 // 並び順＝画面の並び順
  frozenSheets: FrozenSheet[]   // 固定した1枚（固定した順）
  createdAt: string             // ISO
  updatedAt: string
}

/** 固定した1枚（kidori の FrozenSheet から材料・重ね切りを外したもの） */
export interface FrozenSheet {
  id: string
  sheet: Sheet                  // 固定したときの板
  mode: 'vertical' | 'horizontal'
  kerf: number
  trim: number
  layout: SheetLayout           // 固定したときの1枚（深いコピー）
  checked: string[]             // チェックした片の pieceId
  frozenAt: string
  completedAt?: string          // 全部チェックした時刻。あれば「切り終わり」
}

/** 保存する全体 */
export interface AppData {
  version: 1
  jobs: Job[]
  adjusts: AdjustRow[]          // 初めは メラミン1・シート0.5。第1.7版から書きかけの行も持つ（12.1。第1.6版までは Adjust[]）
  cellClip: CellClip | null     // 最後にコピーしたセル（第1.2版。8.1。第1.1版までは clipboard: CopiedPart[] | null）
  adjustClip: AdjustClip | null // 調整寸法の表で最後にコピーしたセル（第1.7版。12.1）
}

// ---------- 寸法の計算結果 ----------

export type DimensionErrorKind = 'syntax' | 'unknownRef' | 'unknownAdjust' | 'cycle' | 'nonPositive' | 'divideByZero'

export interface DimensionError {
  partId: string
  axis: Axis
  kind: DimensionErrorKind
  message: string               // 画面にそのまま出せる日本語
  refs?: string[]
  from?: { partId: string; axis: Axis }
}

export interface PartDimensions {
  partId: string
  name: string
  quantity: number
  finished: Record<Axis, number> | null  // 仕上がり寸法（式の計算結果）。エラーがあれば null
  cut: Record<Axis, number> | null       // 木取り寸法（仕上がり ＋ 切り代）
  finishedByAxis: Partial<Record<Axis, number>> // 軸ごとの仕上がり（計算できた軸だけ。片方の軸だけエラーのとき式の隣に出す）
  cutByAxis: Partial<Record<Axis, number>>      // 軸ごとの木取り
  errors: DimensionError[]
}

export interface DimensionResult {
  parts: PartDimensions[]
  errors: DimensionError[]
}

// ---------- 木取りの結果（kidori と同じ形から材料を外す） ----------
// Rect・Placement・CutStep・SheetLayout・SheetOrientation は kidori の types.ts と同じ

export interface PackingResult {
  sheet: Sheet
  mode: 'vertical' | 'horizontal'        // 実際に使った切り方
  sheets: SheetLayout[]                   // 固定した1枚を除いた、計算した1枚
  sheetCount: number                      // 必要な板の枚数（固定した1枚を含む）
  yieldRate: number                       // 全体の歩留まり
  unplaced: { partId: string; name: string; reason: UnplacedReason }[]  // UnplacedReason = 'tooLarge'
  skipped: { partId: string; name: string; reason: 'dimensionError' }[]
}
```

**初期値と表示名（`src/engine/defaults.ts`）**

- `defaultSheet()`：4×8（1220×2430）。`defaultSettings()`：4×8・刃厚3・端切り5・切り代10・縦切り優先
- `defaultAdjusts(newId)`：メラミン1・シート0.5（id は `newId('adjust')`）
- `createJob({ id, name, now, settings? })`：部材なしの新しい仕事。`settings` を渡せばその写し（仕事のコピー）
- `defaultAppData(newId)`：仕事なし・調整寸法は初期値・コピーした部材なし
- `adjustName(adjust)`：表示名＝名前＋寸法（例：逃げ1。mm を付けない。寸法は丸めず、浮動小数の誤差だけ消す）
- `adjustNameKey(adjust)`：表示名が重なるかの判定用（名前の前後の空白を外し、全角・半角をそろえた表示名）。名前「逃げ1」寸法5 と 名前「逃げ」寸法15 は同じ「逃げ15」

## 3. 計算の流れ

### 3.1 式（`formula/`）— kidori と同じ考え方

- 字句：数値（小数可）、参照 `部材名.W|H`、調整寸法 `{n:id}`、`+ - * / ( )`、空白。kidori の材料の厚み `{t:id}` は外す
- 入力の揺れをそろえる（`normalizeFormulaText`。NFKC、`×` `✕` → `*`、`÷` → `/`、`−` `–` `—` → `-`。長音 `ー` は置き換えない）
- 部材名は `normalizePartName` でそろえてから照らし合わせる
- 結果は `{ ok: true, value }` か `{ ok: false, error }`。例外は投げない
- `.D` を書いたら、存在しない寸法としてエラー（kidori の式を貼ったときなど）（暫定）。kidori の `{t:id}` も「読めない参照」のエラー
- 計算に渡す値は `Lookup = { ref(部材名, 軸), adjust(調整寸法の id) }`（kidori の `thickness`・`nige` を `adjust` 1つに）。見つからなければ `null` を返し、部材は `unknownRef`、調整寸法は `unknownAdjust`（「削除した調整寸法を使っています」）になる
- 字句の種類は `number`・`ref`・`adjust`（`{n:id}`）・記号。構文木も同じ（kidori の `nige` を `adjust` に改名）
- 部材名の変更（`rename.ts`）：`renamePart(parts, partId, newName)` で名前を変え、全部材の W・H の式の `旧名.W|H` を書き換える（`{n:…}` の中は書き換えない）
- 表示（`display.ts`）：`formulaLabels(expr, adjusts)` は単位ごとの表示名（`* → ×`、`/ → ÷`、`- → −`、`{n:id}` → `adjustName`、無ければ「（削除した調整寸法）」）。`formulaText(expr, adjusts)` は1行の文字（例：`天板.H − 20 − メラミン1`）。調整寸法はアプリ全体の一覧（`AppData.adjusts`）から引くので、名前・寸法を変えると表示もついてくる

### 3.2 寸法（`dimensions/`）

1. すべての部材の W・H の式から参照を取り出し、`部材.軸` を点とした依存関係を作る（kidori：resolve.ts）
2. 存在しない部材名 → `unknownRef`、存在しない調整寸法 → `unknownAdjust`、並べられないもの → `cycle`
3. 計算順に：仕上がり ＝ 式の計算結果。0 以下 → `nonPositive`。参照先の値は **仕上がり寸法**
4. 木取り ＝ 仕上がり ＋ `settings.allowance`（W・H それぞれに1回）
5. 式の隣に出す値（spec 5.2）は `finishedByAxis` / `cutByAxis` を使う（W・H の片方だけエラーでも、もう片方の値は出せる）。`finished` / `cut` は W・H の両方が計算できたときだけ（木取りの計算はこちらを使う）
6. 入口は `computeDimensions(job, adjusts)`（`adjusts` はアプリ全体の調整寸法の一覧）。kidori の `finished.ts`・`cutSize.ts` は `index.ts` にまとめた
7. エラーのある寸法を参照している寸法は計算せず、元のエラーの種類を引き継いで `from` に元の寸法を入れる（kidori と同じ）
8. 枚数 0 の行（全体 など）も `cut` を出す。切らないことは `quantity` で判断する（木取りのタブで「切らない」と出すかは画面で決める）
9. 部材の削除の確認用に `partsReferencing(parts, partId)`（`resolve.ts`）：その部材の寸法を式で使っている、ほかの部材と軸（`{ partId, name, axes }[]`）

### 3.3 木取り（`packing/`）— kidori 3.3・17.13 と同じ処理

- 板は1種類（`settings.sheet`）。kidori の「材料ごとに分ける」段は無くす
- 板の妻手・長手は `normalizeSheet`（`defaults.ts`。小さい方を width、大きい方を length）でそろえる。自由入力は `customSheet(a, b)` で作り、`packJob`・`freezeSheet` の頭でも必ずそろえる（逆に入れても同じ結果）
- 片の向き（`Orientation` の x＝妻手方向、y＝長手方向）：
  - 回転しない：x ＝ 木取り W、y ＝ 木取り H
  - 回転してよい：両方の向きを試す（kidori の `any` と同じ）
- 帯詰め・同じ幅の優先・右上から詰める・切る順番・端材（30mm 以上・大きい順）・歩留まりは kidori のまま
- 帯詰め（`guillotine.ts`）：`packGuillotine(pieces, usable, kerf, mode, sameWidthFirst = true)`。同じ幅を優先する並べ方（true）と、幅が収まる最初の帯に入れる並べ方（false。kidori 第2.4版まで）を持つ
- 並べ方の選び方（`guillotine.ts` の `chooseWay(fixed, run)`・`preferSameWidth`。kidori 17.13 の `packing/index.ts` から移した）：両方を計算し、入らない片が少ないほう → 板が少ないほう → 同じなら同じ幅を優先するほう。`packJob`（E-06）は設定の切り方で、2つの並べ方を `chooseWay` で比べる（第1.4版でおまかせをなくした）
- 回転してよい片の向き（E-17。仕様書 23）：`packGuillotine` の引数 `orientFirst: 'long' | 'short'`（初期値 'long'）。'short' は、すでにある帯に置くときだけ帯の中の方向に短い向き（帯の長さを使わない向き）を先に試す（新しい帯を作るとき・並べる順は 'long' と同じ）。`chooseLayout(fixed, run, rotatable)` が向きごとに `chooseWay` で同じ幅の優先を選び、'short' が「入らない片が少ない → 板が少ない」で勝つときだけ 'short' を採る（同じなら 'long'＝今までの並べ方。`betterThan`）。回転してよい片が無ければ 'short' は計算しない。`packJob` の `options.orientFirst` で向きを決めて計算できる（比べ・テスト用）
- 部材 → 片（`pieces.ts`）：`expandPieces(job, dims, frozen)` で部材ごとの片の並び（枚数0 は除く、寸法のエラーは `skipped`）、`piecesOf(runs, board, trim, mode)` で向きを決めて片にする（どう置いても入らない部材は `unplaced`＝tooLarge）。向きの判定は設定の切り方の範囲
- 入口は `packJob(job, dims, options?)`。`options.sameWidthFirst` を指定するとその並べ方だけで計算する（比べ・テスト用。ふつうは指定しない）。`unplaced` は部材の並び
- 固定した1枚（`frozenSheets`）の片は、部材ごとの必要な枚数から数だけで引いてから並べる（`progress/frozen.ts` の `frozenDemand(job)` → `expandPieces` の引数 `frozen`。kidori と同じ）
- 全体の歩留まり（`yieldRate`）も、`sheetCount` と同じ1枚たち（固定した1枚（切り終わりを含む）＋ 計算した1枚）で出す（暫定）
- `sheetCount` ＝ 固定していて切り終わっていない1枚 ＋ 切り終わった1枚 ＋ 計算した1枚（暫定。kidori と同じ数え方にそろえる）

### 3.4 3×6 と 4×8 の比べ（`packing/sizes.ts`）

- 今の設定の板のサイズを 3×6・4×8 に置き換えて `packJob` を2回呼び、枚数・歩留まりを返す
- `compareStandardSizes(job, dims)` → `{ options: [3×6, 4×8], fewer, higher }`（kidori は材料ごとの配列。1種類の板なので1つだけ返す）。`options` は種類・妻手・長手・枚数・歩留まり・入らない部材の数
- 印（`pickBetterSize`）：枚数が少ない方 `fewer`、歩留まりが高い方 `higher`（小数第1位の % で比べる）。入らない部材が出るサイズ・枚数 0 のサイズがあれば比べない（どちらも null）。同じなら null
- 固定した1枚は、どちらの計算でもそのまま数える（暫定）

### 3.5 切り出しチェック（`progress/`）— kidori 第1.8版・第2.7版と同じ

- 1枚ごとのチェックの一覧は、同じ部材を1行にまとめる（`sheetPartChecklist(job, layout, checked)` → `{ partId, name, sizeLabel, pieceIds, done }[]`。kidori：`sheetPartChecklist`）。並びは切る順番に取り出される順（`pieceReleaseSteps`）。名前は今の部材名（部材が無ければ写しの名前）、寸法は写しのまま
- 1つ目のチェックで、その1枚を `FrozenSheet` として写す（`freezeSheet(job, mode, layout, id, now)`。kidori：`freezeSheet`）。全部外したら消す
- チェックの付け外しは `checks.ts`（kidori では store にあったものを、純粋関数として engine に置いた）：
  - `SheetTarget` ＝ `{ kind: 'computed', mode, layout }`（計算した1枚）か `{ kind: 'frozen', sheetId }`
  - `setPartCheck(job, target, partId, done, now, id?)`：その1枚の同じ部材をまとめて付け外し（画面の1行）。`setPieceCheck(job, target, pieceId, done, now, id?)`：片1つ
  - 戻り値は `{ ok: true, job }` か `{ ok: false, message }`。計算した1枚に付けるときは、新しい固定した1枚の `id` が要る。`updatedAt` は付けない（保存の側で付ける）
  - 全部チェックで `completedAt`（切り終わり）、1つ外すと消す。全部外すと固定した1枚を消す
- 固定した1枚の部材の寸法・枚数が今の部材と違えば「部材が変わっています」（`frozenSheetViews(job, dims)` → `{ sheet, drift, complete }[]`。drift の理由は size（木取り寸法が違う・エラー）／count（固定した片の数 ＞ 今の枚数）／removed（部材が無い）。kidori：`frozenSheetViews` の drift）
- 部材ごとの進み具合は、全部の固定した1枚（切り終わりを含む）のチェックから数える（`partCutProgress(job)` → `{ partId, name, done, total }[]`。枚数0 の部材は入れない。kidori：`partCutProgress`）
- **画面向けの注意**：`pieceId` は1枚の中でだけ重ならない。固定した片を引いたあと残りの片の連番は #1 からふり直すので、別の1枚に同じ `pieceId` があり得る。1枚をまたいで区別するときは、1枚の id（固定した1枚の `id`、計算した1枚なら何枚目か）と組にする
- **画面向けの注意**：計算した1枚の `SheetLayout.index` は、固定した1枚があっても 1 から。画面では 固定した1枚 → 計算した1枚 の順に通し番号を振り直す
- kidori の `sheetProgress`（済んだ工程・残りの材料）は持ってこない（切る順番は画面に出さないため。取り出す工程 `pieceReleaseSteps` だけ `sheetChecklist.ts` に持ってきた）

### 3.6 コピーと貼り付け（`clipboard/copy.ts`）— 新しく作る

> 第1.2版で `copyParts`・`previewPaste`・`applyPaste`・`CopiedPart`・`AppData.clipboard` はなくした（セルのコピーと貼り付けに替えた。8.1）。残っているのは `duplicateName`・`duplicatePart` だけ。下は第1.1版の記録

- `copyParts(job, partIds)` → `CopiedPart[]`（並び順は画面の順。式は式のまま。id・仕上がりの完了は持たない）
- `previewPaste(job, copied, adjusts)` → `{ rows, addCount, skipCount, hasWarnings }`
  - `rows` は行ごとに `{ part, ok: true, warnings }` か `{ part, ok: false, reason: 'duplicateName', message: '棚板 はもうあります', warnings }`
  - 同じ名前は、今の部材とも、貼る部材どうしとも比べる（normalizePartName で。貼る部材どうしは2つ目から足せない）
  - `warnings`：貼ったあとの仕事（今の部材 ＋ 貼る部材）に無い部材の参照があれば `['全体 がありません']`、`adjusts` に無い調整寸法を使っていれば `'削除した調整寸法を使っています'`
- `applyPaste(job, copied, newId)` → 足せる部材だけを後ろに足した仕事（id は `newId('part')`、仕上がりの完了は外す）
- `duplicateName(job, name)` → 「棚板のコピー」「棚板のコピー2」…（重ならない名前。「棚板のコピー」を複製しても「棚板のコピー2」）
- `duplicatePart(job, partId, newId)` → `{ ok: true, job, partId }`（式・枚数・回転を写し、元の部材のすぐ後ろに足す。仕上がりの完了は外す）か `{ ok: false, message }`
- どれも仕事を書き換えずに新しい仕事を返す。`updatedAt` と `AppData.clipboard` への保存は store の側で行う

## 4. 保存（`src/store`）

- localStorage のキー：`kidori-simple.data.v1` に `AppData`、`kidori-simple.currentJobId` に開いている仕事の id、端末ごとの画面の状態（選んだタブ）は `kidori-simple.ui`（暫定）
- kidori のキー（`kidori.*`）とは混ざらない（同じ `github.io` のドメインで localStorage を共有するため、キーの頭を必ず `kidori-simple.` にする）
- 読み書きはすべて try/catch。読めない・壊れているときは空の一覧で始め、「保存データを読めませんでした」と出す（データは上書きしない）
- 書き込みは状態が変わるたびに 300ms ほどまとめて行う
- 調整寸法の変更・削除は、全部の仕事の部材を見て、使っている仕事と部材を返す（`formula/usages.ts` の `adjustUsages(data, adjustId)` → `{ jobId, jobName, partId, partName, axes }[]`。一括削除は `adjustUsagesOf(data, adjustIds)` で、部材ごとに使っている `adjustIds` も付く）。画面で確認してから行う
- id は `crypto.randomUUID()`

## 5. 画面（`src/ui`）

幅 375px 前後、横スクロールなし、押せる部分は高さ 44px 以上、ライト／ダーク両対応。下に3つのタブ：**仕事・部材・木取り**。仕事を開いていないときは「仕事」以外を押せない。

| 画面 | 内容 |
|---|---|
| 仕事 | 一覧（名前・最後に変えた日・部材の数。新しい順）。新しく作る・開く・名前を変える・コピー・削除（確認） |
| 部材 | 上に設定（たたむ）。［仕上がり］［木取り］のタブ。部材の行：名前・W・H（式 ｜ 計算した寸法）・枚数・回転の印・仕上がりの完了（仕上がりのタブだけ）。「＋ 部材を追加」「選んでコピー」「貼り付け（◯件）」 |
| 部材の編集 | 名前（キーボード）、W・H（式の入力）、枚数（数字キー）、回転しない／回転してよい、複製、削除 |
| 式の入力 | 欄の上の1行に計算結果かエラー。下にボタン（第1.6版 20.1）：調整寸法のボタンの欄、`＝ ＋ − × ÷`／全部消す 1 2 3 ⌫／◀ 4 5 6 ▶／( 7 8 9 )／閉じる 0 . 次へ。「＝」で始めた入力中は、ほかの部材の W・H のセルを押すと 部材名.W が入る（20.2。第1.5版までの「部材」のタブはなくした） |
| 設定 | 板のサイズ（3×6／4×8／自由入力）、刃厚、端切り、切り代、切り方、調整寸法の一覧と追加 |
| 木取り | 上に必要な枚数・全体の歩留まり、3×6 と 4×8 の比べ。板ごとに配置図（端材の寸法入り）・歩留まり・端材の一覧・切り出しチェック。切り終わりの1枚は下にたたむ。入らない部材・エラーの部材の知らせ |

**配置図**（`SheetDiagram.tsx`）：kidori と同じく `viewBox` を板の寸法（mm）にして画面幅に合わせる。端切り・部材（名前と木取り寸法）・端材（寸法）を色分け。チェックした片はグレー。

## 6. 公開

- GitHub Pages。`main` に入ったら、チェック → ビルド → 公開（kidori の `.github/workflows/deploy.yml` と同じ）
- ホーム画面に追加できるよう `public/manifest.webmanifest` とアイコンを置く（アイコンは kidori と同じ。名前・短い名前は「Kidori Simple」。オーナー決定）

## 7. 第1.1版の変更（仕様書 15章）

### 7.1 名前が空の部材・枚数が空の部材（E-10。`src/engine/parts.ts`）

```ts
export interface Part {
  id: string
  name: string                  // 空でもよい。重なりの判定は名前のある部材どうしだけ。空の部材は式から参照できない
  expr: Record<Axis, string>
  quantity: number | null       // null＝枚数が空（寸法は計算するが、木取り・必要な枚数・進み具合・比べに入れない）。0 は寸法だけの行
  rotatable: boolean
  finishedDone: boolean
}
// PartDimensions.quantity も number | null。PartDimensions.name は表示用の名前（下の partLabelAt）
```

- `hasName(part)`：名前があるか（前後の空白を外して空でない）
- `partLabel(job, partId)` → 名前があれば名前、空なら「#行番号」（`job.parts` の並びで 1 から）。部材が無ければ `''`
- `partLabelAt(part, index)`・`partLabels(parts)`（id → 表示用の名前の Map）：たくさん出すとき用
- `referableParts(parts)`：式から使える部材（名前のある部材だけ。第1.6版で「部材」のタブはなくし、画面では名前の無い部材のセルを押したときに知らせる）
- `cutQuantity(quantity)`：切り出す枚数（null と 0 は 0）
- 表示用の名前を使う所：`computeDimensions` の `PartDimensions.name`（→ `Placement.name`・`unplaced`・`skipped`）、エラーの文の `部材.W`、`partsReferencing`、`adjustUsages`・`partsUsingAdjust` の部材名、`sheetChecklist`・`sheetPartChecklist`、`frozenSheetViews` の drift、`partCutProgress`
- 行番号は今の並び順なので、上に行を入れると変わる。チェックの一覧・進み具合・drift は今の行番号で出す。固定した1枚の写しの `Placement.name` は固定したときの表示名のまま（部材を消したときだけ使う）
- 名前の重なり：`validatePartName('')` は null（使える）。`otherNames` の空の名前とは比べない。`previewPaste`・`applyPaste` も名前のある部材どうしだけ比べる。`duplicateName(job, '')` は `''`（複製しても空のまま）
- `renamePart` で空にする／空から名前を付けるときは、ほかの式を書き換えない（空にした部材を参照していた式は元の名前のまま残り、`unknownRef` になる）（暫定）
- 枚数が空：`expandPieces` で片にしない（エラーがあっても `skipped` に出さない）。`partCutProgress` に入れない。固定した片がある部材の枚数を空にすると drift は `count`（0 枚とみなす）（暫定）
- 保存データ：`store/storage.ts` の形の確かめは `quantity: null` と `name: ''` を通す。第1版のデータ（名前も枚数も入っている）はそのまま読める（`version` は 1 のまま）

### 7.2 共有とバックアップのファイル（E-11。`src/engine/transfer/`）

kidori の `store/transfer/`（envelope・share・backup・read）を参考に、engine の純粋関数として作り直した（材料・フラッシュ・重ね切りの組・版の移し替えは無い）。ブラウザの共有シート・ファイルの選択は画面（U-13）の側で行う。

```ts
// envelope.ts
interface JobFile    { app: 'kidori-simple'; kind: 'job';    version: 1; job: Job;    adjusts: Adjust[] } // adjusts はその仕事の式で使っているものだけ
interface BackupFile { app: 'kidori-simple'; kind: 'backup'; version: 1; jobs: Job[]; adjusts: Adjust[] } // 全部の仕事と調整寸法の一覧
type TransferFile = JobFile | BackupFile
const READ_FAILED = '読み込めませんでした'
```

| ファイル | 関数 | 内容 |
|---|---|---|
| `share.ts` | `jobFile(job, adjusts)` → `JobFile`、`buildJobFile(job, adjusts)` → JSON の文字列 | 切り出しチェック（`frozenSheets`）と仕上がりの完了を外す。調整寸法は式で使っているものだけ（アプリの一覧の並び） |
| | `jobFileName(job)` → `本棚.kidori-simple.json` | 使えない文字（`\ / : * ? " < > |`・制御文字・空白）は `_` に置き換え、50 文字まで。空なら `仕事.kidori-simple.json`（暫定） |
| `backup.ts` | `backupFile(data)`・`buildBackupFile(data)` | 全部の仕事（チェックも）と調整寸法の一覧をそのまま。コピーした部材（`clipboard`）は入れない |
| | `backupFileName(now)` → `kidori-simple-バックアップ-2026-10-22.json` | 端末の日付 |
| `read.ts` | `readTransferFile(text)` → `{ ok: true, kind: 'job', file, summary: { jobName, partCount } }` ／ `{ ok: true, kind: 'backup', file, summary: { jobCount, jobNames } }` ／ `{ ok: false, message: '読み込めませんでした' }` | 空・JSON でない・形が違う・`app` が違う（kidori のファイルを含む）・`version` が違う・20MB 超は読めない。例外を投げない。先頭の BOM は外す |
| `importFile.ts` | `importTransfer(data, file, newId, now)` → `{ data, jobIds, addedAdjusts, message }` | 今の `AppData` に足した新しい `AppData`（下） |

- **取り込み**（`importTransfer`）：仕事・部材・固定した1枚の id を `newId('job' | 'part' | 'frozen')` で振り直し、仕事の一覧の後ろにコピーとして足す（今ある仕事・コピーした部材は変えない）。仕事の名前が今の仕事と重なれば「棚のコピー」「棚のコピー2」（暫定）
  - 調整寸法：ファイルの調整寸法ごとに、表示名（`adjustNameKey`）が同じものが今の一覧にあればその id、無ければ `newId('adjust')` で一覧の後ろに足す。式の `{n:id}` を `formula/usages.ts` の `remapAdjustIds(expr, map)` でつけ替える（ファイルに無い id＝削除した調整寸法はそのまま）
  - 共有（`kind: 'job'`）：固定した1枚・仕上がりの完了は無し（ファイルに入っていても外す）。作った日・変えた日は `now`
  - バックアップ（`kind: 'backup'`）：固定した1枚（片の `partId`・`pieceId`・`checked` を新しい部材の id につけ替える）・仕上がりの完了も戻す。作った日・変えた日はファイルのまま
  - `message`：「「本棚」を取り込みました」／「3件の仕事を追加しました」。保存（`updatedAt` を付けない・開く仕事を変えない）は store の側で行う
- **形の確かめ**（`src/engine/shape.ts`）：仕事・部材・調整寸法・コピーした部材の形の確かめ（`isJob`・`isAdjust`・`isCopiedPart`・`isRecord`）を `store/storage.ts` から engine に移し、保存データの読み込みとファイルの読み込みで同じものを使う

### 7.3 部材の表（U-11。`src/ui/components/PartsTable.tsx`・`src/ui/partsTable.ts`）

- ［仕上がり］のタブは部材の表（番号・名前・W・H・枚数）。行の数は `tableRowCount`（10行か、部材の数 ＋ 空の行1つ）。選んでいる欄は部材の id で持つ（空の行は id なし）
- 名前は `<input>`（スマホのキーボード）。書きかけは画面に持ち、確定（キーボードの「次へ」・ほかの欄・表の外・キーボードを閉じる）で `updatePart` / `addPart`。W・H・枚数は `<button>` で、押すと画面の下にアプリのキー（`FormulaKeys.tsx`：編集シートの式の入力と同じ部品。枚数は数字だけ）。キーを押すたびに `updatePart`（空の行なら `addPart`。枚数は空から）
- 何も入っていない部材（`isBlankPart`）は、選んでいない間に `removePart` で外す。途中の空の行を押すと、いちばん上の空の行に入る（`inputRow`）
- 「次へ」は `nextCell`。名前へ移るときは、押した操作の中で次の行の `<input>` に注目を移す（スマホのキーボードが出るように）
- 番号を押すとメニュー（`PartMenu.tsx`。下から出るシート）：回転・仕上がりの完了は `updatePart`、複製は `duplicatePart`、上に行を入れるは `insertPart`（その位置に空の部材を入れ、`PartsTable` の `editName` で名前の欄を選ぶ）、削除は `removePart`（`partsReferencing` で使われていれば確認）（U-12）
- 「全部回転してよい」は `rotationState`（全部／一部／なし）と `setAllRotatable`。「選んで削除」は `removeParts`（確認の注意は `referencingOthers`＝`partsReferencing` をまとめたもの）（U-12）
- ［木取り］のタブは `CutTable.tsx`（同じ表の形で見るだけ。`cutDimCell`・`cutQuantityText`・`partCutProgress`）。部材の編集シート（PartEditor）・古い一覧（PartRow）・式の欄（FormulaInput）はなくした（U-12）

## 8. 第1.2版の変更（仕様書 16章）

### 8.1 セルのコピーと貼り付け（E-12。`src/engine/clipboard/cells.ts`）

```ts
// types.ts
export type CellCol = 'name' | 'W' | 'H' | 'qty'                 // 表の列（左から）
export const CELL_COLS: readonly CellCol[] = ['name', 'W', 'H', 'qty']
export interface CellPos { row: number; col: CellCol }           // row は表の行（0 から。job.parts の位置。部材の数以上は空の行）
export interface CellClip { rows: number; cols: number; cells: string[][] } // cells[行][列]。名前・式は書いたまま、枚数は数字の文字、空は ''
// AppData.cellClip: CellClip | null（最後の1回分。ほかの仕事でも貼れる）
```

| 関数 | 内容 |
|---|---|
| `selectionShape(cells)` | `{ kind: 'none' }`／`{ kind: 'range', top, left, rows, cols }`（1つのセルは 1×1。left は列の位置 0〜3）／`{ kind: 'scattered' }`。押した順・同じセルの重なりは問わない |
| `cellText(job, pos)` | セルの中身の文字（空の行は ''） |
| `copyCells(job, cells)` | `{ ok: true, clip }`／`{ ok: false, message: 'コピーは1つのセルか、四角い範囲を選んでください' }` |
| `pasteCells(job, clip, cells, newId)` | `{ ok: true, job, pasted, skipped: { cell, reason, message }[], renamed }`（renamed は第1.4版。10.2）／`{ ok: false, message: '貼るセルを選んでください' }`。reason は `invalidName`（名前に使えない文字。validatePartName の文）・`notQuantity`（枚数には 0 以上の整数だけ貼れます） |
| `clearCells(job, cells)` | 中身を空に（枚数は null）。行の全部の欄が空になった部材（`parts.ts` の `isBlankPart`）は消す |
| `deleteRows(job, cells)` | 選んだセルのある行の部材をまとめて消す。`selectedPartIds(job, cells)` で消す部材の id（式で使われているかは `ui/partsTable` の `referencingOthers`＝`partsReferencing` で確かめる） |

- **貼り付け**：1×1 のコピーは選んだセル全部に同じもの。範囲のコピーは選んだセルの一番左上（いちばん上の行・いちばん左の列。四角でない選び方なら外枠の左上）から同じ形。枚数の右にはみ出す列は貼らない（貼れなかった数にも入れない）
- 空の行（部材の数以上）に貼ると部材を作る（`newId('part')`・名前と W・H は空・枚数は空・回転しない）。途中の空の行も、部材の後ろに上から詰めて足す（暫定）。空だけを貼った行は作らない
- 名前は前後の空白を外して入れる。（第1.4版で変えた：重なる名前は貼らずに番号を振る。10.2）第1.2版：貼ったあとに名前のある部材どうしで同じ名前（`normalizePartName`）になるものは貼らない：元のまま残る名前と重なる名前は貼らず、貼るものどうしで重なるときは上（左）の1つだけ貼る（入れ替え A・B → B・A は貼れる）。ほかの式の参照は書き換えない（名前の変更ではない）
- W・H は文字のまま式として入れる（読めなければ計算のエラー）。枚数は 0 以上の整数（全角の数字も）だけ、空は空に
- 貼って行の全部の欄が空になった部材は消す。1つも貼れなかったときは同じ仕事を返す
- **保存データ**：`store/storage.ts` の `parseAppData` は `cellClip` を `shape.ts` の `isCellClip` で確かめ、形が違えば null（仕事は読める）。第1.1版までの `clipboard` はあっても読んで捨てる。バックアップ・共有のファイルには入れない
- **store**（`reducer.ts`）：`{ type: 'copyCells', cells }`（`cellClip` を置き換える。仕事は変えない）、`{ type: 'pasteCells', cells }`（結果の `paste: { pasted, skipped }`）、`{ type: 'clearCells', cells }`、`{ type: 'deleteRows', cells }`（空の行だけなら「削除する行を選んでください」）。どれも `jobId` を省くと開いている仕事。古い `copyParts`・`pasteParts`・`removeParts` と `jobs.ts` の `removeParts` はなくした
- 画面の古い「選んでコピー」「貼り付け（◯件）」「選んで削除」と `PastePreview.tsx` は外した。新しい画面は U-14

### 8.2 枚数のキー・行を足す・調整寸法（U-15。spec 16.2・16.5・16.6）

- 枚数のキーも `FormulaKeys.tsx` を使う（`quantity: { onKey }` を渡すと数字・1字消す・全部消す だけ押せ、調整寸法のボタン・＝・記号・( )・◀▶・小数点は同じ場所に薄く出して押せない）。「閉じる」「次へ」は `FormulaKeys` の `onClose`・`onNext`（W・H・枚数で同じ位置）
- 「＝」（第1.6版 20.2）：式の文字には入れず、`PartsTable` の `equals` で持つ。開くときは `formulaEdit.ts` の `opensAsFormula`（部材の寸法・調整寸法を使っている式か、先頭に「＝」が付いた式）。engine は式の先頭の「＝」「=」を読み飛ばす（`tokenize.ts` の `splitChunks`・`splitLeadingEquals`）。色の枠は `refColorsOf`・`refCellsOf`
- 調整寸法のボタンの欄の「＋ 追加」：`FormulaKeys` の `onAddAdjust(draft)`（`PartsTable` が store の `addAdjust` を呼び、足した id を返す）。重なりの判定は `store/jobs.ts` の `validateAdjust`。足したら `{n:id}` をカーソルの位置に入れる
- 「＋ 5行足す」：`ui/partsTable.ts` の `tableRowCount(partCount, minRows)`・`addRowsMin`。足した行の下限は `sessionTableMinRows`／`setSessionTableMinRows`（モジュールの中の Map。仕事ごと・保存しない）
- 部材の画面の上のたたんだ欄は `AdjustPanel.tsx`（中身は `AdjustList.tsx`）

### 8.3 板〜切り方を木取りの画面へ・切り代（U-16。spec 16.3・16.4）

- 木取りの画面の上は `BoardSettings.tsx`：［3×6］［4×8］は `compareStandardSizes` の枚数・歩留まり、［自由入力］は今の板の `packJob` の結果。押すと `setSheet`。刃厚・端切り・切り代・切り方は `updateSettings`。「3×6 と 4×8 の比べ」の別の欄はなくした
- 部材の画面の［木取り］のタブのときだけ、表の上に切り代の欄（`NumberField`・`updateSettings`）。木取りの画面の切り代と同じ `job.settings.allowance`
- 部材の画面の `SettingsPanel.tsx` はなくした

## 9. 第1.3版の変更（仕様書 17章）

### 9.1 範囲・切り取り・オートフィル（E-13。`src/engine/clipboard/cells.ts`）

```ts
// types.ts
export interface CellRange { top: number; left: number; rows: number; cols: number } // left は列の位置（0＝名前 … 3＝枚数）
export interface CellCut { jobId: string; range: CellRange }                          // 切り取った元
export interface CellClip { rows: number; cols: number; cells: string[][]; cut?: CellCut } // cut が無ければふつうのコピー
// cells.ts
export type CellSelection = CellRange | readonly CellPos[]  // 今までの関数は、セルの配列でも四角でも受け取る
```

| 関数 | 内容 |
|---|---|
| `rangeCells(range)` | 四角 → セルの配列（上から・左から。表の左右・0 より上ははみ出さない） |
| `rowRange(top, rows = 1)` | 行全体＝名前〜枚数（left 0・cols 4） |
| `columnRange(job, left, cols = 1)` | 列全体＝上から部材の数の行（空の行は入れない。部材が無ければ1行） |
| `selectionRange(sel)` | 四角（1つのセルも）なら表の中に収めた四角、それ以外は null |
| `cutCells(job, sel)` | コピーと同じ結果に `clip.cut = { jobId: job.id, range }` を付ける。仕事は変えない |
| `pasteCells(job, clip, sel, newId)` | 第1.2版と同じ。結果に `cutClear: { jobId, cells } \| null` が増えた（切り取りを違う仕事に貼ったとき、元の仕事で空にするセル） |
| `clearCutSource(job, clip, cells)` | 違う仕事に貼ったあと、元の仕事のセルを空にする（切り取ったあとに書き換えたセルは空にしない） |
| `fillCells(job, from, to, newId)` | オートフィル。結果は `pasteCells` と同じ形（`cutClear` はいつも null）。範囲でない from は `{ ok: false, message: '引く元の範囲を選んでください' }` |

- **切り取りの貼り付け**：元のセルを空にする。空にしないのは、貼る先と重なるセル・クリップのその位置が1つも貼れなかったセル（同じ名前・枚数に式など）・切り取ったあとに中身を書き換えたセル。同じ仕事なら、元を先に空にしてから名前の重なりを比べる（同じ仕事の中で名前ごと動かせる）。全部の欄が空になった部材は消える。1つも貼れなければ何もしない
- **オートフィル**：to は引いたあとの範囲（元を含む）でも、元を除いた所だけでもよい。元の行は書かず、列はいつも元の列（上下だけ）。行 r には元の `(r − top) mod rows` 番目の行を入れる（上へ引いても並びがつながる）。名前の列も入れ、重なる名前には番号を振る（第1.4版。10.2。第1.3版の `fillName` はなくした）。枚数・W・H・行が足りないときの部材の足し方は貼り付けと同じ
- **保存データ**：`shape.ts` の `isCellClip` は cut を無くてもよいとし、あれば形を確かめる（`isCellRange`）。`readCellClip` は cut だけ形が違えば cut を外してふつうのコピーとして読む。第1.2版の保存データはそのまま読める
- **store**（`reducer.ts`）：選んだセルは `SelectionArg = { cells: CellPos[] } | { range: CellRange }`。`copyCells`・`cutCells`・`pasteCells`・`clearCells`・`deleteRows` はどちらでも呼べる。`{ type: 'cutCells', range }`（cellClip を置き換える。仕事は変えない）、`{ type: 'pasteCells', range }`（切り取りなら元を空にし、ほかの仕事でも空にして updatedAt を付ける。1つでも貼れたら cellClip から cut を外す）、`{ type: 'fillCells', from, to }`（結果の `paste: { pasted, skipped }`）

## 10. 第1.4版の変更（仕様書 18章）

### 10.1 切り方の「おまかせ」をなくす（E-14。spec 18.2）

- `CutMode = 'vertical' | 'horizontal'`。`packJob` は設定の切り方だけで並べる（縦切り・横切りの比べ `preferFirst`・`largestScrap` はなくした）。2つの並べ方の比べ（`chooseWay`）はそのまま
- `shape.ts` の `isJob`（`isSettings`）は 'vertical'・'horizontal' だけを通す。古いデータは **`readJob(v)`・`readJobs(v)`** で読む：`settings.cutMode === 'auto'` なら 'vertical' にしてから `isJob` で確かめる（spec 18.2【案】）
- 使う所：`store/storage.ts` の `parseAppData`（保存データ）、`transfer/read.ts` の `readTransferFile`（共有・バックアップのファイル）。読んだあとの仕事はもう 'auto' を持たない
- `store/jobs.ts` の `updateSettings` も 'auto' を断る（「切り方が正しくありません」）。画面の切り方のボタン（`ui/settings.ts` の `CUT_MODES`）は2つ、木取りの画面の「おまかせで選択」の印はなくした

### 10.2 名前を貼る・オートフィルで番号を振る（E-14。spec 18.3。`clipboard/cells.ts`）

- `pasteCells`・`fillCells` の名前の欄は `assignNames(parts, writes)` で決める（parts は同じ仕事の切り取りの元を空にしたあと）
  1. 前後の空白を外す。名前に使えない文字なら貼らない（`invalidName`。今までどおり）
  2. 書く先が今と同じ名前（`normalizePartName`）なら、今の名前のまま（コピー元のセルが貼る先に入っていても名前は変えない）（暫定）
  3. 「残る名前」＝書かない行の名前（使えない名前で貼らなかった行も今の名前が残る）。残る名前と重なる、または貼るものどうしで重なる名前は **後ろに番号を振る**。重ならない名前はそのまま（切り取りで動かす・ほかの仕事から貼る・入れ替え A・B → B・A）
  4. 番号は 1 から、残る名前・そのまま貼る名前・先に振った名前のどれとも重ならない一番小さい番号。上から・左から順に振る。比べは `normalizePartName`（「棚板１」があれば「棚板2」）
  5. 名前の終わりが数字（半角・全角）なら、その数字を外した名前に番号を振る（「棚板1」を貼って重なれば「棚板2」。「棚板11」にしない。spec 18.3【案】。U-20 で直した）。数字だけの名前は外すと空になるので、そのまま後ろに振る（「12」→「121」）（暫定）。貼るものどうしだけが重なるときも全部に振る（棚板 を3つに貼る → 棚板1・棚板2・棚板3）（暫定）
- 結果に **`renamed: { cell, from, to }[]`**（番号を振ったセル。上から・左から）を足した。store の `PasteSummary` にも `renamed`。`PasteSkipReason` は `'invalidName' | 'notQuantity'` だけ（`duplicateName`・`fillName` と `DUPLICATE_NAME_MESSAGE`・`FILL_NAME_MESSAGE` はなくした）
- オートフィルは名前の列も入れる。元の名前が空なら空を入れる（W・H と同じ）（暫定）

### 10.3 式の「入れている途中」の印（E-14。spec 18.5）

- `FormulaError.incomplete?: true`・`DimensionError.incomplete?: true`。付くのは syntax のエラーで、次の形のとき：
  - 空（「数値か式を入れてください」）
  - 終わりが記号か「(」（`全体.W -` →「式が「−」で終わっています（後ろに数値か部材の寸法を入れてください）」。`-` だけ・`全体.W - -` も）
  - かっこが閉じないまま終わる（「閉じかっこ「)」が足りません」）
  - 終わりが「1.」（小数点の後ろの数字がまだ。「「1.」の小数点の後ろに数字を入れてください」）（暫定）
- 途中の形より前に別のエラーがあれば、そのエラー（印なし。例：`全体.W 0 -`）
- 参照している寸法に伝わったエラー（`from` のあるもの）には付けない（暫定）。画面は入力中のセルの寸法のエラーのうち `incomplete` のものを出さない
- 式だけを確かめる関数：`isIncompleteFormula(expr)`（`formula/parse.ts`）
- 仕様書 18.5 の書き足し（入力中は「50全体.W − 厚み20」のような記号の抜けも含め、式の書き方のエラーを出さない）に合わせるなら、画面は入力中のセルの `kind === 'syntax'` のエラーを全部出さない（`incomplete` は「途中で終わっている」形の印として残す）

### 10.4 エラーの文を画面に見えている言葉に（E-14。spec 18.6）

- `parse(expr, adjusts?)`・`evaluateExpr(expr, lookup, adjusts?)`・`resolve(parts, adjusts?)` に調整寸法の一覧を渡せるようにした（`computeDimensions(job, adjusts)` は渡している）
- 字句の書き方は `tokenLabel(tok, expr, adjusts?)`：数値はそろえた数字、参照は「全体.W」、調整寸法は `adjustName`（無ければ「（削除した調整寸法）」、一覧を渡さなければ「調整寸法」）、記号は + − × ÷ ( )
- 文の一覧：

| 形 | 文 |
|---|---|
| 値が2つ続く | 「全体.W」と「メラミン1」の間に ＋ − × ÷ のどれかを入れてください（数字・かっこも同じ形） |
| 終わりが記号・( | 式が「−」で終わっています（後ろに数値か部材の寸法を入れてください） |
| 式の始めの + × ÷ ) | 式の始めに「×」は置けません |
| 記号・( のすぐ後ろの + × ÷ ) | 「+」のすぐ後ろに「×」は置けません |
| ( ) | かっこ「( )」の中が空です |
| かっこが閉じない | 閉じかっこ「)」が足りません |
| ) が多い | 閉じかっこ「)」が多すぎます（対になる「(」がありません） |
| 空 | 数値か式を入れてください |
| 部材名だけ | 「全体」が読めません（部材の寸法は「全体.W」「全体.H」のように書きます） |
| 読めない {…} | 「{t:x}」は読めない参照です（調整寸法はキーの「調整寸法」から入れ直してください） |
| 0 以下 | 計算結果が 0 以下になります（−200） |
| 参照先のエラー | 参照している「天板.W」が計算できません（…） |

- 天板.D・存在しない部材・削除した調整寸法・0 で割る・循環参照の文は今までどおり

### 10.5 画面の直し（U-20。spec 18.1・18.4・18.5・18.7）

- 空の行の名前の欄は、薄い「名前」の字（手引き）を出さない
- 部材の表の見出しは W・H を2段（「W／妻手」「H／長手」。下の段は 10px）。キーの上の行は「棚板 W（妻手）」。部材名が長いときは名前だけ「…」
- 入力中のセル（W・H のキーを出しているセル）は `ui/partsTable.ts` の `errorsWhileEditing` で出すエラーを決める：kind が syntax・nonPositive・divideByZero のもの（参照先から伝わった from のあるものは除く）は出さない。表の欄も、出さないエラーだけなら赤い「エラー」にせず空に見せる。入力を終えたら今までどおり
- 式の入力（`ui/formulaEdit.ts` の `insertAt`）は、前の単位のすぐ後ろに入れる（先頭に 5・0 と入れても「5 0」と離れない）
- キーの上の行の式を押すとカーソルが移る：`FormulaView` の `onCaret`。単位ごとの箱を測り `caretFromTap(boxes, x, y)`（押した高さに近い行の中で、単位の左半分なら前・右半分なら後ろ）
- 貼り付け・オートフィルで番号を振ったら、知らせに「。同じ名前にならないよう番号を振りました」を足す（`ui/cellSelect.ts` の `pasteText`・`fillText` の第3引数）

## 11. 第1.5版の変更（仕様書 19章）

### 11.1 板を減らせるときのお知らせ（E-15。spec 19.2。`src/engine/hints/saving.ts`）

- kidori の `hints/saving.ts` をコピーして直した。外したもの：材料ごとの分け（`materials` の配列）・重ね切りの組（`stackLabel`・`plan`）・手持ちが足りない材料の除外（`noStock`）・「切り代はフラッシュの部材だけ」の決まり・部材ごとの切り代の上書き。板は1種類（`settings.sheet`）
- 入口は **`findSavingHint(job, adjusts): SavingHint | null`**（kidori は材料ごとの配列 `findSavingHints(job)`。簡易版は板が1種類なので1つか null）
  - `SavingHint = { change: { kind: 'allowance' | 'trim', value }, from, to, message }`。`from`・`to` は固定した1枚を含む必要な板の枚数（`PackingResult.sheetCount`）
  - `message` は「切り代を 7mm にすると、板が 1 枚減ります」（`savingMessage(kind, value, from, to)`。値は小数第1位まで）（暫定：kidori の「（2枚 → 1枚）」は付けない。仕様書 19.2 の例のとおり）
- 試す値は `smallerSteps(今の値)`：今の値より小さい整数を大きい順に 1 まで、最後に 0.5（0 は試さない。今の値が小数なら切り捨てた値から。0.5 以下なら試さない）。kidori と同じ
- 流れ：今の設定で `packJob(job, computeDimensions(job, adjusts))`。枚数が 1 枚以下なら null。切り代を大きい値から試し、**枚数が減り入らない部材が増えない最初の値**（＝減る一番大きい値）で返す。切り代で減らなければ端切りを同じように。同時には変えない。板・切り方・刃厚は今のまま
- 減った所で止める（kidori は全部の材料が出たら止める。1種類なので同じ結果）。計算は最大で 1 ＋ 切り代の試す数 ＋ 端切りの試す数 回の `packJob`（初期値 切り代10・端切り5 なら 16 回）。部材 120 枚で 1 秒以内をテストで確かめた
- 固定した1枚（`frozenSheets`）は `packJob` と同じくそのまま数え、残りの部材だけで試す（kidori と同じ）
- 仕事のデータは書き換えない。画面は切り代・端切り（設定）・部材・調整寸法・固定した1枚が変わったら計算し直す
- kidori の画面（`SavingHints.tsx`）はお知らせを押しても値を変えない（知らせるだけ。「設定は変えていません」と添える）

## 12. 第1.7版の変更（仕様書 21章）

### 12.1 調整寸法の表の行と書きかけ（E-16。spec 21.1。`src/engine/types.ts`・`src/engine/adjusts.ts`）

```ts
// types.ts
export interface AdjustRow { id: string; name: string; value: number | null } // 表の1行。名前は空も可、寸法は 0 より大きい数か空
// AppData.adjusts: AdjustRow[]（第1.6版までは Adjust[]。Adjust は AdjustRow の「そろった」形なので、今までの保存データはそのまま読める）
// AppData.adjustClip: AdjustClip | null（調整寸法の表のクリップ。部材の表の cellClip とは別）
export type AdjustCol = 'name' | 'value'; export const ADJUST_COLS = ['name', 'value']
export interface AdjustCellPos { row: number; col: AdjustCol }            // row は AppData.adjusts の位置（行の数以上は空の行）
export interface AdjustClip { rows: number; cols: number; cells: string[][]; cut?: CellRange } // 範囲の left は 0＝名前・1＝寸法
```

- **書きかけの行**（名前だけ・寸法だけ）も `AppData.adjusts` に持つ。`Adjust`（名前と寸法がそろったもの）の型は変えない
- **式で使えるのは名前があり寸法が 0 より大きい行だけ**：`usableAdjusts(rows): Adjust[]`（表の並び。同じ配列を渡せば同じ配列を返す＝画面の useMemo 用）。式・表示・計算・木取り・お知らせ（`computeDimensions`・`formulaText`・`formulaLabels`・`parse`・`findSavingHint` など）には、いつも `usableAdjusts(data.adjusts)` を渡す（型で `AdjustRow[]` は渡せない）
- 書きかけの行を使っている式は、一覧に見つからないので「削除した調整寸法」と同じエラー（`unknownAdjust`）・表示（「（削除した調整寸法）」）。id は残るので、寸法を入れ直せば式は元に戻る
- 名前も寸法も空の行は保存しない（`isBlankAdjustRow`）。消すのは クリア・貼り付けで空になったとき・保存データの読み込み（`readAdjustRows`）・画面が入力を終えたとき（`dropBlankAdjustRows`・store の `removeAdjusts`）
- `adjusts.ts` のほかの関数：`isUsableAdjust`・`parseAdjustValue(text)`（空 → null、0 より大きい数（全角・小数）→ 数、それ以外 → undefined）・`adjustValueText(value)`・`adjustConflict(rows, row, exceptId?)`（表示名が同じになる、式で使える行）・`duplicateAdjustMessage`（「メラミン1」はもうあります）
- **保存データ**：`shape.ts` の `isAdjustRow`・`readAdjustRows`（形が違う行・同じ id があれば読めない。空の行は外す）、`isAdjustClip`・`readAdjustClip`（無い・形が違えば null、cut だけ違えば外す）。`store/storage.ts` の `parseAppData` が使う
- **ファイル**：共有（`jobFile`）・バックアップ（`backupFile`）には式で使える行だけを入れる（書きかけの行は入れない（暫定）。ファイルの形は第1.6版と同じなので前の版でも読める）。取り込み（`importTransfer`）は今の表の書きかけの行とは合わせない（式で使える行と表示名で合わせ、無ければ足す）。見本（`sampleJob`）も式で使える行からメラミン1 を探す
- `store/jobs.ts` の `validateAdjust`・`addAdjust`・`updateAdjust`・`removeAdjusts` は `AdjustRow[]` を受ける（重なりは式で使える行とだけ比べる）。今までの store の `addAdjust`・`updateAdjust`・`removeAdjusts` の操作は残した

### 12.2 調整寸法の表のセル操作（E-16。spec 21.1。`src/engine/clipboard/adjustCells.ts`）

部材の表の `cells.ts` と同じ考え方・同じ形の結果。選んだセルは `AdjustSelection = CellRange | readonly AdjustCellPos[]`。

| 関数 | 内容 |
|---|---|
| `adjustRowRange(top, rows = 1)`・`adjustColumnRange(rows, left, cols = 1)`・`adjustRangeCells(range)`・`adjustSelectionShape`・`adjustSelectionRange` | 行全体（left 0・cols 2）・列全体（行のある所まで）など |
| `adjustCellText(rows, pos)` | 名前、または寸法の数字の文字（丸めない。空は ''） |
| `copyAdjustCells(rows, sel)`・`cutAdjustCells(rows, sel)` | `{ ok: true, clip }`／`{ ok: false, message: 'コピーは1つのセルか、四角い範囲を選んでください' }`。切り取りは `clip.cut` に元の範囲 |
| `pasteAdjustCells(rows, clip, sel, newId)`・`fillAdjustCells(rows, from, to, newId)` | `{ ok: true, adjusts, pasted, skipped: { cell, reason: 'notValue' \| 'duplicate', message }[], renamed: { cell, from, to }[] }`。1つも貼れなければ `adjusts` は同じ配列 |
| `clearAdjustCells(rows, sel)` | 中身を空に（寸法を空にすると書きかけの行。id はそのまま）。名前も寸法も空になった行は消す |
| `deleteAdjustRows(rows, sel)`・`selectedAdjustIds(rows, sel)` | 選んだセルのある行をまとめて消す（空の行だけなら同じ配列） |
| `insertAdjustRow(rows, index, id)` | 行を上に挿入（空の行。表の下なら最後に） |
| `setAdjustCell(rows, pos, text, newId)` | セルに入力。`{ ok: true, adjusts, id? }`／`{ ok: false, message }`（「寸法は 0 より大きい数を入れてください」「「メラミン1」はもうあります」）。表の下の空の行なら行を足す。空になっても行は消さない（入力の途中） |
| `dropBlankAdjustRows(rows, keepId?)` | 空の行を外す（入力中の行は残す） |
| `numberedAdjustName(name, value, rows)` | 番号を振った名前（下） |

- **貼り付けの形**：部材の表と同じ（1つのセルは選んだセル全部、範囲は左上から同じ形。寸法の右にはみ出す列は貼らない。表の下の空の行は今の行のすぐ下に詰める）
- **寸法の欄**：0 より大きい数（全角・小数も）だけ。空は寸法を空にする（書きかけ）。式・文字・0 は貼らない（`notValue`「寸法には 0 より大きい数だけ貼れます」）
- **表示名が同じになる行は作らない**
  - 名前を書く行（行のコピー・名前の列）：重なれば **名前の後ろに丸つき数字 ②③… を付ける**（例：メラミン1 をコピーして貼る → 名前「メラミン②」、表示名「メラミン②1」）（暫定）。部材のように「メラミン2」にすると表示名が「メラミン21」になり寸法と読み分けられないため。② から、表示名が重ならない一番小さい番号。名前の終わりが丸つき数字なら外してから振る（メラミン② → メラミン③）。名前の終わりの普通の数字は外さない（逃げ1 → 逃げ1②）。㊿ まで使って重なれば貼らない（`duplicate`）
  - 今と同じ表示名を書く行は名前を変えない。重ならない名前はそのまま。同じものを2つ貼るときは上はそのまま・下に番号（部材の表は全部に振る。暫定）
  - 寸法だけを書く行（名前は書かない）：重なればその寸法は貼らない（`duplicate`「「メラミン1」はもうあります」）。入れ替え（x1・x2 → x2・x1）は貼れる
  - 書きかけになる行（名前だけ・寸法だけ）は表示名が無いので、重なりも番号も無い
- **切り取り**：部材の表と同じく、元のセルを先に空にしてから重なりを比べ、貼れた位置の元は空のまま・貼れなかった位置は戻す・切り取ったあとに書き換えたセルは消さない。表はアプリに1つなので、仕事をまたいでも同じ表。**行全体（名前・寸法）を切り取って空の行へ両方を貼ったときは、元の行の id を引き継ぐ**（式がついてくる）（暫定）
- **オートフィル**：部材の表と同じ（上下だけ・くり返し・元の行は書かない）。名前には貼り付けと同じく番号を振る

### 12.3 変える・消すときの確認（E-16。spec 21.3。`src/engine/adjusts.ts`）

- `changedAdjusts(before, after)`：前に式で使えた調整寸法のうち、消えた・書きかけになった・表示名（名前・寸法）が変わったもの
- **`adjustChangeUsages(jobs, before, after, currentJobId)`** → `{ changed, usages, jobCount, otherJobCount }`
  - `changed`：値・名前が変わる調整寸法のうち、**今の仕事以外で使っているもの**。空なら確認はいらない（この仕事でしか使っていない・どこでも使っていない）
  - `usages`：changed を使っている部材（全部の仕事。今の仕事も入る。`adjustUsagesOf` と同じ形）。`jobCount` はその仕事の数（「◯件の仕事で使っています」）、`otherJobCount` は今の仕事を除いた数
  - currentJobId が null なら全部の仕事を「ほか」とみなす
- 画面の流れ：store の `adjustTableOutcome(data, action, newId)` で操作のあとの表を作る → `adjustChangeUsages(data.jobs, data.adjusts, outcome.adjusts, currentJobId)` → changed があれば確認 → `dispatch(action)`

### 12.4 store（E-16。`src/store/reducer.ts`）

- 選んだセルは `AdjustSelectionArg = { cells: AdjustCellPos[] } | { range: CellRange }`
- 操作（`AdjustTableAction`）。どれも `AppData.adjusts`・`adjustClip` だけを変える（仕事の updatedAt は変えない）

| 操作 | 結果 |
|---|---|
| `{ type: 'setAdjustCell', pos, text }` | `id`＝入れた行の id。断るときは `{ ok: false, message }` |
| `{ type: 'copyAdjustCells' \| 'cutAdjustCells', range \| cells }` | `adjustClip` を置き換える |
| `{ type: 'pasteAdjustCells', range \| cells }` | `adjustPaste: { pasted, skipped, renamed }`。切り取りなら1つでも貼れたら `adjustClip` から cut を外す。コピーが無ければ「コピーしたセルがありません」 |
| `{ type: 'fillAdjustCells', from, to }` | `adjustPaste` |
| `{ type: 'clearAdjustCells', range \| cells }` | |
| `{ type: 'deleteAdjustRows', range \| cells }` | 空の行だけなら「削除する行を選んでください」 |
| `{ type: 'insertAdjustRow', index }` | `id`＝入れた空の行の id（入力を終えて空のままなら画面が `removeAdjusts` で外す） |

- `adjustTableOutcome(data, action, newId)`：上の操作を当てたあとの `{ adjusts, adjustClip, id?, adjustPaste? }`（純粋関数。reduce もこれを使う）。画面の確認（12.3）に使う
- 画面：`PartsScreen`・`KidoriScreen` は `usableAdjusts(data.adjusts)` を使う

### 12.5 画面（U-23。spec 21.1〜21.4。`src/ui`）

- `useGrid.ts`：表のセルを選ぶ仕組み（選んでいる範囲と起点・丸い取っ手・オートフィルの取っ手・長押し・表の端でのスクロール・取っ手と点線の位置 `useGridBoxes`・キーの高さ `usePadHeight`・入力している行を見せる `useRevealRow`）。`PartsTable` から外に出し、`AdjustTable` でも使う。選んでいる範囲はアプリで1つの表だけ（`exclusive.ts` の `claimOpen('cellRange')`。ほかの表が選んだら範囲を外し、入力を終える）。取っ手と点線は `components/GridOverlay.tsx`
- `components/AdjustTable.tsx`：部材の表の下の調整寸法の表（`PartsTable` の中に置き、`picking`（「＝」の入力中に押した行を式に入れる）と `refIds`（色の枠）を受け取る）。保存データは `useJobStore` から直接。入力は確定したときに `setAdjustCell`。表を変える操作は `adjustTableOutcome` → `adjustChangeUsages` → 確認の文（`ui/adjustTable.ts` の `adjustConfirmText`）があれば確かめてから dispatch
- `ui/adjustTable.ts`：行の数（初め5行・「＋ 5行足す」はアプリを開いている間だけ）・「次へ」の行き先・行の呼び方・確認の文
- `FormulaKeys`：キーの上の調整寸法のボタンと「＋ 追加」の欄をなくした。`numeric`（数字だけのキー。`decimal` なら小数点も）で枚数・調整寸法の寸法のキーにする
- なくしたもの：`AdjustPanel`・`AdjustList`・`settings.ts` の `ADJUST_PRESETS`・`groupUsages`
- 部材の表の初めの行は5行（`TABLE_MIN_ROWS`）

## 13. 第2.0版の変更（仕様書 24章）

### 13.1 並べ替えと行の移動（U-25。`src/engine/order.ts`）

- `sortParts(parts, dims, key, order)`：`key` は `'name' | 'W' | 'H' | 'qty'`、`order` は `'asc'`（小さい順・名前はあいうえお順）／`'desc'`（大きい順・名前は逆の順）。W・H は `dims`（`computeDimensions` の結果）の仕上がり寸法、名前は `Intl.Collator('ja')`（`localeCompare('ja')` と同じ）。空・エラー（式が空、その軸にエラー、名前が空、枚数が空）は向きによらず一番下。値が同じなら今の並び（安定）
- `moveParts(parts, from, count, to)`：続いた行を、元の並びの `to` 行目の上（`to` が部材の数なら一番下）へ動かす。動かす行の中・すぐ上・すぐ下なら変わらない。`movedTop(length, from, count, to)` は動かしたあとの一番上の行。`sameOrder(a, b)` は同じ並びか
- store：`jobs.ts` の `sortJobParts`・`moveJobParts`（並びが変わらなければ同じ仕事を返す＝updatedAt を付けない）。reducer に `{ type: 'sortParts', key, order }`（W・H は `usableAdjusts(data.adjusts)` で計算）と `{ type: 'moveParts', from, count, to }`
- 画面：`PartsTable` の見出しは `HeadButton`（`useLongPress`。押すと列全体、長押しで並べ替えのシート）。番号を引く指の動きは `useGrid` の `moveRowsFrom`・`onMoveRows`（選んでいる行全体の番号だけ。その番号は CSS で `touch-action: none`）。動かす先の線は `GridOverlay` の `moveLine`。左上の丸い取っ手が番号に重なる所は、番号として扱う

## 14. 第2.1版の変更（仕様書 25章）

### 14.1 最終縦カットの位置（E-18。spec 25.3。`src/engine/packing/finalCut.ts`）

- `finalCutFromRight(layout)`：板1枚の配置（`SheetLayout`。固定した1枚の `frozen.layout` もそのまま渡せる）から、元の板の右端から いちばん左の帯の左の端 までの距離（mm。端切りを含む）。左に余りが無い（いちばん左の部材の左の端が使える範囲の左の端）・部材が無いときは `null`
- 使うのは `placements`・`usable`・`trims` だけ（`SheetLayout` の形は変えない）。帯より細い部材は帯の右に寄せて置くので、部材の左の端の最小＝いちばん左の帯の左の端。元の板の右端は使える範囲と端切りの右の端の大きいほう。保存データの形の確かめ（`isFrozenSheet`）がこの3つを保証しているので、前に保存した固定の1枚でも出せる
- 縦切り優先・横切り優先とも、その置き方の図の右から測る（画面は `layout.orientation`＝`'landscape'` なら「最終横カット」と出す）。値は切る順番（`cuts`）の最後の「帯を切る」（kind `strip`）の位置を図の右端から測った値と同じ

### 14.2 仕事ごとの履歴（E-19。spec 25.1。`src/engine/history.ts`・`src/engine/types.ts`）

- 型：`Job.history: HistoryEntry[]`（新しい順・最大 `HISTORY_LIMIT`＝20）。`HistoryEntry` は `id`・`savedAt`（ISO）・`memo`・`settings`（板のサイズは `settings.sheet`）・`parts: HistoryPart[]`（名前・W・H の式・枚数・回転・仕上がりのチェック。id は持たない）・`sheetCount`・`yieldRate`。調整寸法は入れない
- 関数（どれも元の仕事を書き換えず、`{ ok: true; job } | { ok: false; message }` を返す）
  - `historyEntry(job, result, { id, memo, now })`：今の設定と部材の写しと、`result`（画面と同じ `packJob(job, computeDimensions(job, usableAdjusts(adjusts)))`）の必要な枚数・歩留まりで1件を作る。メモの前後の空白は外す
  - `addHistory(job, entry)`：先頭に足し、20件を超えた古いものを消す。同じ id があれば断る
  - `restoreHistory(job, historyId, newId)`：設定と部材を履歴の写しに置き換え、`frozenSheets` を空にする。部材の id は `newId('part')` で新しく振る。履歴・名前・作った日は変えない
  - `setHistoryMemo(job, historyId, memo)`（同じメモなら同じ仕事を返す）・`removeHistory(job, historyId)`・`copyHistory(history)`（深い写し）
- store：reducer に `addHistory`（`memo`。結果の `id` は残した履歴の id。id は `newId('history')`）・`restoreHistory`（`historyId`）・`setHistoryMemo`（`historyId`・`memo`）・`removeHistory`（`historyId`）。どれも `jobId` を省くと開いている仕事。変わったら仕事の `updatedAt` を付ける。`copyJob` は履歴も写す
- 保存の形：キー（`kidori-simple.data.v1`）と `version: 1` は変えない。`readJob`（`shape.ts`）が、`history` の無い仕事（第2.0版までの保存データ・バックアップ・送るファイル）を空の履歴にして読む。`history` があって形が違う（並びでない・部材の形が違う・同じ id が2つ）ときは、今までの決まりどおり読めないとする
- ファイル：送るファイル（`jobFile`）は `history: []`。取り込むときも共有の履歴は外す。バックアップ（`backupFile`）は仕事のまま入れ、取り込むと履歴も戻す（履歴の部材の式の `{n:id}` も今の調整寸法の id につけ替える。履歴の id はそのまま）

## 15. 第2.2版の変更（仕様書 26章）

### 15.1 W・H は数字だけ（E-20。spec 26.1。`src/engine/size.ts`・`src/engine/dimensions/index.ts`）

- `Part.expr` の形（文字）は変えず、中身を「空か、半角の数字（小数可）」にする（暫定。前のデータ・ファイル・コピーの形をそのまま読めるように）。読み方は `size.ts`：`readSize(text)`（`{ ok: true, value }`／空・「12.」は syntax ＋ incomplete、0 以下は nonPositive、それ以外は syntax）、`isSizeText`（保存の形）、`isSizeInput`（キーで入れている途中も含む形）、`pastedSize`（貼り付け）、`sizeText`（小数第1位の数字の文字）
- **`computeDimensions(job)`**：調整寸法の引数をなくした。仕上がり ＝ 入れた数字、木取り ＝ 仕上がり ＋ 切り代。出すエラーは syntax と nonPositive だけ。`findSavingHint(job)` も同じく引数をなくした
- 貼り付け・オートフィルの W・H は数字だけ（`notSize`「W・H には 0 より大きい数だけ貼れます」）

### 15.2 前のデータの式を数字に置き換える（E-20。spec 26.4。`src/engine/migrate/`）

- `migrate/legacyDimensions.ts`：第2.1版の式の計算（`legacyComputeDimensions(job, adjusts)`）。置き換え専用。`formula/`（tokenize・parse・evaluate）と `dimensions/resolve.ts` は、これが使うので残した（display・units・`partsReferencing`・`splitLeadingEquals` は U-27 で消した）
- `migrate/numbers.ts`：
  - `numberizeJob(job, adjusts)`・`numberizeJobs(jobs, adjusts)` → `{ job(s), report: NumberingReport }`。式（`isSizeInput` でない W・H）を、そのデータの調整寸法の一覧（`LegacyAdjust[]`。書きかけの行は使えない）で計算した仕上がり寸法の数字（小数第1位）にする。エラーは空にし `report.cleared`（`ClearedSize`：jobId・jobName・partName・axis・履歴なら history）に入れる。履歴の部材も、その履歴の中で計算する。式が無ければ同じ仕事を返す
  - `NumberingReport = { replaced, cleared }`・`NO_NUMBERING`・`mergeNumbering`・`numberingMessage(report)`（知らせの文）・`clipHasFormula(clip)`
- 保存データ（`store/storage.ts`）：`readAppData(raw)` → `{ data, numbering }`（`parseAppData` は data だけ）。`loadSaved` は置き換えたら、元の文字を `BEFORE_NUMBERS_KEY_PREFIX`（`kidori-simple.data.v1.before-numbers`）＋日時の控えに残してから、置き換えたデータを保存し直す。控えを残せなければ保存しない（`canSave: false`）。`LoadResult.numbering`
- ファイル（`transfer/importFile.ts`）：`importTransfer` はファイルの `adjusts` で置き換えてから足す。結果に `numbering`（仕事の名前・id は取り込んだあと）。調整寸法の一覧に足すのはやめた（`addedAdjusts` はなくした）
- store：`StoreState.numbering`（保存しない）。`initialState` が `LoadResult.numbering` を入れ、`{ type: 'replaceData', data, numbering? }` でつなげ、`{ type: 'dismissNumbering' }` で消す

### 15.3 調整寸法・名前の重なり・名前の番号振りをなくす（E-21。spec 26.2・26.3）

- `AppData = { version: 1, jobs, cellClip }`。`adjusts`・`adjustClip` と、`AdjustRow`・`AdjustClip`・`AdjustCellPos` などの型、`engine/adjusts.ts`・`engine/clipboard/adjustCells.ts`・`engine/formula/usages.ts`・`engine/formula/rename.ts`、store の調整寸法の操作（`addAdjust`・`updateAdjust`・`removeAdjusts`・`validateAdjust`・調整寸法の表の操作・`adjustTableOutcome`）、`defaultAdjusts`・`adjustNameKey`・`referableParts` はなくした。`Adjust`（前の版の調整寸法）と `adjustName` は置き換え・式の表示のために残した
- `shape.ts` の `readLegacyAdjusts`：前の保存データの `adjusts` を置き換えのためだけに読む（無ければ空）
- 部材の名前：同じ名前でもよい・使える文字の決まりも無い（暫定）。名前を変えても式の書き換えは無い。貼り付け・オートフィルは書いたまま（番号を振らない。`renamed` はなくした）
- 送るファイル・バックアップ：`jobFile(job)`・`backupFile({ jobs })`。`adjusts` はいつも `[]`（形は変えない）

### 15.4 画面：数字だけのキー・置き換えの知らせ（U-27。spec 26.1〜26.4）

- 部材の表のキーは `ui/components/PadKeys.tsx`（5列 × 4段：全部消す 1 2 3 ⌫ ／ ◀ 4 5 6 ▶ ／ 閉じる（2段） 7 8 9 次へ（2段） ／ 0（2列） .）。W・H も枚数も同じ並びで、枚数は小数点・◀ ▶ を押せない。`FormulaKeys.tsx`・`ui/formulaEdit.ts` はなくした
- W・H の数字の編集は `ui/sizeEdit.ts` の `pressSizeKey(text, cursor, key)`（カーソルは文字の位置。入れたあとの形は engine の `isSizeInput`。先頭の「.」は「0.」、先頭の余分な 0 は外す。8字まで）。枚数は今までどおり `ui/numpad.ts`
- キーの上の行は 部材の名前・W（妻手）・入れている数字とカーソル。入れている途中（incomplete）でないエラー（0 以下など）は赤で理由を出す（`errorsWhileEditing`）。入力中のセルは赤い「エラー」にしない
- 表の W・H の欄は数字かエラーだけ（`ui/partCells.ts` の `dimCell(dims, axis, tab)`。式の表示・ƒ・色の枠はなくした）。行を削除の確認から、式で使われている部材の知らせ（`referencingOthers`）をなくした
- 置き換えの知らせは `ui/App.tsx` の上の帯：`numberingMessage(state.numbering)` の文と「閉じる」（`dismissNumbering`）。エラーで空にしたものがあれば注意の色（warn）、無ければ ok の色。長いときは帯の中だけスクロール（高さは画面の 30% まで）

## 16. 第2.3版の変更（仕様書 27章）

### 16.1 数字だけの計算式（E-22。spec 27.1・27.4。`src/engine/size.ts`）

- `Part.expr` の形（文字）は変えず、中身を「空・数字・数字と ＋ − × ÷ ( ) だけの式」にする。保存する式は `normalizeSizeText` でそろえた形（半角の数字と `+ - * / ( )`・空白なし。例 `(900-18)/2`）。キーで入れている途中の形（`12.`・`450-`・`(900-18`）も保存できる
- 読み方は `readSize(text)`：数字はそのまま、数字だけの式は `formula/` の `parse`・`evaluate` で計算する（× ÷ が先・( ) が先・先頭や ( の直後の − は符号。値は丸めない）。部材の寸法・調整寸法の参照は、使える文字（数字・小数点・+ − × ÷ ( )・空白。全角と × ÷ −（U+2212）はそろえる）を先に確かめて受け付けない。「＝」も使えない
  - エラー：syntax（計算できない式・使えない文字。終わりが記号・かっこが閉じていない・最後が「12.」は incomplete）、divideByZero（0 で割る）、nonPositive（結果を小数第1位に丸めて 0 以下。「計算結果が 0 以下になります（−50）」）
  - parse の「後ろに数値か部材の寸法を入れてください」は `END_HINT` として外に出し、size.ts で「後ろに数字を入れてください」に言い換える
- 画面用：`isSizeInput`（入れられる形か。途中の形も true）、`isSizeFormula`（式か。ƒ の印）、`sizeLabel`（`* / -` を `× ÷ −` に1字ずつ置き換えた表示。文字の位置は変わらない）、`sizeValueText`（表示する値。小数第1位。エラーは null）、`pastedSize`（貼り付け：数は数字の文字、値が 0 より大きい式は `normalizeSizeText` の形、ほかは undefined）
- `computeDimensions`・`packJob`・履歴・送るファイル・バックアップ・コピー・オートフィルは、今のまま（式の文字をそのまま写し、計算は `readSize` の値）
- 前のデータの置き換え（`migrate/numbers.ts`）：`isSizeInput` が false の W・H だけを置き換える。数字だけの式（途中の形・エラーの式も）はそのまま。先頭に「＝」の付いた数字・数字だけの式は「＝」を外してそろえた形にする（置き換えたことになる）。アプリ内のコピー（前の版の `cellClip`）は、部材の寸法・調整寸法・「＝」の入ったセルがあるときだけ捨てる（`clipHasFormula`）

### 16.2 切り代の初期値 0（E-23。spec 27.6。`src/engine/types.ts`）

- `DEFAULT_SETTINGS.allowance` を 10 → 0。新しい仕事（`defaultSettings`・`createJob`）と見本（`store/sample.ts`）がこの値を使う。保存してある仕事・取り込んだ仕事は、仕事の `settings.allowance` をそのまま読む（`shape.ts` は切り代の無い仕事を読めないとするので、初期値で埋めることは無い）
- 6章の例（木取り 410×1810 など）を使うテストは、見本の仕事（`fixtures/shelf.ts`）で切り代 10 を指定する

### 16.3 画面：式のキー・ƒ・表の上の欄（U-28。spec 27.1〜27.3）

- キーは `ui/components/PadKeys.tsx`（6列 × 4段：全部消す 1 2 3 ÷ ⌫ ／ ◀ 4 5 6 × ▶ ／ ( 7 8 9 − ) ／ 閉じる 0（2列） . ＋ 次へ）。記号のキーは `onKey` に保存の形の半角（`+ - * / ( )`）を返す。枚数（`size={false}`）では記号・小数点・◀ ▶ を押せない
- 編集は `ui/sizeEdit.ts` の `pressSizeKey`（`SizeKey` に `SizeOpKey` を足した）。入れたあとの形は engine の `isSizeInput`。1つの数は `SIZE_MAX_LEN`（8字）、式の全体は `SIZE_FORMULA_MAX_LEN`（30字）まで。数の始めの「.」は「0.」、余分な 0 は外す
- キーの上の行・表の上の欄は engine の `sizeLabel` で × ÷ − の書き方にする（1字を1字に置き換えるので、カーソルの位置はそのまま）
- ƒ：`PartsTable` の幅・長さのセルで、engine の `isSizeFormula(part.expr[axis])` なら右上に `.pt-fx`。値は今まで通り `computeDimensions` の結果
- 表の上の欄：`ui/partsTable.ts` の `cellBarText(parts, range)`（範囲の左上のセルが幅・長さなら `sizeLabel(expr)`、ほかは ''）。`PartsTable` の `.pt-bar`（ボタン）。入力中は `cursor` の位置にカーソル。押すと `pressBar`（入力中・何も選んでいないときは何もしない。ほかは左上のセルで `startInput`）。表とキーの外を押したら入力を終える決まり（`useOutsideEnd`）では、欄は内側として扱う
- 入力中のエラーは今まで通り `errorsWhileEditing`（engine の incomplete＝`450−`・`(900−18` などは出さない。0 で割る・0 以下は出す）

### 16.4 画面：「幅」「長さ」（U-29。spec 27.5）

- 列の画面の名前は `ui/cellSelect.ts` の `CELL_COL_LABEL`（名前・幅・長さ・枚数）。`PartsTable`（見出し・キーの上の行・並べ替え・長押しのメニュー）と `CutTable` が使う。板の辺の `AXIS_SIDE`（妻手・長手）は今まで通り
- engine の `numberingMessage` は `AXIS_LABEL`（`migrate/numbers.ts`）で「本棚・棚板 幅」。`ClearedSize.axis` などデータの中は W・H のまま
