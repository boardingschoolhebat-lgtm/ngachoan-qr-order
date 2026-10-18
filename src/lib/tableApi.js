import { supabase } from "../supabaseClient";

function assertNoError(error, context) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function fetchTables() {
  const { data, error } = await supabase
    .from("restaurant_tables")
    .select("*")
    .order("sort_order", { ascending: true });

  assertNoError(error, "Gagal memuat daftar meja");
  return data || [];
}

export async function createTable({ label, zone, sortOrder }) {
  const { data, error } = await supabase
    .from("restaurant_tables")
    .insert([{ label, zone: zone || null, sort_order: sortOrder ?? 0 }])
    .select()
    .single();

  assertNoError(error, "Gagal membuat meja");
  return data;
}

export async function updateTable(id, payload) {
  const { data, error } = await supabase
    .from("restaurant_tables")
    .update(payload)
    .eq("id", id)
    .select()
    .single();

  assertNoError(error, "Gagal memperbarui meja");
  return data;
}

export async function deleteTable(id) {
  const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
  assertNoError(error, "Gagal menghapus meja");
}

export function tableOrderUrl(label, origin = window.location.origin) {
  return `${origin}/?meja=${encodeURIComponent(label)}`;
}
