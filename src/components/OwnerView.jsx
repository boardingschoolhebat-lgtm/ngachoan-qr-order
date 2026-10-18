import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function OwnerView() {
  const [salesData, setSalesData] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    itemSales: {},
    unpaidAmount: 0,
    unpaidCount: 0,
    onlineRevenue: 0,
    cashRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDailyReports = async () => {
    setLoading(true);
    setError("");

    // 1. Ambil batasan waktu hari ini (mulai jam 00:00:00 pagi ini)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 2. Tarik semua data pesanan hari ini
    const { data, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .gte("created_at", startOfToday.toISOString());

    if (fetchError) {
      setError(fetchError.message);
      setLoading(false);
      return;
    }

    if (data) {
      let revenue = 0;
      let orderCount = 0;
      let itemsMap = {};
      let unpaidAmount = 0;
      let unpaidCount = 0;
      let onlineRevenue = 0;
      let cashRevenue = 0;

      // 3. Hanya pesanan PAID yang dihitung sebagai omset
      data.forEach((order) => {
        const total = parseFloat(order.total_price) || 0;

        if (order.payment_status === "PAID") {
          revenue += total;
          orderCount += 1;
          if (order.payment_method === "ONLINE") {
            onlineRevenue += total;
          } else {
            cashRevenue += total;
          }

          if (!Array.isArray(order.items)) return;
          order.items.forEach((item) => {
            if (!item || !item.name) return;
            const quantity = Number(item.quantity) || 0;
            if (itemsMap[item.name]) {
              itemsMap[item.name] += quantity;
            } else {
              itemsMap[item.name] = quantity;
            }
          });
        } else if (order.payment_status === "UNPAID" && order.order_status !== "CANCELLED") {
          unpaidAmount += total;
          unpaidCount += 1;
        }
      });

      setSalesData({
        totalRevenue: revenue,
        totalOrders: orderCount,
        itemSales: itemsMap,
        unpaidAmount,
        unpaidCount,
        onlineRevenue,
        cashRevenue,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchDailyReports();

    // Intel Real-Time: Jika kasir/dapur pencet selesai, dashboard owner ikut ter-update otomatis!
    const channel = supabase
      .channel("owner_orders_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchDailyReports();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Mengubah object penjualan item menjadi array untuk di-sorting berdasarkan yang paling laku
  const sortedItems = Object.entries(salesData.itemSales).sort((a, b) => b[1] - a[1]);
  const maxQtySold = sortedItems.length > 0 ? sortedItems[0][1] : 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      {/* HEADER DASHBOARD */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-amber-500 flex items-center gap-2">
            📈 OWNER BUSINESS DASHBOARD
          </h1>
          <p className="text-xs text-slate-400 mt-1">SaaS Ngachoan — Laporan Omset & Analisis Produk Real-Time</p>
        </div>
        <button
          onClick={fetchDailyReports}
          className="bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 px-4 py-2 rounded-xl border border-slate-800 font-bold flex items-center gap-1.5 transition-all"
        >
          🔄 Refresh Laporan
        </button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center h-[50vh]">
          <p className="text-amber-500 font-bold animate-pulse text-lg">Memuat Data Keuangan Cloud...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
          <p className="text-red-400 font-bold text-center">Gagal memuat laporan: {error}</p>
          <button
            onClick={fetchDailyReports}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* KARTU INDIKATOR UTAMA (KPI CARDS) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* CARD 1: OMSET */}
            <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-emerald-500" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Pendapatan Hari Ini</p>
              <h2 className="text-3xl font-black text-emerald-400 mt-2 tracking-tight">
                Rp {salesData.totalRevenue.toLocaleString("id-ID")}
              </h2>
              <p className="text-[10px] text-slate-500 mt-1">Hanya pesanan berstatus LUNAS (PAID)</p>
            </div>

            {/* CARD 2: TOTAL TRANSAKSI */}
            <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-sky-500" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Transaksi Lunas</p>
              <h2 className="text-3xl font-black text-sky-400 mt-2 tracking-tight">
                {salesData.totalOrders} <span className="text-sm text-slate-500 font-normal">Pesanan</span>
              </h2>
              <p className="text-[10px] text-slate-500 mt-1">Total nota yang sudah dibayar</p>
            </div>

            {/* CARD 3: BELUM TERBAYAR */}
            <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-red-500" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Belum Terbayar</p>
              <h2 className="text-3xl font-black text-red-400 mt-2 tracking-tight">
                Rp {salesData.unpaidAmount.toLocaleString("id-ID")}
              </h2>
              <p className="text-[10px] text-slate-500 mt-1">
                {salesData.unpaidCount} pesanan belum dibayar (tidak termasuk batal)
              </p>
            </div>

            {/* CARD 4: PECAHAN METODE BAYAR */}
            <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-amber-500" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Metode Pembayaran</p>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Online</span>
                  <span className="font-black text-sky-400">
                    Rp {salesData.onlineRevenue.toLocaleString("id-ID")}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Kasir</span>
                  <span className="font-black text-amber-400">
                    Rp {salesData.cashRevenue.toLocaleString("id-ID")}
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-2">Dari pesanan lunas hari ini</p>
            </div>
          </div>

          {/* DIAGRAM MENU TERLARIS (BEST SELLER) */}
          <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl shadow-xl">
            <h3 className="text-base font-black text-slate-200 tracking-wide mb-6 flex items-center gap-2">
              🔥 PERFORMA PENJUALAN PRODUK (BEST SELLER)
            </h3>

            {sortedItems.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">Belum ada item produk yang terjual hari ini. 💸</p>
            ) : (
              <div className="space-y-4">
                {sortedItems.map(([name, qty]) => {
                  // Hitung persentase bar grafik mini berdasarkan penjualan tertinggi
                  const percentage = (qty / maxQtySold) * 100;
                  return (
                    <div key={name} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-slate-300 font-bold">{name}</span>
                        <span className="text-amber-400 font-black bg-amber-500/10 px-2 py-0.5 rounded">{qty} Porsi</span>
                      </div>
                      {/* Bar chart murni Tailwind */}
                      <div className="w-full bg-slate-950 h-3 rounded-full overflow-hidden border border-slate-800/50">
                        <div
                          style={{ width: `${percentage}%` }}
                          className="bg-gradient-to-r from-amber-600 to-amber-400 h-full rounded-full transition-all duration-500"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}