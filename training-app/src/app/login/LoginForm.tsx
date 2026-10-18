"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "ログインに失敗しました");
        return;
      }
      const next = sp.get("next");
      router.replace(next && next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("通信エラーが発生しました");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[70dvh] flex-col justify-center gap-4">
      <h1 className="text-2xl font-bold">トレーニングコーチ</h1>
      <p className="text-sm text-muted">このアプリは個人用です。パスワードを入力してください。一度ログインすると、この端末では1年間有効です。</p>
      <form onSubmit={submit} className="space-y-3">
        <input
          type="password"
          className="input text-lg"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          aria-label="パスワード"
          data-testid="login-password"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" className="btn-primary w-full py-4 text-lg" disabled={busy || !password} data-testid="login-submit">
          {busy ? "確認中…" : "ログイン"}
        </button>
      </form>
    </div>
  );
}
