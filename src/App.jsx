import { useState, useEffect } from "react";
import { menuData } from "./data/menuData";
import { supabase } from "./supabaseClient";
import DapurView from "./components/DapurView"; // Import komponen dapur baru
import OwnerView from "./components/OwnerView";
import LoginView from "./components/LoginView";

function App() {
  const [selectedCategory, setSelectedCategory] = useState("Semua");
  const [cart, setCart] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState("Scanning...");
 const [currentPage, setCurrentPage] = useState("pelanggan");
  const [user, setUser] = useState(null); // <-- State satpam pemantau login sudah masuk di sini

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const pageParam = queryParams.get("page");
    
    // 1. Deteksi halaman Dapur
    if (pageParam === "dapur") {
      setCurrentPage("dapur");
      return;
    }

    // 2. Deteksi halaman Owner
    if (pageParam === "owner") {
      setCurrentPage("owner");
      return;
    }

    // 3. Jika halaman pelanggan biasa, deteksi nomor meja
    const mejaParam = queryParams.get("meja");
    if (mejaParam) {
      setTableNumber(mejaParam.toUpperCase());
    } else {
      setTableNumber("TIDAK DIKETAHUI (SILAKAN SCAN QR KEMBALI)");
    }
  }, []);

  // ==================== BENTENG PROTEKSI HALAMAN STAFF & OWNER ====================
  
  // Jika membuka halaman dapur
  if (currentPage === "dapur") {
    // Hadang jika belum login
    if (!user) {
      return <LoginView onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
    }
    // Hadang jika emailnya bukan hak akses dapur / owner
    if (user.email !== "dapur@ngachoan.com" && user.email !== "owner@ngachoan.com") {
      return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400 font-bold p-4 text-center">⚠️ Hak Akses Ditolak! Halaman ini khusus perangkat Dapur.</div>;
    }
    return <DapurView />;
  }

  // Jika membuka halaman owner (laporan keuangan)
  if (currentPage === "owner") {
    // Hadang jika belum login
    if (!user) {
      return <LoginView onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
    }
    // Hadang jika bukan email owner resmi
    if (user.email !== "owner@ngachoan.com") {
      return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400 font-bold p-4 text-center">⚠️ Hak Akses Ditolak! Anda bukan Pemilik Restoran.</div>;
    }
    return <OwnerView />;
  }

  // ================================================================================

