import Link from "next/link";

export const metadata = { title: "オフライン" };

export default function OfflinePage() {
  return (
    <div className="space-y-4 py-10 text-center">
      <h1 className="text-xl font-bold">オフラインです</h1>
      <p className="text-sm text-muted">記録はこの端末に保存されています。通信が戻ったら再読み込みしてください。</p>
      <Link href="/" className="btn-primary">
        ホームへ
      </Link>
    </div>
  );
}
