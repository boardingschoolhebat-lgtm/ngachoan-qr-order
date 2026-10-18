import { useCallback, useEffect, useMemo, useState } from "react";
import { createOrder, markOrderPaid } from "./lib/orderApi";
import { fetchMenuTree, fetchMyStaff, subscribeToMenu } from "./lib/menuApi";
import DapurView from "./components/DapurView";
import OwnerView from "./components/OwnerView";
import LoginView from "./components/LoginView";
import MenuAdminView from "./components/MenuAdminView";
import OptionSelectModal from "./components/OptionSelectModal";

function lineSignature(menuItemId, options) {
  const ids = options
    .map((option) => option.option_item_id)
    .sort()
    .join(",");
  return `${menuItemId}::${ids}`;
}

function App() {
  const [currentPage, setCurrentPage] = useState("pelanggan");
  const [tableNumber, setTableNumber] = useState("Scanning...");
  const [user, setUser] = useState(null);
  // undefined = still loading, null = not staff, object = staff row
  const [staffRecord, setStaffRecord] = useState(undefined);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const pageParam = queryParams.get("page");

    if (pageParam === "dapur") {
      setCurrentPage("dapur");
      return;
    }

    if (pageParam === "owner") {
      setCurrentPage("owner");
      return;
    }

    if (pageParam === "menu") {
      setCurrentPage("menu");
      return;
    }

    const mejaParam = queryParams.get("meja");
    if (mejaParam) {
      setTableNumber(mejaParam.toUpperCase());
    } else {
      setTableNumber("TIDAK DIKETAHUI (SILAKAN SCAN QR KEMBALI)");
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setStaffRecord(undefined);
      return;
    }
    let cancelled = false;
    setStaffRecord(undefined);
    fetchMyStaff()
      .then((record) => {
        if (!cancelled) setStaffRecord(record);
      })
      .catch(() => {
        if (!cancelled) setStaffRecord(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ==================== BENTENG PROTEKSI HALAMAN STAFF & OWNER ====================

  if (currentPage === "dapur") {
    if (!user) {
      return <LoginView onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
    }
    if (user.email !== "dapur@ngachoan.com" && user.email !== "owner@ngachoan.com") {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400 font-bold p-4 text-center">
          ⚠️ Hak Akses Ditolak! Halaman ini khusus perangkat Dapur.
        </div>
      );
    }
    return <DapurView />;
  }

  if (currentPage === "owner") {
    if (!user) {
      return <LoginView onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
    }
    if (user.email !== "owner@ngachoan.com") {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400 font-bold p-4 text-center">
          ⚠️ Hak Akses Ditolak! Anda bukan Pemilik Restoran.
        </div>
      );
    }
    return <OwnerView />;
  }

  if (currentPage === "menu") {
    if (!user) {
      return <LoginView onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />;
    }
    if (staffRecord === undefined) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-amber-500 font-bold p-4 text-center">
          Memeriksa hak akses...
        </div>
      );
    }
    if (!staffRecord || (staffRecord.role !== "owner" && staffRecord.role !== "manager")) {
      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center text-red-400 font-bold p-4 text-center">
          ⚠️ Hak Akses Ditolak! Halaman ini khusus Owner atau Manager.
        </div>
      );
    }
    return <MenuAdminView />;
  }

  // ================================================================================

  return <CustomerView tableNumber={tableNumber} />;
}

