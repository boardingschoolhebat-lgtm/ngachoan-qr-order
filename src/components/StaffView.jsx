import { useState } from "react";
import { supabase } from "../supabaseClient";
import StaffPanel from "./admin/StaffPanel";
import TablesPanel from "./admin/TablesPanel";

const TABS = [
  { id: "staff", label: "Staf" },
  { id: "tables", label: "Meja & QR" },
];

export default function StaffView({ displayName }) {
  const [tab, setTab] = useState("staff");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <header className="border-b border-slate-800 pb-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-amber-500">👥 STAF & MEJA</h1>
          <p className="text-xs text-slate-400 mt-1">
            Kelola akun staf, hak akses, dan QR meja
            {displayName ? ` · ${displayName}` : ""}
          </p>
        </div>
        <div className="flex gap-2 self-start">
          <a
            href="?page=menu"
            className="bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 px-4 py-2 rounded-xl border border-slate-800 font-bold"
          >
            Menu
          </a>
          <button
            onClick={() => supabase.auth.signOut()}
            className="bg-slate-900 hover:bg-slate-800 text-xs text-slate-300 px-4 py-2 rounded-xl border border-slate-800 font-bold"
          >
            Keluar
          </button>
        </div>
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

      <div className="max-w-4xl">
        {tab === "staff" && <StaffPanel />}
        {tab === "tables" && <TablesPanel />}
      </div>
    </div>
  );
}
