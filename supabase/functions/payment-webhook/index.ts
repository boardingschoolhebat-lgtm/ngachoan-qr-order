// Supabase Edge Function: payment-webhook
// Receives Midtrans HTTP notifications, verifies the signature, and applies the
// payment result through apply_payment_result() (service role only).
//
// This function must be deployed with --no-verify-jwt (Midtrans calls it
// without a Supabase JWT); authenticity comes from the Midtrans signature.
//
// Secrets:
//   MIDTRANS_SERVER_KEY
// Auto-injected: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function sha512Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-512", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function normalizeStatus(transactionStatus: string, fraudStatus: string): string {
  if (transactionStatus === "capture") {
    return fraudStatus === "accept" ? "PAID" : "PENDING";
  }
  if (transactionStatus === "settlement") return "PAID";
  if (["deny", "cancel", "expire", "failure"].includes(transactionStatus)) return "FAILED";
  return "PENDING";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const notification = await req.json();
    const {
      order_id,
      status_code,
      gross_amount,
      signature_key,
      transaction_status,
      fraud_status = "",
      transaction_id = "",
    } = notification ?? {};

    if (!order_id || !status_code || !gross_amount || !signature_key) {
      return new Response("Notifikasi tidak lengkap", { status: 400 });
    }

    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    if (!serverKey) {
      return new Response("Server key belum diatur", { status: 500 });
    }

    const expected = await sha512Hex(`${order_id}${status_code}${gross_amount}${serverKey}`);
    if (!timingSafeEqual(expected, String(signature_key))) {
      return new Response("Signature tidak valid", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify the amount against our own record before trusting the notification.
    const { data: order, error } = await supabase
      .from("orders")
      .select("id, total_price")
      .eq("id_order_fintech", order_id)
      .maybeSingle();

    if (error) return new Response(error.message, { status: 500 });
    if (!order) return new Response("Pesanan tidak ditemukan", { status: 404 });

    if (Math.round(Number(order.total_price)) !== Math.round(Number(gross_amount))) {
      return new Response("Nominal tidak cocok", { status: 409 });
    }

    const normalized = normalizeStatus(String(transaction_status), String(fraud_status));

    const { error: rpcError } = await supabase.rpc("apply_payment_result", {
      p_order_ref: order_id,
      p_status: normalized,
      p_provider: "MIDTRANS",
      p_reference: transaction_id,
      p_payload: notification,
    });

    if (rpcError) return new Response(rpcError.message, { status: 500 });

    return new Response(JSON.stringify({ ok: true, status: normalized }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kesalahan tidak terduga", {
      status: 500,
    });
  }
});