function CustomerView({ tableNumber }) {
  const [menu, setMenu] = useState({ categories: [], items: [] });
  const [menuLoading, setMenuLoading] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Semua");
  const [cart, setCart] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [optionModalItem, setOptionModalItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CASH");

  const loadMenu = useCallback(async (showSpinner = true) => {
    if (showSpinner) setMenuLoading(true);
    setMenuError("");
    try {
      const tree = await fetchMenuTree();
      setMenu(tree);
    } catch (error) {
      setMenuError(error.message);
    } finally {
      if (showSpinner) setMenuLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMenu();

    const unsubscribe = subscribeToMenu(() => {
      loadMenu(false);
    });

    return () => unsubscribe();
  }, [loadMenu]);

  const itemAvailability = useMemo(() => {
    const map = {};
    menu.items.forEach((item) => {
      map[item.id] = item.is_available;
    });
    return map;
  }, [menu.items]);

  const categories = useMemo(
    () => ["Semua", ...menu.categories.map((category) => category.name)],
    [menu.categories]
  );

  const filteredMenu = useMemo(() => {
    const available = menu.items.filter((item) => item.is_available);
    if (selectedCategory === "Semua") return available;
    const category = menu.categories.find((entry) => entry.name === selectedCategory);
    if (!category) return available;
    return available.filter((item) => item.category_id === category.id);
  }, [menu.items, menu.categories, selectedCategory]);

  const addConfiguredItem = (item, options, unitPrice) => {
    const signature = lineSignature(item.id, options);
    setCart((prevCart) => {
      const existing = prevCart.find((line) => line.signature === signature);
      if (existing) {
        return prevCart.map((line) =>
          line.signature === signature ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [
        ...prevCart,
        {
          signature,
          menu_item_id: item.id,
          name: item.name,
          image: item.image_url,
          base_price: item.base_price,
          options,
          unit_price: unitPrice,
          quantity: 1,
        },
      ];
    });
  };

  const handleAddClick = (item) => {
    if (item.option_groups && item.option_groups.length > 0) {
      setOptionModalItem(item);
      return;
    }
    addConfiguredItem(item, [], item.base_price);
  };

  const removeFromCart = (signature) => {
    setCart((prevCart) => {
      const target = prevCart.find((line) => line.signature === signature);
      if (!target) return prevCart;
      if (target.quantity === 1) {
        const updated = prevCart.filter((line) => line.signature !== signature);
        if (updated.length === 0) setIsModalOpen(false);
        return updated;
      }
      return prevCart.map((line) =>
        line.signature === signature ? { ...line, quantity: line.quantity - 1 } : line
      );
    });
  };

  const totalItems = cart.reduce((total, line) => total + line.quantity, 0);
  const totalPrice = cart.reduce((total, line) => total + line.unit_price * line.quantity, 0);
  const hasUnavailableInCart = cart.some(
    (line) => itemAvailability[line.menu_item_id] === false
  );

  const submitOrder = async () => {
    if (hasUnavailableInCart) {
      alert("Ada item di keranjang yang sudah habis. Hapus dulu sebelum memesan.");
      return;
    }

    setSubmitting(true);
    try {
      const lines = cart.map((line) => ({
        menu_item_id: line.menu_item_id,
        quantity: line.quantity,
        option_item_ids: line.options.map((option) => option.option_item_id),
      }));

      const orderId = await createOrder({
        tableNumber,
        paymentMethod,
        lines,
      });

      if (paymentMethod === "ONLINE") {
        alert(
          `🔐 Menghubungkan ke Gerbang Pembayaran Elektronik...\nTotal yang harus dibayar: Rp ${totalPrice.toLocaleString("id-ID")}`
        );
        await markOrderPaid(orderId);
        alert(`Sukses! Pembayaran diterima. Pesanan Meja ${tableNumber} dikirim ke monitor dapur! 🔥`);
      } else {
        alert(
          `Pesanan Meja ${tableNumber} dikirim ke dapur! 🍳\nSilakan bayar di kasir sebesar Rp ${totalPrice.toLocaleString("id-ID")}.`
        );
      }

      setCart([]);
      setIsModalOpen(false);
    } catch (error) {
      console.error("Error:", error.message);
      alert(`Gagal memproses pesanan: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-32">
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-4 shadow-lg">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-amber-500">
              NGACHOAN <span className="text-white font-light">QR-Order</span>
            </h1>
            <p className="text-xs text-slate-400">
              Meja Nomor: <span className="text-amber-400 font-bold tracking-wider">{tableNumber}</span>
            </p>
          </div>
          <div className="bg-slate-800 text-xs px-3 py-1.5 rounded-full border border-slate-700 text-slate-300">
            🟢 Standby
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 mt-6">
        {menuLoading ? (
          <div className="flex items-center justify-center h-[40vh]">
            <p className="text-amber-500 font-bold animate-pulse text-lg">Memuat menu...</p>
          </div>
        ) : menuError ? (
          <div className="flex flex-col items-center justify-center h-[40vh] gap-4">
            <p className="text-red-400 font-bold text-center">{menuError}</p>
            <button
              onClick={() => loadMenu()}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl"
            >
              Coba Lagi
            </button>
          </div>
        ) : menu.items.length === 0 ? (
          <div className="flex items-center justify-center h-[40vh]">
            <p className="text-slate-500 font-medium text-lg">Menu belum tersedia. 🍽️</p>
          </div>
        ) : (
          <>
            <div className="flex space-x-2 overflow-x-auto pb-3 scrollbar-none">
              {categories.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-5 py-2 rounded-xl font-medium text-sm transition-all duration-200 whitespace-nowrap border ${
                    selectedCategory === category
                      ? "bg-amber-500 text-slate-950 border-amber-500 shadow-lg scale-105"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              {filteredMenu.map((item) => {
                const quantity = cart
                  .filter((line) => line.menu_item_id === item.id)
                  .reduce((total, line) => total + line.quantity, 0);
                const hasOptions = item.option_groups && item.option_groups.length > 0;
                return (
                  <div
                    key={item.id}
                    className="bg-slate-900 border border-slate-800/80 rounded-2xl overflow-hidden flex flex-row h-36 hover:border-slate-700 transition-all duration-200 shadow-sm"
                  >
                    <div className="w-1/3 relative h-full bg-slate-800">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-600 text-2xl">🍽️</div>
                      )}
                    </div>
                    <div className="w-2/3 p-3 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start gap-1">
                          <h3 className="font-bold text-sm sm:text-base text-slate-100 line-clamp-1">{item.name}</h3>
                          {hasOptions && (
                            <span className="text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded font-medium whitespace-nowrap">
                              Opsi
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{item.description}</p>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-sm font-extrabold text-amber-500">
                          Rp {item.base_price.toLocaleString("id-ID")}
                        </span>
                        {quantity > 0 && !hasOptions ? (
                          <div className="flex items-center space-x-2 bg-slate-800 border border-slate-700 p-1 rounded-xl">
                            <button
                              onClick={() => {
                                const line = cart.find((entry) => entry.menu_item_id === item.id);
                                if (line) removeFromCart(line.signature);
                              }}
                              className="bg-slate-700 hover:bg-slate-600 text-amber-500 font-bold w-6 h-6 rounded-lg text-sm flex items-center justify-center"
                            >
                              -
                            </button>
                            <span className="text-xs font-bold px-1 min-w-[16px] text-center text-white">{quantity}</span>
                            <button
                              onClick={() => handleAddClick(item)}
                              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold w-6 h-6 rounded-lg text-sm flex items-center justify-center"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleAddClick(item)}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors"
                          >
                            {quantity > 0 ? `Tambah + (${quantity})` : "Tambah +"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {totalItems > 0 && !isModalOpen && (
        <div className="fixed bottom-6 left-0 right-0 px-4 z-40">
          <div className="max-w-md mx-auto bg-amber-500 text-slate-950 shadow-2xl p-4 rounded-2xl flex justify-between items-center border border-amber-400">
            <div className="flex items-center space-x-3">
              <div className="bg-slate-950 text-amber-400 font-black text-sm w-7 h-7 rounded-lg flex items-center justify-center">
                {totalItems}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-900/80">Pesananmu</p>
                <p className="text-lg font-black tracking-tight">Rp {totalPrice.toLocaleString("id-ID")}</p>
              </div>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-slate-950 hover:bg-slate-900 text-white text-xs font-black py-2.5 px-4 rounded-xl flex items-center space-x-1"
            >
              <span>Review Order</span>
              <span>➔</span>
            </button>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
          <div className="absolute inset-0" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-md bg-slate-900 border-t border-slate-800 rounded-t-3xl p-6 shadow-2xl max-h-[85vh] flex flex-col z-10">
            <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-black text-slate-100">Detail Pesanan</h2>
                <p className="text-xs text-slate-400">
                  Untuk Meja: <span className="text-amber-400 font-bold">{tableNumber}</span>
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-1.5 rounded-xl"
              >
                Tutup
              </button>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 pr-1">
              {cart.map((line) => {
                const unavailable = itemAvailability[line.menu_item_id] === false;
                return (
                  <div
                    key={line.signature}
                    className={`flex justify-between items-center bg-slate-950/50 border p-3 rounded-xl ${
                      unavailable ? "border-red-500/50" : "border-slate-800/60"
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      {line.image ? (
                        <img
                          src={line.image}
                          alt={line.name}
                          className="w-12 h-12 rounded-lg object-cover border border-slate-800"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-800 flex items-center justify-center text-slate-600">🍽️</div>
                      )}
                      <div>
                        <h4 className="text-sm font-bold text-slate-200 line-clamp-1">{line.name}</h4>
                        {line.options.length > 0 && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {line.options.map((option) => option.option_name).join(", ")}
                          </p>
                        )}
                        <p className="text-xs text-amber-500 font-extrabold mt-0.5">
                          Rp {(line.unit_price * line.quantity).toLocaleString("id-ID")}
                        </p>
                        {unavailable && (
                          <p className="text-[11px] text-red-400 font-bold mt-0.5">Item sudah habis</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 p-1 rounded-xl">
                      <button
                        onClick={() => removeFromCart(line.signature)}
                        className="bg-slate-800 hover:bg-slate-700 text-amber-500 font-bold w-6 h-6 rounded-lg text-xs flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="text-xs font-bold px-1 min-w-[14px] text-center text-white">
                        {line.quantity}
                      </span>
                      <button
                        onClick={() => {
                          const item = menu.items.find((entry) => entry.id === line.menu_item_id);
                          if (item) handleAddClick(item);
                        }}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold w-6 h-6 rounded-lg text-xs flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-800 pt-4 mt-4 space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Metode Pembayaran</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setPaymentMethod("CASH")}
                    className={`px-3 py-2.5 rounded-xl border text-left transition-colors ${
                      paymentMethod === "CASH"
                        ? "bg-amber-500/10 border-amber-500"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <span className="block text-sm font-bold text-slate-100">Bayar di Kasir</span>
                    <span className="block text-[10px] text-slate-500">Langsung ke dapur</span>
                  </button>
                  <button
                    onClick={() => setPaymentMethod("ONLINE")}
                    className={`px-3 py-2.5 rounded-xl border text-left transition-colors ${
                      paymentMethod === "ONLINE"
                        ? "bg-amber-500/10 border-amber-500"
                        : "bg-slate-950 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    <span className="block text-sm font-bold text-slate-100">Bayar Online</span>
                    <span className="block text-[10px] text-slate-500">Masuk dapur setelah lunas</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-400 font-medium">Subtotal Pesanan</span>
                <span className="text-lg font-black text-amber-400">Rp {totalPrice.toLocaleString("id-ID")}</span>
              </div>

              {hasUnavailableInCart && (
                <p className="text-xs text-red-400 font-bold text-center">
                  Ada item yang sudah habis. Hapus dari keranjang untuk melanjutkan.
                </p>
              )}

              <button
                onClick={submitOrder}
                disabled={submitting || hasUnavailableInCart}
                className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3.5 rounded-xl text-center shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting
                  ? "Memproses..."
                  : paymentMethod === "ONLINE"
                    ? "Bayar & Pesan 🍳"
                    : "Pesan Sekarang 🍳"}
              </button>
            </div>
          </div>
        </div>
      )}

      {optionModalItem && (
        <OptionSelectModal
          item={optionModalItem}
          onClose={() => setOptionModalItem(null)}
          onConfirm={({ options, unitPrice }) => {
            addConfiguredItem(optionModalItem, options, unitPrice);
            setOptionModalItem(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
