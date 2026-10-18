import { supabase } from "../supabaseClient";

export async function createPayment(orderId) {
  const { data, error } = await supabase.functions.invoke("payment-create", {
    body: { orderId },
  });

  if (error) {
    throw new Error(`Gagal memulai pembayaran: ${error.message}`);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

export async function fetchOrderPaymentStatus(orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, payment_status, order_status, total_price, table_number")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(`Gagal memuat status pembayaran: ${error.message}`);
  return data;
}
