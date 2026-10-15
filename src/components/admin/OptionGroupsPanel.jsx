import { useState } from "react";
import {
  createOptionGroup,
  updateOptionGroup,
  deleteOptionGroup,
  createOptionItem,
  updateOptionItem,
  deleteOptionItem,
} from "../../lib/menuApi";
import { formatRupiah } from "../../lib/format";

const emptyGroupForm = {
  name: "",
  selection_type: "single",
  is_required: false,
  min_select: 0,
  max_select: "",
};

export default function OptionGroupsPanel({ groups, onChanged }) {
  const [newGroup, setNewGroup] = useState(emptyGroupForm);
  const [editingId, setEditingId] = useState(null);
  const [editGroup, setEditGroup] = useState(null);
  const [optionDrafts, setOptionDrafts] = useState({});
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

  const handleCreateGroup = (event) => {
    event.preventDefault();
    if (!newGroup.name.trim()) return;
    run(async () => {
      await createOptionGroup({
        name: newGroup.name.trim(),
        selection_type: newGroup.selection_type,
        is_required: newGroup.is_required,
        min_select: Number(newGroup.min_select) || 0,
        max_select: newGroup.max_select === "" ? null : Number(newGroup.max_select),
        sort_order: groups.length + 1,
      });
      setNewGroup(emptyGroupForm);
    });
  };

  const handleSaveGroup = (group) => {
    run(async () => {
      await updateOptionGroup(group.id, {
        name: editGroup.name.trim(),
        selection_type: editGroup.selection_type,
        is_required: editGroup.is_required,
        min_select: Number(editGroup.min_select) || 0,
        max_select: editGroup.max_select === "" ? null : Number(editGroup.max_select),
      });
      setEditingId(null);
      setEditGroup(null);
    });
  };

  const handleDeleteGroup = (group) => {
    if (!window.confirm(`Hapus grup opsi "${group.name}" beserta opsinya?`)) return;
    run(() => deleteOptionGroup(group.id));
  };

  const handleAddOption = (group) => {
    const draft = optionDrafts[group.id] || { name: "", price_delta: "" };
    if (!draft.name.trim()) return;
    run(async () => {
      await createOptionItem({
        group_id: group.id,
        name: draft.name.trim(),
        price_delta: Number(draft.price_delta) || 0,
        sort_order: group.options.length + 1,
      });
      setOptionDrafts((prev) => ({ ...prev, [group.id]: { name: "", price_delta: "" } }));
    });
  };

  const setDraft = (groupId, patch) => {
    setOptionDrafts((prev) => ({
      ...prev,
      [groupId]: { name: "", price_delta: "", ...(prev[groupId] || {}), ...patch },
    }));
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreateGroup} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <p className="text-sm font-bold text-slate-200">Grup Opsi Baru</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={newGroup.name}
            onChange={(event) => setNewGroup({ ...newGroup, name: event.target.value })}
            placeholder="Nama grup (mis. Level Pedas)"
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
          />
          <select
            value={newGroup.selection_type}
            onChange={(event) => setNewGroup({ ...newGroup, selection_type: event.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
          >
            <option value="single">Pilih satu</option>
            <option value="multiple">Pilih banyak</option>
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={newGroup.is_required}
              onChange={(event) => setNewGroup({ ...newGroup, is_required: event.target.checked })}
              className="accent-amber-500"
            />
            Wajib dipilih
          </label>
          <div className="flex gap-3">
            <input
              type="number"
              min="0"
              value={newGroup.min_select}
              onChange={(event) => setNewGroup({ ...newGroup, min_select: event.target.value })}
              placeholder="Min"
              className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
            <input
              type="number"
              min="0"
              value={newGroup.max_select}
              onChange={(event) => setNewGroup({ ...newGroup, max_select: event.target.value })}
              placeholder="Maks (kosong = bebas)"
              className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-50"
        >
          Buat Grup
        </button>
      </form>

      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
            {editingId === group.id && editGroup ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    value={editGroup.name}
                    onChange={(event) => setEditGroup({ ...editGroup, name: event.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                  />
                  <select
                    value={editGroup.selection_type}
                    onChange={(event) => setEditGroup({ ...editGroup, selection_type: event.target.value })}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="single">Pilih satu</option>
                    <option value="multiple">Pilih banyak</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={editGroup.is_required}
                      onChange={(event) => setEditGroup({ ...editGroup, is_required: event.target.checked })}
                      className="accent-amber-500"
                    />
                    Wajib dipilih
                  </label>
                  <div className="flex gap-3">
                    <input
                      type="number"
                      min="0"
                      value={editGroup.min_select}
                      onChange={(event) => setEditGroup({ ...editGroup, min_select: event.target.value })}
                      placeholder="Min"
                      className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                    <input
                      type="number"
                      min="0"
                      value={editGroup.max_select ?? ""}
                      onChange={(event) => setEditGroup({ ...editGroup, max_select: event.target.value })}
                      placeholder="Maks"
                      className="w-1/2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSaveGroup(group)}
                    className="text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-lg"
                  >
                    Simpan
                  </button>
                  <button
                    onClick={() => {
                      setEditingId(null);
                      setEditGroup(null);
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg"
                  >
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-200">{group.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {group.selection_type === "single" ? "Pilih satu" : "Pilih banyak"} ·{" "}
                    {group.is_required ? "Wajib" : "Opsional"} · Min {group.min_select}
                    {group.max_select != null ? ` · Maks ${group.max_select}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setEditingId(group.id);
                      setEditGroup({
                        name: group.name,
                        selection_type: group.selection_type,
                        is_required: group.is_required,
                        min_select: group.min_select,
                        max_select: group.max_select ?? "",
                      });
                    }}
                    className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg"
                  >
                    Ubah
                  </button>
                  <button
                    onClick={() => handleDeleteGroup(group)}
                    className="text-xs bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-3 py-1.5 rounded-lg"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5 pl-2 border-l border-slate-800">
              {group.options.map((option) => (
                <div key={option.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-slate-300">
                    {option.name}
                    <span className="text-amber-400 font-bold ml-2">
                      {option.price_delta > 0 ? `+${formatRupiah(option.price_delta)}` : "Gratis"}
                    </span>
                  </span>
                  <button
                    onClick={() =>
                      run(() => updateOptionItem(option.id, { is_available: !option.is_available }))
                    }
                    className={`text-[11px] px-2 py-1 rounded-lg border ${
                      option.is_available
                        ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                        : "text-slate-500 border-slate-700 bg-slate-800"
                    }`}
                  >
                    {option.is_available ? "Tersedia" : "Habis"}
                  </button>
                  <button
                    onClick={() => run(() => deleteOptionItem(option.id))}
                    className="text-[11px] text-red-400 hover:text-red-300"
                  >
                    Hapus
                  </button>
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <input
                  value={(optionDrafts[group.id] || {}).name || ""}
                  onChange={(event) => setDraft(group.id, { name: event.target.value })}
                  placeholder="Nama opsi"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <input
                  type="number"
                  value={(optionDrafts[group.id] || {}).price_delta || ""}
                  onChange={(event) => setDraft(group.id, { price_delta: event.target.value })}
                  placeholder="Delta +"
                  className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={() => handleAddOption(group)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg"
                >
                  Tambah
                </button>
              </div>
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">Belum ada grup opsi.</p>
        )}
      </div>
    </div>
  );
}
