import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function LoginView({ onLoginSuccess }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    // Tembak autentikasi ke Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      alert("⚠️ Login Gagal: " + error.message);
    } else {
      // Jika sukses, lempar data user kembali ke App.jsx untuk buka kunci halaman
      onLoginSuccess(data.user);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black text-amber-500 tracking-tight">
            NGACHOAN <span className="text-white font-light">Staff Portal</span>
          </h1>
          <p className="text-xs text-slate-400 mt-2">Silakan login untuk mengakses panel operasional</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Email Staff</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@ngachoan.com"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-100 focus:outline-none focus:border-amber-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-950 font-black py-3.5 rounded-xl text-center shadow-lg transition-all active:scale-[0.99] disabled:opacity-50"
          >
            {loading ? "Memverifikasi Kunci..." : "Masuk ke Sistem 🔑"}
          </button>
        </form>
      </div>
    </div>
  );
}