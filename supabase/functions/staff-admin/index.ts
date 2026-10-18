// Supabase Edge Function: staff-admin
// Owner-only staff management. Uses the service role to create auth users and
// to change roles, because the service role must never be exposed to browsers.
//
// Actions (POST body):
//   { action: "list" }
//   { action: "create", email, password, role, displayName }
//   { action: "updateRole", userId, role }
//   { action: "setActive", userId, isActive }
//
// Auto-injected: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ROLES = new Set(["owner", "manager", "kitchen"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Tidak terautentikasi" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Identify the caller from their JWT.
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData?.user) return json({ error: "Sesi tidak valid" }, 401);

    // Only active owners may manage staff.
    const { data: caller } = await admin
      .from("staff")
      .select("role, is_active")
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (!caller || caller.role !== "owner" || !caller.is_active) {
      return json({ error: "Hanya owner yang boleh mengelola staf" }, 403);
    }

    const body = await req.json();
    const action = body?.action;

    if (action === "list") {
      const { data, error } = await admin
        .from("staff")
        .select("user_id, email, role, display_name, is_active, created_at")
        .order("created_at", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ staff: data });
    }

    if (action === "create") {
      const { email, password, role, displayName } = body;
      if (!email || !password) return json({ error: "Email dan password wajib diisi" }, 400);
      if (!ROLES.has(role)) return json({ error: "Role tidak valid" }, 400);
      if (String(password).length < 8) return json({ error: "Password minimal 8 karakter" }, 400);

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createError) return json({ error: createError.message }, 400);

      const { error: staffError } = await admin.from("staff").insert([{
        user_id: created.user.id,
        email,
        role,
        display_name: displayName || null,
        is_active: true,
      }]);

      if (staffError) {
        // Roll the auth user back so we do not leave an orphan account.
        await admin.auth.admin.deleteUser(created.user.id);
        return json({ error: staffError.message }, 500);
      }

      return json({ ok: true, userId: created.user.id });
    }

    if (action === "updateRole") {
      const { userId, role } = body;
      if (!userId || !ROLES.has(role)) return json({ error: "Data tidak valid" }, 400);
      if (userId === userData.user.id && role !== "owner") {
        return json({ error: "Owner tidak bisa menurunkan role dirinya sendiri" }, 400);
      }

      const { error } = await admin.from("staff").update({ role }).eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "setActive") {
      const { userId, isActive } = body;
      if (!userId) return json({ error: "userId wajib diisi" }, 400);
      if (userId === userData.user.id && isActive === false) {
        return json({ error: "Owner tidak bisa menonaktifkan dirinya sendiri" }, 400);
      }

      const { error } = await admin
        .from("staff")
        .update({ is_active: Boolean(isActive) })
        .eq("user_id", userId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Aksi tidak dikenal" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Kesalahan tidak terduga" }, 500);
  }
});
