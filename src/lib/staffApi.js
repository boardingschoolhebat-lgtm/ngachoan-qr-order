import { supabase } from "../supabaseClient";

async function callStaffAdmin(body) {
  const { data, error } = await supabase.functions.invoke("staff-admin", { body });

  if (error) {
    throw new Error(`Gagal menghubungi layanan staf: ${error.message}`);
  }
  if (data?.error) {
    throw new Error(data.error);
  }
  return data;
}

export async function listStaff() {
  const data = await callStaffAdmin({ action: "list" });
  return data.staff || [];
}

export async function createStaff({ email, password, role, displayName }) {
  return callStaffAdmin({ action: "create", email, password, role, displayName });
}

export async function updateStaffRole(userId, role) {
  return callStaffAdmin({ action: "updateRole", userId, role });
}

export async function setStaffActive(userId, isActive) {
  return callStaffAdmin({ action: "setActive", userId, isActive });
}
