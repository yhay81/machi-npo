# Metrics

許可するイベントは `visited`、`prefecture_selected`、`searched`、`filtered`、`saved`、`official_opened`、`shortlist_copied`、`returned` です。

各行にはランダムなブラウザUUIDのSHA-256、許可済みイベント名、QAフラグ、時刻だけを保存し、35日後に削除します。都道府県、検索語、活動分野、法人ID、法人番号、氏名、住所、連絡先、IPアドレス、広告識別子はスキーマにありません。

本番は `npm run metrics`、ローカルは `pwsh -File ops/product-metrics.ps1 -Local` で確認します。利用者数は `is_qa = 0` の異なる端末IDだけを数え、自動QAは利用者に含めません。
