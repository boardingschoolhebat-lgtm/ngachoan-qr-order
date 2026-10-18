import { supabase } from "../supabaseClient";

function assertNoError(error, context) {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

export async function createOrder({ tableNumber, paymentMethod, lines }) {
  const { data, error } = await supabase.rpc("create_order", {
    p_table_number: tableNumber,
    p_payment_method: paymentMethod,
    p_lines: lines,
  });
  assertNoError(error, "Gagal membuat pesanan");
  return data;
}

export async function markOrderPaid(orderId) {
  const { error } = await supabase.rpc("mark_order_paid", { p_order_id: String(orderId) });
  assertNoError(error, "Gagal menandai pembayaran");
}

export async function startOrder(orderId) {
  const { error } = await supabase.rpc("start_order", { p_order_id: String(orderId) });
  assertNoError(error, "Gagal memulai pesanan");
}

export async function finishOrder(orderId) {
  const { error } = await supabase.rpc("finish_order", { p_order_id: String(orderId) });
  assertNoError(error, "Gagal menyelesaikan pesanan");
}

export async function cancelOrder(orderId) {
  const { error } = await supabase.rpc("cancel_order", { p_order_id: String(orderId) });
  assertNoError(error, "Gagal membatalkan pesanan");
}

export async function serveOrder(orderId) {
  const { error } = await supabase.rpc("serve_order", { p_order_id: String(orderId) });
  assertNoError(error, "Gagal menandai pesanan tersaji");
}

export async function closeOrder(orderId) {
  const { error } = await supabase.rpc("close_order", { p_order_id: String(orderId) });
  assertNoError(error, "Gagal menutup pesanan");
}
