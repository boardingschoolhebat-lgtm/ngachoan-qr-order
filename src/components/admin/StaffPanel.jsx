import { useEffect, useState } from "react";
import { listStaff, createStaff, updateStaffRole, setStaffActive } from "../../lib/staffApi";

const ROLES = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "kitchen", label: "Dapur" },
];

export default function StaffPanel() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    displayName: "",
    role: "kitchen",
  });

  const load = async () => {
    try {
      const data = await listStaff();
      setStaff(data);
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
    run(async () => {
      await createStaff(form);
      setForm({ email: "", password: "", displayName: "", role: "kitchen" });
    });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <p className="text-sm font-bold text-slate-200">Akun Staf Baru</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="email@ngachoan.com"
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
          />
          <input
            required
            value={form.displayName}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            placeholder="Nama tampilan"
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
          />
          <input
            type="password"
            required
            minLength={8}
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="Password (min. 8 karakter)"
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
          />
          <select
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value })}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-500"
          >
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-5 py-2 rounded-xl text-sm disabled:opacity-50"
        >
          {busy ? "Memproses..." : "Buat Akun"}
        </button>
      </form>

      {error && <p className="text-xs text-red-400 font-medium">{error}</p>}

      {loading ? (
        <p className="text-sm text-slate-500 text-center py-8">Memuat staf...</p>
      ) : (
        <div className="space-y-2">
          {staff.map((member) => (
            <div
              key={member.user_id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 bg-slate-900 border border-slate-800 rounded-xl p-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-200 truncate">
                  {member.display_name || member.email}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{member.email}</p>
              </div>

              <select
                value={member.role}
                onChange={(event) => run(() => updateStaffRole(member.user_id, event.target.value))}
                disabled={busy}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                {ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() => run(() => setStaffActive(member.user_id, !member.is_active))}
                disabled={busy}
                className={`text-[11px] px-2 py-1.5 rounded-lg border whitespace-nowrap ${
                  member.is_active
                    ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                    : "text-slate-500 border-slate-700 bg-slate-800"
                }`}
              >
                {member.is_active ? "Aktif" : "Nonaktif"}
              </button>
            </div>
          ))}
          {staff.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">Belum ada staf.</p>
          )}
        </div>
      )}
    </div>
  );
}
