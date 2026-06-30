import { api } from "../utils/api";

/** Firebase-backed user: prefer uid; merged profile may expose firebase_uid. */
export function getCitizenUid(user) {
  if (!user) return null;
  return user.uid || user.firebase_uid || null;
}

function asComplaintList(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.complaints)) return data.complaints;
  if (data && Array.isArray(data.data)) return data.data;
  return [];
}

export async function createComplaint(payload) {
  const res = await api.post("/complaints/create", payload);
  return res.data;
}

export async function fetchUserComplaints(uid) {
  if (!uid) return [];
  const res = await api.get(`/complaints/status/${encodeURIComponent(uid)}`);
  const list = asComplaintList(res.data);
  return list;
}

export async function fetchAdminComplaints() {
  const res = await api.get("/admin/processing");
  const list = asComplaintList(res.data);
  return list.filter((c) => !["RESOLVED", "CLOSED"].includes(String(c.status || "").toUpperCase()));
}
