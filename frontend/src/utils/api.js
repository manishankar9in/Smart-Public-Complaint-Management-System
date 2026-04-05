import axios from "axios";

const raw = import.meta.env.VITE_BACKEND_URL;
/**
 * In dev, always use same-origin `/api` so Vite proxies to FastAPI (vite.config.js).
 * That avoids browser CORS even if VITE_BACKEND_URL points at :8000 in .env.
 */
const base = import.meta.env.DEV
  ? ""
  : (String(raw || "").trim() || "http://localhost:8000").replace(/\/$/, "");

/** Single client: timeouts avoid hanging when API or MongoDB is down */
export const api = axios.create({
  baseURL: `${base}/api`,
  timeout: 20000,
  headers: { "Content-Type": "application/json" },
});

export function formatApiError(err) {
  if (err?.code === "ECONNABORTED" || err?.message?.includes("timeout")) {
    return "Request timed out. Start the backend (uvicorn), ensure MongoDB is running, and check VITE_BACKEND_URL.";
  }
  if (!err?.response) {
    if (err?.message && typeof err.message === "string") {
      return err.message;
    }
    return "Cannot reach the server. Confirm the API is running and VITE_BACKEND_URL in .env.local matches it.";
  }
  const d = err.response.data;
  if (typeof d?.detail === "string") return d.detail;
  if (Array.isArray(d?.detail)) {
    return d.detail.map((x) => (typeof x === "string" ? x : x?.msg || JSON.stringify(x))).join(" ");
  }
  return err.message || "Request failed";
}
