import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function OwnerView() {
  const [salesData, setSalesData] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    itemSales: {},
  });
  const [loading, setLoading] = useState(true);

  const fetchDailyReports = async () => {
    setLoading(true);

    // 1. Ambil batasan waktu hari ini (mulai jam 00:00:00 pagi ini)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 2. Tarik semua data yang berstatus DONE yang dibuat hari ini
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .eq("status", "DONE")
      .gte("created_at", startOfToday.toISOString());

    if (!error && data) {
      let revenue = 0;
      let orderCount = data.length;
      let itemsMap = {};

      // 3. Kalkulasi data secara mutakhir
      data.forEach((order) => {
        revenue += parseFloat(order.total_price) || 0;

        // Bedah struktur JSON kolom items untuk hitung kuantitas menu terlaris
        if (!Array.isArray(order.items)) return;
        order.items.forEach((item) => {
          if (!item || !item.name) return;
          if (itemsMap[item.name]) {
            itemsMap[item.name] += item.quantity;
          } else {
            itemsMap[item.name] = item.quantity;
          }
        });
      });

      setSalesData({
        totalRevenue: revenue,
        totalOrders: orderCount,
        itemSales: itemsMap,
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
        { event: "UPDATE", schema: "public", table: "orders" },
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
              <p className="text-[10px] text-slate-500 mt-1">Berdasarkan pesanan berstatus sukses (DONE)</p>
            </div>

            {/* CARD 2: TOTAL TRANSAKSI */}
            <div className="bg-slate-900 border border-slate-800/80 p-6 rounded-2xl shadow-xl relative overflow-hidden">
              <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-sky-500" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Transaksi Sukses</p>
              <h2 className="text-3xl font-black text-sky-400 mt-2 tracking-tight">
                {salesData.totalOrders} <span className="text-sm text-slate-500 font-normal">Pesanan</span>
              </h2>
              <p className="text-[10px] text-slate-500 mt-1">Total nota yang berhasil diselesaikan dapur</p>
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