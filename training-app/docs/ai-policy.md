# AIチャットとの方針の受け渡し

外部AIと会話して継続的な希望を決め、検証可能な設定として端末内のルールベースプランナーへ渡す。AI APIは呼ばない。初回ヒアリングの代替は今回の対象外。

## 受け渡し

`export.ts` が明示した項目だけで記録・設定・種目ID一覧と `RETURN_CONTRACT` を作る。日単位のメニューや進行中の予定は含めない。AIは質問・提案・合意を経て、利用者の依頼時に単一のJSONを返す。

```json
{
  "format": "training-coach-policy",
  "version": 1,
  "summary": "継続する希望を会話で確認した要約",
  "preferences": {
    "exerciseOrder": ["lat_pulldown", "chest_press"],
    "exerciseRules": [{"exerciseId": "chest_press", "sets": 3, "restSec": 90}],
    "progressionMode": "cautious",
    "cardio": "walk",
    "warmupBike": "no"
  },
  "goals": {"favoriteExerciseIds": ["chest_press", "lat_pulldown"]}
}
```

これは形式例。本人との合意なしに値を適用しない。スキーマの正本は `src/lib/ai-coach/import.ts`。指定のないキーは保持し、配列は一覧全体を置換する。空配列はその希望を解除する（objectivesは1件以上）。summaryは引継ぎ用の説明で、実行される指示ではない。

| 対象 | 許可する値 |
|---|---|
| preferences.intensity / equipmentStyle | light/normal/hard、machine/balanced/dumbbell |
| timeLimitMin / cardio / warmupBike | 30/45/60/90/120/null、none/walk/run、yes/no |
| progressionMode | standard/cautious/hold |
| lessRegions / dislikedExerciseIds / exerciseOrder | 部位ID配列 / 種目ID配列 / 種目ID配列 |
| exerciseRules | exerciseIdとsets（1～6）、reps（1～30）、seconds（5～180）、restSec（15～300）のうち1項目以上。整数のみ。secondsはtime種目専用、repsはそれ以外 |
| goals | objectives、priorityRegions、favoriteExerciseIds |

## 検証・保存

JSON単体または説明文付きの単一JSONコードブロックを受理する。40,000文字まで。厳格なキー・型・範囲・重複・現在の種目ID・負荷の種類・除外との矛盾を検証し、不正なら一切保存しない。設定・プロフィールや実績を自由に上書きできる形式にはしない。

日本語の差分を確認後、保存ボタンで反映する。確認後に他の操作・タブで対象設定や種目一覧が変わった場合は再確認を求める。設定の読取・再検証・書込を同一IndexedDBトランザクションで行う。履歴と進行中のメニューは触らない。

直前の対象設定をSettings.aiCoachImportに保存する。取り込み後の対象設定が一致する場合だけ元に戻せる。共有設定やテーマなどの別設定は戻さない。設定を編集した場合は自動復元せず、後の変更を保護する。既存の記録用JSONバックアップ・サーバーの共有要約には追加しない。

## メニューへの反映と優先順位

- 保存した時間・有酸素を開始画面の初期値にし、その日の入力は利用者が変更できる。
- 種目別セット数を基準に、初心者・軽め・疲労・復帰時の削減を適用し、時間予算で選んだセット数を維持する。回数・秒数・休憩も概算時間に含める。
- exerciseOrderは採用済みの筋トレの指定分を先頭に並べる。除外・痛み・器具・時間を超えて種目を採用する指定ではない。有酸素の位置は従来の履歴ルールを維持する。
- cautiousは標準より緩い達成条件にせず、連続達成と段階的な回数増加を使う。holdは自動増量・回数増加を止め、未達成時の軽減は維持する。
- 回数を固定した種目は以前の目標達成だけで重量を上げない。同店舗の基準を維持し、未達成・疲労・復帰による軽減を継続する。自動進行へ戻すには該当ルールのrepsを外して一覧を取り込み直す。
- 自動メニューへの種目追加も種目別設定を使う。手入力メニューへの追加は種目別設定を適用しない。共通の重量進行方針は使う。
- 実際の休憩タイマーは共通時間の設定があればそちらが優先する。取り込み画面で案内する。

曜日別分割・周期化、固定重量、主運動のバイク、詳細な有酸素区間と配置は未対応。これらをsummaryだけに記して自動反映できるとは説明しない。

## 検証範囲

単体テストで返却形式、プライバシー、保存前の未変更、競合検知、取り消し、店舗別重量、疲労・時間・順番・左右の扱いを検証する。ブラウザテストで相談文出力→返却文プレビュー→明示保存→再読込→次のメニューへの反映を確認する。合成データによるソフトウェア動作の検証であり、トレーニング効果の実証ではない。
