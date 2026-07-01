import axios from "axios";

const raw = String(import.meta.env.VITE_BACKEND_URL || "").trim();
/**
 * In dev, always use same-origin `/api` so Vite proxies to FastAPI (vite.config.js).
 * In production, use VITE_BACKEND_URL if configured. When deployed as a Vercel
 * experimental service, fallback to the backend route prefix used by the
 * Vercel backend service: `/_/backend`.
 */
const base = import.meta.env.DEV
  ? ""
  : raw
      ? raw.replace(/\/$/, "")
      : "/_/backend";

/** Single client: timeouts avoid hanging when API or MongoDB is down */
export const api = axios.create({
  baseURL: `${base}/api`,
  timeout: 60000, // Increased to 60s for mobile networks with large image uploads
  headers: { "Content-Type": "application/json" },
});

// Add request interceptor to include auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('smartgov_worker_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor to handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('smartgov_worker_token');
      localStorage.removeItem('auth_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

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
