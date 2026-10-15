#!/bin/bash
# クラウドセッション開始時に日本語ロケールを入れて、コマンドの出力を日本語にする
set -euo pipefail

# ローカル環境では何もしない（クラウド環境のみ）
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

if ! locale -a 2>/dev/null | grep -qi '^ja_JP\.utf-\?8$'; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null 2>&1 || true
  apt-get install -y -qq locales language-pack-ja >/dev/null 2>&1 || {
    echo "日本語ロケールのインストールに失敗しました" >&2
    exit 0
  }
fi

# このセッションで実行するコマンドに LANG を引き継ぐ
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export LANG=ja_JP.UTF-8' >> "$CLAUDE_ENV_FILE"
fi
