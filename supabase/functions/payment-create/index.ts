// Supabase Edge Function: payment-create
// Creates a Midtrans Snap transaction for an existing unpaid order and returns
// the redirect URL. In PAYMENT_MODE=simulation it marks the order paid instead
// (still server-side, so the client cannot forge payment).
//
// Secrets (supabase secrets set ...):
//   MIDTRANS_SERVER_KEY
//   MIDTRANS_IS_PRODUCTION   "true" | "false"   (default false = sandbox)
//   PAYMENT_MODE             "midtrans" | "simulation" (default simulation)
//   APP_BASE_URL             e.g. https://your-app.example.com
// Auto-injected by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_BASE_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { orderId } = await req.json();
    if (!orderId) return json({ error: "orderId wajib diisi" }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: order, error } = await supabase
      .from("orders")
      .select("id, id_order_fintech, table_number, total_price, payment_status, payment_method")
      .eq("id", orderId)
      .maybeSingle();

    if (error) return json({ error: error.message }, 500);
    if (!order) return json({ error: "Pesanan tidak ditemukan" }, 404);
    if (order.payment_status === "PAID") {
      return json({ paid: true, alreadyPaid: true });
    }
    if (order.payment_method !== "ONLINE") {
      return json({ error: "Pesanan ini dibayar di kasir" }, 400);
    }

    const mode = Deno.env.get("PAYMENT_MODE") ?? "simulation";

    if (mode === "simulation") {
      const { error: rpcError } = await supabase.rpc("apply_payment_result", {
        p_order_ref: order.id_order_fintech,
        p_status: "PAID",
        p_provider: "SIMULATION",
        p_reference: `SIM-${Date.now()}`,
        p_payload: { mode: "simulation" },
      });
      if (rpcError) return json({ error: rpcError.message }, 500);
      return json({ paid: true, mode: "simulation" });
    }

    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    if (!serverKey) return json({ error: "MIDTRANS_SERVER_KEY belum diatur" }, 500);

    const isProduction = Deno.env.get("MIDTRANS_IS_PRODUCTION") === "true";
    const baseUrl = isProduction
      ? "https://app.midtrans.com/snap/v1/transactions"
      : "https://app.sandbox.midtrans.com/snap/v1/transactions";

    const appBase = (Deno.env.get("APP_BASE_URL") ?? "").replace(/\/$/, "");
    const finishUrl = `${appBase}/?page=payment-result&order=${order.id}`;

    const payload = {
      transaction_details: {
        order_id: order.id_order_fintech,
        gross_amount: Math.round(Number(order.total_price)),
      },
      callbacks: { finish: finishUrl },
      item_details: [
        {
          id: "ORDER",
          name: `Pesanan ${order.table_number}`.slice(0, 50),
          price: Math.round(Number(order.total_price)),
          quantity: 1,
        },
      ],
    };

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Basic ${btoa(`${serverKey}:`)}`,
      },
      body: JSON.stringify(payload),
    });

    const snap = await response.json();
    if (!response.ok) {
      return json({ error: snap?.error_messages?.join(", ") ?? "Gagal membuat transaksi" }, 502);
    }

    await supabase
      .from("orders")
      .update({
        payment_provider: "MIDTRANS",
        payment_token: snap.token,
        payment_reference: snap.token,
      })
      .eq("id", order.id);

    return json({ redirect_url: snap.redirect_url, token: snap.token });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Kesalahan tidak terduga" }, 500);
  }
});
