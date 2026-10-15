import { useState } from "react";
import { createCategory, updateCategory, deleteCategory } from "../../lib/menuApi";

export default function CategoriesPanel({ categories, onChanged }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = (event) => {
    event.preventDefault();
    if (!newName.trim()) return;
    const nextSort = categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 1;
    run(async () => {
      await createCategory({ name: newName.trim(), sort_order: nextSort });
      setNewName("");
    });
  };

  const handleRename = (category) => {
    if (!editName.trim()) return;
    run(async () => {
      await updateCategory(category.id, { name: editName.trim() });
      setEditingId(null);
      setEditName("");
    });
  };

  const handleDelete = (category) => {
    if (!window.confirm(`Hapus kategori "${category.name}"?`)) return;
    run(() => deleteCategory(category.id));
  };

  const move = (category, direction) => {
    const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
    const index = sorted.findIndex((entry) => entry.id === category.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sorted.length) return;
    const other = sorted[swapIndex];
    run(async () => {
      await updateCategory(category.id, { sort_order: other.sort_order });
      await updateCategory(other.id, { sort_order: category.sort_order });
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Nama kategori baru"
          className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 rounded-xl text-sm disabled:opacity-50"
        >
          Tambah
        </button>
      </form>

      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}

      <div className="space-y-2">
        {[...categories]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((category) => (
            <div
              key={category.id}
              className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-4 py-3"
            >
              {editingId === category.id ? (
                <>
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    onClick={() => handleRename(category)}
                    className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg"
                  >
                    Simpan
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg"
                  >
                    Batal
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-bold text-slate-200">{category.name}</span>
                  <button
                    onClick={() => move(category, -1)}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded-lg"
                    title="Naik"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(category, 1)}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded-lg"
                    title="Turun"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(category.id);
                      setEditName(category.name);
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg"
                  >
                    Ubah
                  </button>
                  <button
                    onClick={() => handleDelete(category)}
                    className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg"
                  >
                    Hapus
                  </button>
                </>
              )}
            </div>
          ))}
        {categories.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">Belum ada kategori.</p>
        )}
      </div>
    </div>
  );
}
