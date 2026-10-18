import { useCallback, useEffect, useState } from "react";
import { fetchMenuTree, fetchOptionGroups, subscribeToMenu } from "../lib/menuApi";
import CategoriesPanel from "./admin/CategoriesPanel";
import ItemsPanel from "./admin/ItemsPanel";
import OptionGroupsPanel from "./admin/OptionGroupsPanel";

const TABS = [
  { id: "items", label: "Menu" },
  { id: "categories", label: "Kategori" },
  { id: "options", label: "Grup Opsi" },
];

export default function MenuAdminView() {
  const [tab, setTab] = useState("items");
  const [data, setData] = useState({ categories: [], items: [], groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [tree, groups] = await Promise.all([fetchMenuTree(), fetchOptionGroups()]);
      setData({ categories: tree.categories, items: tree.items, groups });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const unsubscribe = subscribeToMenu(() => load());
    return () => unsubscribe();
  }, [load]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <header className="border-b border-slate-800 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-amber-500">
            🍽️ MENU MANAGEMENT
          </h1>
          <p className="text-xs text-slate-400 mt-1">Kelola kategori, menu, dan grup opsi</p>
        </div>
        <a
          href="?page=staff"
          className="bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 px-4 py-2 rounded-xl border border-slate-800 font-bold self-start"
        >
          Staf & Meja
        </a>
      </header>

      <div className="flex gap-2 mb-6">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setTab(entry.id)}
            className={`px-5 py-2 rounded-xl text-sm font-bold border transition-colors ${
              tab === entry.id
                ? "bg-amber-500 text-slate-950 border-amber-500"
                : "bg-slate-900 text-slate-400 border-slate-800 hover:border-slate-700"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-[50vh]">
          <p className="text-amber-500 font-bold animate-pulse text-lg">Memuat data menu...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
          <p className="text-red-400 font-bold text-center">{error}</p>
          <button
            onClick={load}
            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2.5 rounded-xl"
          >
            Coba Lagi
          </button>
        </div>
      ) : (
        <div className="max-w-4xl">
          {tab === "items" && (
            <ItemsPanel
              items={data.items}
              categories={data.categories}
              groups={data.groups}
              onChanged={load}
            />
          )}
          {tab === "categories" && (
            <CategoriesPanel categories={data.categories} onChanged={load} />
          )}
          {tab === "options" && (
            <OptionGroupsPanel groups={data.groups} onChanged={load} />
          )}
        </div>
      )}
    </div>
  );
}
