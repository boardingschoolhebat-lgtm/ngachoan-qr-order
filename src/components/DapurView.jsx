import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

export default function DapurView() {
  const [orders, setOrders] = useState([]);
  const [activePrintOrder, setActivePrintOrder] = useState(null);

  // 1. Tarik data yang berstatus PENDING maupun PROCESSING
  const fetchOrders = async () => {
    const { data, error } = await supabase
      .from("orders")
      .select("*")
      .in("status", ["PENDING", "PROCESSING"]) // Menampilkan kedua status di monitor
      .order("id", { ascending: true });

    if (!error) setOrders(data);
  };

  useEffect(() => {
    fetchOrders();

    // Listen data real-time cloud
    const channel = supabase
      .channel("orders_channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 2. Klik Cetak: Otomatis Cetak + Ubah Status ke PROCESSING (Sedang Dimasak)
  const handlePrintAndCook = async (order) => {
    setActivePrintOrder(order);
    
    // Picu dialog print Windows
    setTimeout(() => {
      window.print();
    }, 100);

    // Update status ke PROCESSING di Supabase Cloud jika sebelumnya masih PENDING
    if (order.status === "PENDING") {
      const { error } = await supabase
        .from("orders")
        .update({ status: "PROCESSING" })
        .eq("id", order.id);

      if (error) console.error("Gagal update status ke Processing:", error.message);
    }
  };

  // 3. Klik Selesai: Ubah Status ke DONE (Selesai Dimasak)
  const handleCompleteOrder = async (orderId) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: "DONE" })
      .eq("id", orderId);

    if (error) {
      alert("Gagal update status: " + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-6 dynamic-screen">
      {/* ==================== MONITOR DAPUR ==================== */}
      <div className="no-print">
        <header className="flex justify-between items-center border-b border-slate-800 pb-4 mb-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-emerald-400 flex items-center gap-2">
              👨‍🍳 KITCHEN MONITOR PANEL <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full animate-pulse">Live</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">SaaS Ngachoan — Manajemen Alur Masak Dapur</p>
          </div>
          <div className="bg-slate-800 px-4 py-2 rounded-xl border border-slate-700 text-sm font-bold">
            Antrean: <span className="text-amber-400 text-base">{orders.length}</span> Order
          </div>
        </header>

        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[60vh] border-2 border-dashed border-slate-800 rounded-3xl">
            <p className="text-slate-500 font-medium text-lg">Belum ada pesanan masuk. Dapur standby! ☕</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map((order) => {
              const isProcessing = order.status === "PROCESSING";
              
              return (
                <div 
                  key={order.id} 
                  className={`bg-slate-950 border rounded-2xl p-5 flex flex-col justify-between shadow-xl relative overflow-hidden transition-all duration-300 ${
                    isProcessing ? "border-sky-500/50 shadow-sky-500/5" : "border-slate-800"
                  }`}
                >
                  {/* Garis Penanda Atas Dinamis */}
                  <div className={`absolute top-0 left-0 right-0 h-1.5 ${isProcessing ? "bg-sky-500" : "bg-amber-500"}`} />
                  
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-md border ${
                        isProcessing 
                          ? "text-sky-400 bg-sky-500/10 border-sky-500/20" 
                          : "text-amber-400 bg-amber-500/10 border-amber-500/20"
                      }`}>
                        #{order.id}
                      </span>
                      
                      {/* Badge Indikator Status Masak */}
                      <span className={`text-xs font-black tracking-wide px-2.5 py-0.5 rounded-full ${
                        isProcessing ? "bg-sky-500 text-slate-950 animate-pulse" : "bg-amber-500 text-slate-950"
                      }`}>
                        {isProcessing ? "⏳ SEDANG DIMASAK" : "🔥 ANTRIAN BARU"}
                      </span>
                    </div>

                    <h3 className="text-xl font-black text-slate-100 tracking-wide mb-4 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                      📍 {order.table_number}
                    </h3>

                    <div className="space-y-2 mb-6">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm bg-slate-900/50 p-2 rounded-lg border border-slate-800/40">
                          <span className="text-slate-300 font-medium">{item.name}</span>
                          <span className={`text-base font-black bg-slate-800 px-2 py-0.5 rounded-md ${isProcessing ? "text-sky-400" : "text-emerald-400"}`}>
                            x{item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* TOMBOL AKSI DINAMIS */}
                  <div className="grid grid-cols-1 gap-2 mt-2">
                    {!isProcessing ? (
                      <button
                        onClick={() => handlePrintAndCook(order)}
                        className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3 rounded-xl shadow-lg text-sm transition-all flex items-center justify-center gap-1"
                      >
                        🖨️ Cetak Struk & Masak
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handlePrintAndCook(order)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-3 rounded-xl border border-slate-700 text-xs"
                          title="Cetak Ulang Struk"
                        >
                          🔄 Re-Print
                        </button>
                        <button
                          onClick={() => handleCompleteOrder(order.id)}
                          className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-3 rounded-xl shadow-lg text-sm transition-all"
                        >
                          Selesai Dimasak 🍳
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ==================== AREA STRUK THERMAL 58MM ==================== */}
      {activePrintOrder && (
        <div className="print-area hidden font-mono text-black p-1 text-xs leading-tight w-[58mm]">
          <div className="text-center font-bold text-sm uppercase tracking-wider mb-1">
            *** NGACHOAN ***
          </div>
          <div className="text-center border-b border-dashed border-black pb-2 mb-2">
            STRUK ORDER DAPUR
          </div>

          <div className="mb-2">
            <div><strong>MEJA : {activePrintOrder.table_number}</strong></div>
            <div>ORDER: #{activePrintOrder.id}</div>
            <div>JAM  : {new Date(activePrintOrder.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB</div>
          </div>

          <div className="border-b border-dashed border-black mb-2"></div>

          <table className="w-full mb-3">
            <tbody>
              {activePrintOrder.items.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="py-1 text-left font-bold">{item.name}</td>
                  <td className="py-1 text-right font-black text-sm">x{item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-b border-dashed border-black mb-2"></div>
          <div className="text-center font-bold tracking-widest mt-2">
            -- SEGERA DIMASAK --
          </div>
        </div>
      )}
    </div>
  );
}