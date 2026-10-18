import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  fetchTables,
  createTable,
  updateTable,
  deleteTable,
  tableOrderUrl,
} from "../../lib/tableApi";

export default function TablesPanel() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newZone, setNewZone] = useState("");
  const [qrMap, setQrMap] = useState({});
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const data = await fetchTables();
      setTables(data);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const buildQrCodes = async () => {
      const entries = await Promise.all(
        tables.map(async (table) => {
          const url = tableOrderUrl(table.label);
          try {
            const dataUrl = await QRCode.toDataURL(url, { width: 256, margin: 1 });
            return [table.id, dataUrl];
          } catch {
            return [table.id, ""];
          }
        })
      );
      if (!cancelled) setQrMap(Object.fromEntries(entries));
    };

    if (tables.length > 0) buildQrCodes();
    return () => {
      cancelled = true;
    };
  }, [tables]);

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (event) => {
    event.preventDefault();
    if (!newLabel.trim()) return;
    run(async () => {
      await createTable({
        label: newLabel.trim().toUpperCase(),
        zone: newZone.trim(),
        sortOrder: tables.length + 1,
      });
      setNewLabel("");
      setNewZone("");
    });
  };

  const handleDelete = (table) => {
    if (!window.confirm(`Hapus meja "${table.label}"? QR lama tidak akan berfungsi.`)) return;
    run(() => deleteTable(table.id));
  };

  const move = (table, direction) => {
    const sorted = [...tables].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex((entry) => entry.id === table.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const other = sorted[swapIndex];
    run(async () => {
      await updateTable(table.id, { sort_order: other.sort_order });
      await updateTable(other.id, { sort_order: table.sort_order });
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="flex flex-col sm:flex-row gap-2">
        <input
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
          placeholder="Label meja (mis. MEJA-07)"
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
        />
        <input
          value={newZone}
          onChange={(event) => setNewZone(event.target.value)}
          placeholder="Zona (opsional)"
          className="sm:w-48 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 rounded-xl text-sm disabled:opacity-50"
        >
          Tambah Meja
        </button>
      </form>

      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500 text-center py-8">Memuat meja...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map((table) => (
            <div key={table.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-black text-slate-100">{table.label}</p>
                  <p className="text-[11px] text-slate-500">{table.zone || "Tanpa zona"}</p>
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-md border ${
                    table.is_active
                      ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                      : "text-slate-500 bg-slate-800 border-slate-700"
                  }`}
                >
                  {table.is_active ? "Aktif" : "Nonaktif"}
                </span>
              </div>

              {qrMap[table.id] ? (
                <img
                  src={qrMap[table.id]}
                  alt={`QR ${table.label}`}
                  className="w-full aspect-square max-w-[160px] mx-auto bg-white p-1 rounded-lg"
                />
              ) : (
                <div className="w-full aspect-square max-w-[160px] mx-auto bg-slate-800 rounded-lg" />
              )}

              <p className="text-[10px] text-slate-500 break-all">{tableOrderUrl(table.label)}</p>

              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => move(table, -1)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(table, 1)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg"
                >
                  ↓
                </button>
                <button
                  onClick={() => run(() => updateTable(table.id, { is_active: !table.is_active }))}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-lg"
                >
                  {table.is_active ? "Nonaktifkan" : "Aktifkan"}
                </button>
                {qrMap[table.id] && (
                  <a
                    href={qrMap[table.id]}
                    download={`qr-${table.label}.png`}
                    className="text-xs bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/20 px-2 py-1 rounded-lg"
                  >
                    Unduh QR
                  </a>
                )}
                <button
                  onClick={() => handleDelete(table)}
                  className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-2 py-1 rounded-lg"
                >
                  Hapus
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && tables.length === 0 && (
        <p className="text-sm text-slate-500 text-center py-8">Belum ada meja.</p>
      )}
    </div>
  );
}
