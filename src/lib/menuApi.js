import { supabase } from "../supabaseClient";

const MENU_IMAGE_BUCKET = "menu-images";
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function assertNoError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function normalizeOptionGroup(group) {
  const options = (group.option_items || [])
    .map((option) => ({
      id: option.id,
      group_id: option.group_id,
      name: option.name,
      price_delta: Number(option.price_delta),
      is_available: option.is_available,
      sort_order: option.sort_order,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);

  return {
    id: group.id,
    name: group.name,
    selection_type: group.selection_type,
    is_required: group.is_required,
    min_select: group.min_select,
    max_select: group.max_select,
    sort_order: group.sort_order,
    options,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchCategories() {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });

  assertNoError(error, "Gagal memuat kategori");
  return data || [];
}

export async function fetchOptionGroups() {
  const { data, error } = await supabase
    .from("option_groups")
    .select("*, option_items(*)")
    .order("sort_order", { ascending: true });

  assertNoError(error, "Gagal memuat grup opsi");
  return (data || []).map(normalizeOptionGroup);
}

export async function fetchMenuTree() {
  const [categoriesResult, itemsResult] = await Promise.all([
    supabase.from("categories").select("*").order("sort_order", { ascending: true }),
    supabase
      .from("menu_items")
      .select("*, menu_item_option_groups(sort_order, option_groups(*, option_items(*)))")
      .order("sort_order", { ascending: true }),
  ]);

  assertNoError(categoriesResult.error, "Gagal memuat kategori");
  assertNoError(itemsResult.error, "Gagal memuat menu");

  const items = (itemsResult.data || []).map((item) => {
    const optionGroups = (item.menu_item_option_groups || [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((link) => normalizeOptionGroup(link.option_groups))
      .filter(Boolean);

    return {
      id: item.id,
      category_id: item.category_id,
      name: item.name,
      description: item.description,
      base_price: Number(item.base_price),
      image_url: item.image_url,
      is_available: item.is_available,
      sort_order: item.sort_order,
      option_groups: optionGroups,
    };
  });

  return { categories: categoriesResult.data || [], items };
}

export async function fetchMyStaff() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  assertNoError(userError, "Gagal memuat sesi pengguna");

  const userId = userData?.user?.id;
  if (!userId) return null;

  const { data, error } = await supabase
    .from("staff")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  assertNoError(error, "Gagal memuat data staff");
  return data || null;
}

// ---------------------------------------------------------------------------
// Category writes
// ---------------------------------------------------------------------------

export async function createCategory(payload) {
  const { data, error } = await supabase.from("categories").insert([payload]).select().single();
  assertNoError(error, "Gagal membuat kategori");
  return data;
}

export async function updateCategory(id, payload) {
  const { data, error } = await supabase
    .from("categories")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  assertNoError(error, "Gagal memperbarui kategori");
  return data;
}

export async function deleteCategory(id) {
  const { count, error: countError } = await supabase
    .from("menu_items")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  assertNoError(countError, "Gagal memeriksa kategori");
  if (count && count > 0) {
    throw new Error(`Kategori masih dipakai oleh ${count} menu. Pindahkan atau hapus menu itu dulu.`);
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  assertNoError(error, "Gagal menghapus kategori");
}

// ---------------------------------------------------------------------------
// Menu item writes
// ---------------------------------------------------------------------------

export async function createMenuItem(payload) {
  const { data, error } = await supabase.from("menu_items").insert([payload]).select().single();
  assertNoError(error, "Gagal membuat menu");
  return data;
}

export async function updateMenuItem(id, payload) {
  const { data, error } = await supabase
    .from("menu_items")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  assertNoError(error, "Gagal memperbarui menu");
  return data;
}

export async function deleteMenuItem(id) {
  const { error } = await supabase.from("menu_items").delete().eq("id", id);
  assertNoError(error, "Gagal menghapus menu");
}

export async function setItemAvailability(id, isAvailable) {
  const { error } = await supabase
    .from("menu_items")
    .update({ is_available: isAvailable })
    .eq("id", id);
  assertNoError(error, "Gagal mengubah ketersediaan menu");
}

// ---------------------------------------------------------------------------
// Option group + option item writes
// ---------------------------------------------------------------------------

export async function createOptionGroup(payload) {
  const { data, error } = await supabase.from("option_groups").insert([payload]).select().single();
  assertNoError(error, "Gagal membuat grup opsi");
  return data;
}

export async function updateOptionGroup(id, payload) {
  const { data, error } = await supabase
    .from("option_groups")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  assertNoError(error, "Gagal memperbarui grup opsi");
  return data;
}

export async function deleteOptionGroup(id) {
  const { count, error: countError } = await supabase
    .from("menu_item_option_groups")
    .select("menu_item_id", { count: "exact", head: true })
    .eq("option_group_id", id);

  assertNoError(countError, "Gagal memeriksa grup opsi");
  if (count && count > 0) {
    throw new Error(`Grup opsi masih terpasang di ${count} menu. Lepas dari menu itu dulu.`);
  }

  const { error } = await supabase.from("option_groups").delete().eq("id", id);
  assertNoError(error, "Gagal menghapus grup opsi");
}

export async function createOptionItem(payload) {
  const { data, error } = await supabase.from("option_items").insert([payload]).select().single();
  assertNoError(error, "Gagal membuat opsi");
  return data;
}

export async function updateOptionItem(id, payload) {
  const { data, error } = await supabase
    .from("option_items")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  assertNoError(error, "Gagal memperbarui opsi");
  return data;
}

export async function deleteOptionItem(id) {
  const { error } = await supabase.from("option_items").delete().eq("id", id);
  assertNoError(error, "Gagal menghapus opsi");
}

// ---------------------------------------------------------------------------
// Attach/detach shared option groups on items
// ---------------------------------------------------------------------------

export async function attachOptionGroup(menuItemId, optionGroupId, sortOrder = 0) {
  const { error } = await supabase
    .from("menu_item_option_groups")
    .upsert([{ menu_item_id: menuItemId, option_group_id: optionGroupId, sort_order: sortOrder }]);
  assertNoError(error, "Gagal memasang grup opsi ke menu");
}

export async function detachOptionGroup(menuItemId, optionGroupId) {
  const { error } = await supabase
    .from("menu_item_option_groups")
    .delete()
    .eq("menu_item_id", menuItemId)
    .eq("option_group_id", optionGroupId);
  assertNoError(error, "Gagal melepas grup opsi dari menu");
}

export async function setItemOptionGroups(menuItemId, optionGroupIds) {
  const { error: deleteError } = await supabase
    .from("menu_item_option_groups")
    .delete()
    .eq("menu_item_id", menuItemId);
  assertNoError(deleteError, "Gagal mereset grup opsi menu");

  if (!optionGroupIds || optionGroupIds.length === 0) return;

  const rows = optionGroupIds.map((groupId, index) => ({
    menu_item_id: menuItemId,
    option_group_id: groupId,
    sort_order: index,
  }));

  const { error: insertError } = await supabase.from("menu_item_option_groups").insert(rows);
  assertNoError(insertError, "Gagal memasang grup opsi ke menu");
}

// ---------------------------------------------------------------------------
// Image upload
// ---------------------------------------------------------------------------

export async function uploadMenuImage(file) {
  if (!file) throw new Error("Tidak ada file yang dipilih.");
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Format gambar harus JPG, PNG, WEBP, atau GIF.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Ukuran gambar maksimal 5 MB.");
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `items/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage.from(MENU_IMAGE_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  assertNoError(error, "Gagal mengunggah gambar");

  const { data } = supabase.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

export function subscribeToMenu(onChange) {
  const channel = supabase
    .channel("menu_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_items" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "option_groups" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "option_items" }, onChange)
    .on("postgres_changes", { event: "*", schema: "public", table: "menu_item_option_groups" }, onChange)
    .subscribe();

  return () => supabase.removeChannel(channel);
}
