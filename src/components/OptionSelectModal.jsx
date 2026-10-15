import { useMemo, useState } from "react";

function formatRupiah(value) {
  return `Rp ${Number(value).toLocaleString("id-ID")}`;
}

function initialSelection(optionGroups) {
  const selection = {};
  optionGroups.forEach((group) => {
    selection[group.id] = group.selection_type === "single" ? null : [];
  });
  return selection;
}

function requiredCount(group) {
  return group.is_required ? Math.max(group.min_select || 0, 1) : group.min_select || 0;
}

function groupIsValid(group, value) {
  const count = Array.isArray(value) ? value.length : value ? 1 : 0;
  const min = requiredCount(group);
  const max = group.max_select ?? Infinity;
  return count >= min && count <= max;
}

export default function OptionSelectModal({ item, onClose, onConfirm }) {
  const optionGroups = useMemo(() => item.option_groups || [], [item.option_groups]);
  const [selection, setSelection] = useState(() => initialSelection(optionGroups));
  const [error, setError] = useState("");

  const allValid = useMemo(
    () => optionGroups.every((group) => groupIsValid(group, selection[group.id])),
    [optionGroups, selection]
  );

  const chosenOptions = useMemo(() => {
    const chosen = [];
    optionGroups.forEach((group) => {
      const value = selection[group.id];
      const pickedIds = group.selection_type === "single" ? (value ? [value] : []) : value || [];
      pickedIds.forEach((optionItemId) => {
        const optionItem = group.options.find((option) => option.id === optionItemId);
        if (optionItem) {
          chosen.push({
            group_name: group.name,
            option_item_id: optionItem.id,
            option_name: optionItem.name,
            price_delta: optionItem.price_delta,
          });
        }
      });
    });
    return chosen;
  }, [optionGroups, selection]);

  const unitPrice = useMemo(
    () => item.base_price + chosenOptions.reduce((sum, option) => sum + option.price_delta, 0),
    [item.base_price, chosenOptions]
  );

  const toggleOption = (group, optionItemId) => {
    setError("");
    setSelection((prev) => {
      if (group.selection_type === "single") {
        return { ...prev, [group.id]: prev[group.id] === optionItemId ? null : optionItemId };
      }
      const current = prev[group.id] || [];
      const isSelected = current.includes(optionItemId);
      let next = isSelected
        ? current.filter((id) => id !== optionItemId)
        : [...current, optionItemId];

      const max = group.max_select ?? Infinity;
      if (next.length > max) next = next.slice(0, max);
      return { ...prev, [group.id]: next };
    });
  };

  const handleConfirm = () => {
    if (!allValid) {
      setError("Lengkapi pilihan yang wajib sebelum menambahkan.");
      return;
    }
    onConfirm({ options: chosenOptions, unitPrice });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border-t border-slate-800 rounded-t-3xl p-6 shadow-2xl max-h-[85vh] flex flex-col z-10">
        <div className="w-12 h-1 bg-slate-700 rounded-full mx-auto mb-4" />
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-black text-slate-100">{item.name}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Pilih opsi untuk item ini</p>
          </div>
          <button
            onClick={onClose}
            className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-400 px-3 py-1.5 rounded-xl"
          >
            Tutup
          </button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-5 pr-1">
          {optionGroups.map((group) => (
            <div key={group.id}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold text-slate-200">{group.name}</h3>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  {group.is_required ? "Wajib" : "Opsional"} · {group.selection_type === "single" ? "Pilih 1" : "Pilih beberapa"}
                </span>
              </div>
              <div className="space-y-2">
                {group.options
                  .filter((option) => option.is_available)
                  .map((option) => {
                    const value = selection[group.id];
                    const checked =
                      group.selection_type === "single"
                        ? value === option.id
                        : (value || []).includes(option.id);
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => toggleOption(group, option.id)}
                        className={`w-full flex justify-between items-center px-3 py-2.5 rounded-xl border transition-colors ${
                          checked
                            ? "bg-amber-500/10 border-amber-500 text-slate-100"
                            : "bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span
                            className={`w-4 h-4 flex items-center justify-center border ${
                              group.selection_type === "single" ? "rounded-full" : "rounded"
                            } ${checked ? "bg-amber-500 border-amber-500" : "border-slate-600"}`}
                          >
                            {checked && <span className="w-1.5 h-1.5 bg-slate-950 rounded-full" />}
                          </span>
                          {option.name}
                        </span>
                        <span className="text-xs font-bold text-amber-400">
                          {option.price_delta > 0 ? `+${formatRupiah(option.price_delta)}` : "Gratis"}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-xs text-red-400 font-medium mt-3">{error}</p>}

        <div className="border-t border-slate-800 pt-4 mt-4 space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-400 font-medium">Harga</span>
            <span className="text-lg font-black text-amber-400">{formatRupiah(unitPrice)}</span>
          </div>
          <button
            onClick={handleConfirm}
            className={`w-full font-black py-3.5 rounded-xl text-center shadow-lg transition-all ${
              allValid
                ? "bg-amber-500 hover:bg-amber-400 text-slate-950"
                : "bg-slate-800 text-slate-500 cursor-not-allowed"
            }`}
          >
            Tambahkan ke Pesanan
          </button>
        </div>
      </div>
    </div>
  );
}
