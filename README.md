# Noquery for X

Xの投稿で「共有」から「リンクをコピー」を選ぶと、クエリを除いたURLがコピーされるChrome拡張機能です。

```text
https://x.com/example/status/123?t=abc&s=20
→ https://x.com/example/status/123
```

パラメータ名にかかわらず、投稿リンクのクエリを丸ごと削除します。ドメイン、パス、`#`以降のフラグメントは保持します。処理はXのWebページ内に限られ、Chromeのアドレスバーからのコピーには適用されません。クリップボードの読み取り、データの保存、外部通信は行いません。

## インストール

1. Chromeで `chrome://extensions` を開き、右上の「デベロッパー モード」をオンにします。
2. 「パッケージ化されていない拡張機能を読み込む」を押し、このプロジェクト内の `extension` フォルダを選びます。
3. 開いているXのタブを再読み込みします。投稿の「共有」→「リンクをコピー」を押し、貼り付けて結果を確認できます。

## テスト

最近のデスクトップ版ChromeとNode.jsをインストールした環境で `node --test` を実行します。Chromeが標準の場所にない場合は環境変数 `CHROME_BIN` に実行ファイルを指定します。テストは一時プロファイルと検証用のページを使い、実際のXには接続しません。

## リリース

1. `extension/manifest.json` の `version` を更新し、変更を既定ブランチに入れます。
2. たとえばバージョンが `0.1.0` なら、そのコミットに `v0.1.0` を付けてリモートに送ります。

   ```sh
   git tag v0.1.0
   git push origin refs/tags/v0.1.0
   ```

Chromeのテストが通ると、GitHub Releasesに `NoQueryX-v0.1.0.zip` と `SHA256SUMS` が公開されます。ZIPを展開し、`manifest.json` があるフォルダをChromeで読み込みます。

Actionsの **Deployment** を手動で実行した場合は、テストとZIPの作成まで行い、公開はしません。ローカルでは `bash scripts/package-extension.sh` で、コミット済みの拡張を `release/` に出力できます。
