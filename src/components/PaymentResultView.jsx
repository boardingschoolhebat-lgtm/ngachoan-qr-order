import { useEffect, useState } from "react";
import { fetchOrderPaymentStatus } from "../lib/paymentApi";

export default function PaymentResultView({ orderId }) {
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;

    const check = async () => {
      setChecking(true);
      try {
        const data = await fetchOrderPaymentStatus(orderId);
        if (cancelled) return;
        setOrder(data);
        setError("");

        // Give the webhook a few seconds to arrive before showing a final state.
        if (data?.payment_status === "UNPAID" && attempts < 10) {
          attempts += 1;
          setTimeout(check, 2000);
          return;
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const paid = order?.payment_status === "PAID";
  const failed = order?.payment_status === "FAILED";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center space-y-5">
        {error ? (
          <>
            <p className="text-4xl">⚠️</p>
            <h1 className="text-xl font-black text-red-400">Gagal memuat status</h1>
            <p className="text-sm text-slate-400">{error}</p>
          </>
        ) : checking && !order ? (
          <>
            <p className="text-amber-500 font-bold animate-pulse text-lg">Memeriksa pembayaran...</p>
          </>
        ) : paid ? (
          <>
            <p className="text-4xl">✅</p>
            <h1 className="text-xl font-black text-emerald-400">Pembayaran Berhasil</h1>
            <p className="text-sm text-slate-400">
              Pesanan untuk meja <span className="text-amber-400 font-bold">{order?.table_number}</span> sudah
              dikirim ke dapur.
            </p>
            <p className="text-lg font-black text-amber-400">
              Rp {Number(order?.total_price || 0).toLocaleString("id-ID")}
            </p>
          </>
        ) : failed ? (
          <>
            <p className="text-4xl">❌</p>
            <h1 className="text-xl font-black text-red-400">Pembayaran Gagal</h1>
            <p className="text-sm text-slate-400">
              Silakan coba lagi atau bayar di kasir. Pesanan belum dikirim ke dapur.
            </p>
          </>
        ) : (
          <>
            <p className="text-4xl">⏳</p>
            <h1 className="text-xl font-black text-amber-400">Menunggu Pembayaran</h1>
            <p className="text-sm text-slate-400">
              Status belum berubah. Jika Anda sudah membayar, tunggu beberapa saat lalu muat ulang halaman ini.
            </p>
            {checking && <p className="text-xs text-slate-500 animate-pulse">Memeriksa ulang...</p>}
          </>
        )}

        <a
          href={window.location.pathname}
          className="inline-block bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-bold px-5 py-2.5 rounded-xl"
        >
          Kembali ke Menu
        </a>
      </div>
    </div>
  );
}
