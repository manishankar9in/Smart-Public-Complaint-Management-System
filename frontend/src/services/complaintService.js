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

// Retry helper with exponential backoff for mobile networks
async function retryWithBackoff(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      // Don't retry on client errors (4xx) except 408 (timeout) and 429 (rate limit)
      if (err.response && err.response.status >= 400 && err.response.status < 500 && 
          err.response.status !== 408 && err.response.status !== 429) {
        throw err;
      }
      // Wait before retry with exponential backoff
      if (i < maxRetries - 1) {
        const waitTime = delayMs * Math.pow(2, i);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }
  throw lastError;
}

export async function createComplaint(payload) {
  return retryWithBackoff(async () => {
    const res = await api.post("/complaints/create", payload);
    return res.data;
  }, 3, 1000);
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
