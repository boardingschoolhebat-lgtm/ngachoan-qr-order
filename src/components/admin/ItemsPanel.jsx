import { useState } from "react";
import {
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  setItemAvailability,
  setItemOptionGroups,
  uploadMenuImage,
} from "../../lib/menuApi";
import { formatRupiah } from "../../lib/format";

const emptyForm = {
  name: "",
  description: "",
  base_price: "",
  category_id: "",
  image_url: "",
};

export default function ItemsPanel({ items, categories, groups, onChanged }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [optionGroupIds, setOptionGroupIds] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const categoryName = (id) => categories.find((category) => category.id === id)?.name || "-";

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

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, category_id: categories[0]?.id || "" });
    setOptionGroupIds([]);
    setError("");
    setEditorOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      name: item.name,
      description: item.description || "",
      base_price: String(item.base_price),
      category_id: item.category_id,
      image_url: item.image_url || "",
    });
    setOptionGroupIds(item.option_groups.map((group) => group.id));
    setError("");
    setEditorOpen(true);
  };

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await uploadMenuImage(file);
      setForm((prev) => ({ ...prev, image_url: url }));
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const toggleGroup = (groupId) => {
    setOptionGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.category_id) {
      setError("Nama dan kategori wajib diisi.");
      return;
    }
    run(async () => {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        base_price: Number(form.base_price) || 0,
        category_id: form.category_id,
        image_url: form.image_url || null,
      };

      let menuItemId = editingId;
      if (editingId) {
        await updateMenuItem(editingId, payload);
      } else {
        const created = await createMenuItem({
          ...payload,
          sort_order: items.length + 1,
        });
        menuItemId = created.id;
      }
      await setItemOptionGroups(menuItemId, optionGroupIds);

      setEditorOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      setOptionGroupIds([]);
    });
  };

  const handleDelete = (item) => {
    if (!window.confirm(`Hapus menu "${item.name}"?`)) return;
    run(() => deleteMenuItem(item.id));
  };

  const move = (item, direction) => {
    const sameCategory = items
      .filter((entry) => entry.category_id === item.category_id)
      .sort((a, b) => a.sort_order - b.sort_order);
    const index = sameCategory.findIndex((entry) => entry.id === item.id);
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= sameCategory.length) return;
    const other = sameCategory[swapIndex];
    run(async () => {
      await updateMenuItem(item.id, { sort_order: other.sort_order });
      await updateMenuItem(other.id, { sort_order: item.sort_order });
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-400">
          {items.length} menu · {categories.length} kategori · {groups.length} grup opsi
        </p>
        <button
          onClick={openCreate}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-sm"
        >
          + Menu Baru
        </button>
      </div>

      {error && !editorOpen && <p className="text-xs text-red-400 font-medium">{error}</p>}

      {editorOpen && (
        <form onSubmit={handleSubmit} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <p className="text-sm font-bold text-slate-200">
            {editingId ? "Ubah Menu" : "Menu Baru"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Nama menu"
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
            <input
              type="number"
              min="0"
              value={form.base_price}
              onChange={(event) => setForm({ ...form, base_price: event.target.value })}
              placeholder="Harga dasar"
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
            <select
              value={form.category_id}
              onChange={(event) => setForm({ ...form, category_id: event.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            >
              <option value="">Pilih kategori</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <input
              value={form.image_url}
              onChange={(event) => setForm({ ...form, image_url: event.target.value })}
              placeholder="URL gambar (atau unggah)"
              className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
          <textarea
            value={form.description}
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            placeholder="Deskripsi"
            rows={2}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
          />

          <div className="flex items-center gap-3">
            <label className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg cursor-pointer">
              {uploading ? "Mengunggah..." : "Unggah Gambar"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
            {form.image_url && (
              <img
                src={form.image_url}
                alt="Pratinjau"
                className="w-14 h-14 rounded-lg object-cover border border-slate-800"
              />
            )}
          </div>

          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Grup Opsi</p>
            {groups.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada grup opsi. Buat di tab Grup Opsi.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {groups.map((group) => {
                  const active = optionGroupIds.includes(group.id);
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className={`text-xs px-3 py-1.5 rounded-lg border ${
                        active
                          ? "bg-sky-500/10 border-sky-500 text-sky-300"
                          : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      {group.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-400 font-medium">{error}</p>}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-50"
            >
              {busy ? "Menyimpan..." : "Simpan"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditorOpen(false);
                setEditingId(null);
                setError("");
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-5 py-2 rounded-xl text-sm"
            >
              Batal
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3">
            {item.image_url ? (
              <img src={item.image_url} alt={item.name} className="w-12 h-12 rounded-lg object-cover border border-slate-800" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-800" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-200 truncate">{item.name}</p>
              <p className="text-[11px] text-slate-500">
                {categoryName(item.category_id)} · {formatRupiah(item.base_price)}
                {item.option_groups.length > 0 && ` · ${item.option_groups.length} grup opsi`}
              </p>
            </div>
            <button
              onClick={() => move(item, -1)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded-lg"
              title="Naik"
            >
              ↑
            </button>
            <button
              onClick={() => move(item, 1)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1.5 rounded-lg"
              title="Turun"
            >
              ↓
            </button>
            <button
              onClick={() => run(() => setItemAvailability(item.id, !item.is_available))}
              className={`text-[11px] px-2 py-1.5 rounded-lg border whitespace-nowrap ${
                item.is_available
                  ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                  : "text-slate-500 border-slate-700 bg-slate-800"
              }`}
            >
              {item.is_available ? "Tersedia" : "Habis"}
            </button>
            <button
              onClick={() => openEdit(item)}
              className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg"
            >
              Ubah
            </button>
            <button
              onClick={() => handleDelete(item)}
              className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg"
            >
              Hapus
            </button>
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">Belum ada menu.</p>
        )}
      </div>
    </div>
  );
}