// Sisa kode ke bawahnya (Variabel categories,filteredMenu, dan return HTML pelanggan utama)
  const categories = ["Semua", ...new Set(menuData.map(item => item.category))];
  const filteredMenu = selectedCategory === "Semua" ? menuData : menuData.filter(item => item.category === selectedCategory);

  const addToCart = (item) => {
    setCart((prevCart) => {
      const isExist = prevCart.find((cartItem) => cartItem.id === item.id);
      if (isExist) {
        return prevCart.map((cartItem) =>
          cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
        );
      }
      return [...prevCart, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCart((prevCart) => {
      const targetItem = prevCart.find((item) => item.id === itemId);
      if (targetItem.quantity === 1) {
        const updatedCart = prevCart.filter((item) => item.id !== itemId);
        if (updatedCart.length === 0) setIsModalOpen(false);
        return updatedCart;
      }
      return prevCart.map((item) =>
        item.id === itemId ? { ...item, quantity: item.quantity - 1 } : item
      );
    });
  };

  const totalItems = cart.reduce((total, item) => total + item.quantity, 0);
  const totalPrice = cart.reduce((total, item) => total + (item.price * item.quantity), 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-32">
      {/* HEADER TOKO */}
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-amber-500">
              NGACHOAN <span className="text-white font-light">QR-Order</span>
            </h1>
            <p className="text-xs text-slate-400">Meja Nomor: <span className="text-amber-400 font-bold tracking-wider">{tableNumber}</span></p>
          </div>
          <div className="bg-slate-800 text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-300">🟢 Standby</div>
        </div>
      </header>

      {/* BODY MENU UTAMA */}
      <main className="max-w-4xl mx-auto px-4 mt-6">
        <div className="flex space-x-2 overflow-x-auto pb-3 scrollbar-none">
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-5 py-2 rounded-xl font-medium text-sm transition-all duration-200 whitespace-nowrap border ${
                selectedCategory === category ? "bg-amber-500 text-slate-950 border-amber-500 shadow-lg scale-105" : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          {filteredMenu.map((item) => {
            const cartItem = cart.find((c) => c.id === item.id);
            return (
              <div key={item.id} className="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden flex flex-row h-36 hover:border-slate-700 transition-all duration-200 shadow-sm">
                <div className="w-1/3 relative h-full"><img src={item.image} alt={item.name} className="w-full h-full object-cover" /></div>
                <div className="w-2/3 p-3 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start gap-1">
                      <h3 className="font-bold text-sm sm:text-base text-slate-100 line-clamp-1">{item.name}</h3>
                      <span className="text-xs bg-slate-800 px-1.5 py-0.5 rounded text-amber-400 font-medium">{item.category}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-sm font-extrabold text-amber-500">Rp {item.price.toLocaleString("id-ID")}</span>
                    {cartItem ? (
                      <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 p-1 rounded-xl">
                        <button onClick={() => removeFromCart(item.id)} className="bg-slate-700 hover:bg-slate-600 text-amber-500 font-bold w-6 h-6 rounded-lg text-sm flex items-center justify-center">-</button>
                        <span className="text-xs font-bold px-1 min-w-[16px] text-center text-white">{cartItem.quantity}</span>
                        <button onClick={() => addToCart(item)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold w-6 h-6 rounded-lg text-sm flex items-center justify-center">+</button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(item)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors">Tambah +</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* FLOATING CART BAR */}
      {totalItems > 0 && !isModalOpen && (
        <div className="fixed bottom-6 left-0 right-0 px-4 z-40">
          <div className="max-w-md mx-auto bg-amber-500 text-slate-950 shadow-2xl p-4 rounded-2xl flex justify-between items-center border border-amber-400">
            <div className="flex items-center space-x-3">
              <div className="bg-slate-950 text-amber-400 font-black text-sm w-7 h-7 rounded-lg flex items-center justify-center">{totalItems}</div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900/80">Pesananmu</p>
                <p className="text-lg font-black tracking-tight">Rp {totalPrice.toLocaleString("id-ID")}</p>
              </div>
            </div>
            <button onClick={() => setIsModalOpen(true)} className="bg-slate-950 hover:bg-slate-900 text-white text-xs font-black py-2.5 px-4 rounded-xl flex items-center space-x-1">
              <span>Review Order</span><span>➔</span>
            </button>
          </div>
        </div>
      )}

      {/* MODAL REVIEW ORDER */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border-t border-slate-800 rounded-t-3xl p-6 shadow-2xl max-h-[85vh] flex flex-col z-10">
            <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-black text-slate-100">Detail Pesanan</h2>
                <p className="text-xs text-slate-400">Untuk Meja: <span className="text-amber-400 font-bold">{tableNumber}</span></p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-1.5 rounded-xl">Tutup</button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-center bg-slate-950/50 border border-slate-800/60 p-3 rounded-xl">
                  <div className="flex items-center space-x-3">
                    <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-slate-800" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-200 line-clamp-1">{item.name}</h4>
                      <p className="text-xs text-amber-500 font-extrabold mt-0.5">Rp {(item.price * item.quantity).toLocaleString("id-ID")}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                    <button onClick={() => removeFromCart(item.id)} className="bg-slate-800 hover:bg-slate-700 text-amber-500 font-bold w-6 h-6 rounded-lg text-xs flex items-center justify-center">-</button>
                    <span className="text-xs font-bold px-1 min-w-[14px] text-center text-white">{item.quantity}</span>
                    <button onClick={() => addToCart(item)} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold w-6 h-6 rounded-lg text-xs flex items-center justify-center">+</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-800 pt-4 mt-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400 font-medium">Subtotal Pesanan</span>
                <span className="text-lg font-black text-amber-400">Rp {totalPrice.toLocaleString("id-ID")}</span>
              </div>
              
              <button 
                onClick={async () => {
                try {
                  // 1. Definisikan ID Order unik menggunakan timestamp agar tidak kembar di bank
                  const orderId = "NGCHN-" + Date.now();

                  const orderData = {
                    id_order_fintech: orderId, // Kolom identifikasi transaksi bank
                    table_number: tableNumber,
                    items: cart.map(item => ({ name: item.name, quantity: item.quantity, price: item.price })),
                    total_price: totalPrice,
                    status: 'UNPAID', // Status awal dikunci UNPAID (Belum Bayar)
                    created_at: new Date().toISOString()
                  };

                  // 2. Simpan draf pesanan ke Supabase Cloud
                  const { error } = await supabase.from('orders').insert([orderData]);
                  if (error) throw error;

                  // 3. LOGIKA FINTECH SIMULASI / PRODUCTION LINK
                  // Catatan: Di dunia nyata, di sini kita memanggil API Midtrans untuk mendapatkan URL pembayaran resmi.
                  // Untuk fase development lokal, kita buat simulasi integrasi QRIS/Bank yang mengarah ke gerbang pembayaran.
                  
                  alert(`🔐 Menghubungkan ke Gerbang Pembayaran Elektronik...\nTotal yang harus dibayar: Rp ${totalPrice.toLocaleString("id-ID")}`);
                  
                  // Simulasi mengarahkan pelanggan ke halaman instruksi QRIS / Payment gateway
                  // Kasus nyata: window.location.href = response.redirect_url;
                  
                  alert(`Simulasi Fintech: Pembayaran Berhasil! Sinyal Webhook Midtrans diterima oleh Cloud Supabase.`);

                  // 4. Paksa update status di tempat ke PENDING (agar langsung meluncur ke Monitor Dapur secara real-time)
                  await supabase
                    .from('orders')
                    .update({ status: 'PENDING' })
                    .eq('id_order_fintech', orderId);

                  alert(`Sukses! Pembayaran diverifikasi bank. Pesanan Meja ${tableNumber} otomatis dikirim ke monitor dapur! 🔥`);
                  
                  setCart([]);
                  setIsModalOpen(false);
                } catch (error) {
                  console.error("Error:", error.message);
                  alert(`Gagal memproses pembayaran: ${error.message}`);
                  setCart([]);
                  setIsModalOpen(false);
                }
              }}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3.5 rounded-xl text-center shadow-lg"
              >
                Pesan Sekarang 🍳
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;