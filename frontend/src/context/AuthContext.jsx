import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithRedirect,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "../config/firebase";
import { toast } from "react-toastify";
import { api } from "../utils/api";

const AuthContext = createContext();

const WORKER_TOKEN_KEY = "smartgov_worker_token";
const ROLE_STORAGE_KEY = "role";

function normalizeWorkerUser(workerPayload) {
  const w = workerPayload?.worker || workerPayload;
  if (!w?.worker_uid) return null;
  return {
    uid: w.worker_uid,
    worker_uid: w.worker_uid,
    email: w.email,
    name: w.name,
    role: "worker",
    duty_position: w.duty_position,
    state: w.state,
    city: w.city,
    ward: w.ward,
    street: w.street,
    village: w.village,
    phone: w.phone,
    department: w.department,
    authSource: "worker",
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_STORAGE_KEY));
  const [loading, setLoading] = useState(true);

  const persistRole = (next) => {
    if (next) {
      localStorage.setItem(ROLE_STORAGE_KEY, next);
      setRole(next);
    } else {
      localStorage.removeItem(ROLE_STORAGE_KEY);
      setRole(null);
    }
  };

  const applyAxiosWorkerAuth = (tokenOrNull) => {
    if (tokenOrNull) {
      const h = `Bearer ${tokenOrNull}`;
      api.defaults.headers.common.Authorization = h;
    } else {
      delete api.defaults.headers.common.Authorization;
    }
  };

  const syncFirebaseUser = async (firebaseUser, roleOverride) => {
    const resolvedRole =
      roleOverride ||
      localStorage.getItem(ROLE_STORAGE_KEY) ||
      localStorage.getItem("smartgov_target_role") ||
      "public";
    const syncData = {
      firebase_uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: firebaseUser.displayName || "User",
      role: resolvedRole,
    };

    try {
      const { data: profile } = await api.post("/auth/sync", syncData);
      if (profile?.firebase_uid) {
        const r = profile.role || resolvedRole;
        localStorage.setItem(ROLE_STORAGE_KEY, r);
        return { ...firebaseUser, ...profile, role: r, authSource: "firebase" };
      }
      const { data: fetched } = await api.get(`/auth/${firebaseUser.uid}`);
      const r = fetched?.role || resolvedRole;
      localStorage.setItem(ROLE_STORAGE_KEY, r);
      return { ...firebaseUser, ...fetched, role: r, authSource: "firebase" };
    } catch (syncErr) {
      console.error("Backend sync failed:", syncErr?.response?.data || syncErr.message);
      localStorage.setItem(ROLE_STORAGE_KEY, resolvedRole);
      return { ...firebaseUser, role: resolvedRole, authSource: "firebase" };
    }
  };

  useEffect(() => {
    let mounted = true;
    let unsubscribeFirebase = () => {};

    (async () => {
      const token = localStorage.getItem(WORKER_TOKEN_KEY);
      if (token) {
        try {
          applyAxiosWorkerAuth(token);
          const res = await api.get("/worker-auth/me");
          if (!mounted) return;
          const normalized = normalizeWorkerUser({ worker: res.data });
          if (normalized) {
            setUser(normalized);
            persistRole(normalized.role);
            setLoading(false);
            return;
          }
        } catch {
          localStorage.removeItem(WORKER_TOKEN_KEY);
          applyAxiosWorkerAuth(null);
        }
      }

      unsubscribeFirebase = onAuthStateChanged(auth, async (firebaseUser) => {
        if (!mounted) return;
        try {
          if (firebaseUser) {
            const savedRole = localStorage.getItem(ROLE_STORAGE_KEY);
            if (savedRole) setRole(savedRole);
            const syncedUser = await syncFirebaseUser(firebaseUser);
            if (mounted) {
              setUser(syncedUser);
              persistRole(syncedUser.role || savedRole);
            }
          } else if (mounted) {
            setUser(null);
            persistRole(null);
          }
        } catch (err) {
          console.error("Auth state change error:", err);
          if (mounted) {
            setUser(null);
            persistRole(null);
          }
        } finally {
          if (mounted) setLoading(false);
        }
      });
    })();

    return () => {
      mounted = false;
      unsubscribeFirebase();
    };
  }, []);

  useEffect(() => {
    if (user?.authSource === "worker") {
      const t = localStorage.getItem(WORKER_TOKEN_KEY);
      applyAxiosWorkerAuth(t);
    } else {
      applyAxiosWorkerAuth(null);
    }
  }, [user]);

  const loginWorker = async (email, password) => {
    const res = await api.post("/worker-auth/login", { email, password });
    const token = res.data.access_token;
    localStorage.setItem(WORKER_TOKEN_KEY, token);
    applyAxiosWorkerAuth(token);
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
    const normalized = normalizeWorkerUser(res.data);
    setUser(normalized);
    persistRole(normalized.role);
    return res.data;
  };

  const registerWorker = async (payload) => {
    const res = await api.post("/worker-auth/register", payload);
    const token = res.data.access_token;
    localStorage.setItem(WORKER_TOKEN_KEY, token);
    applyAxiosWorkerAuth(token);
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
    const normalized = normalizeWorkerUser(res.data);
    setUser(normalized);
    persistRole(normalized.role);
    return res.data;
  };

  const login = async (email, password, role = "public") => {
    if (role === "worker") {
      return loginWorker(email, password);
    }
    localStorage.removeItem(WORKER_TOKEN_KEY);
    applyAxiosWorkerAuth(null);
    localStorage.setItem("smartgov_target_role", role);
    localStorage.setItem(ROLE_STORAGE_KEY, role);
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const syncedUser = await syncFirebaseUser(userCredential.user, role);
    setUser(syncedUser);
    persistRole(syncedUser.role);
    return userCredential;
  };

  const loginWithGoogle = async (role = "public") => {
    if (role === "admin") {
      toast.error("Administrative access requires secure credential authentication. Google Sign-In is restricted for Admin.");
      return;
    }
    if (role === "worker") {
      toast.error("Field workers use email/password registration on this portal (no Google sign-in).");
      return;
    }

    const provider = new GoogleAuthProvider();
    localStorage.setItem("smartgov_target_role", role);
    localStorage.setItem(ROLE_STORAGE_KEY, role);

    try {
      const result = await signInWithPopup(auth, provider);
      const syncedUser = await syncFirebaseUser(result.user, role);
      setUser(syncedUser);
      persistRole(syncedUser.role);
      return result;
    } catch (error) {
      if (
        error?.code === "auth/popup-blocked" ||
        error?.code === "auth/popup-closed-by-user" ||
        error?.code === "auth/cancelled-popup-request"
      ) {
        return signInWithRedirect(auth, provider);
      }
      toast.error(error?.message || "Google Auth Denied");
      throw error;
    }
  };

  const register = async (email, password, name, role, locationData) => {
    if (role === "worker") {
      throw new Error("Use worker registration form fields (duty, jurisdiction).");
    }
    localStorage.removeItem(WORKER_TOKEN_KEY);
    applyAxiosWorkerAuth(null);
    const regRole = role || "public";
    localStorage.setItem("smartgov_target_role", regRole);
    localStorage.setItem(ROLE_STORAGE_KEY, regRole);
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    const { data: profile } = await api.post("/auth/sync", {
      firebase_uid: firebaseUser.uid,
      email,
      name,
      role,
      ...locationData,
    });

    if (profile?.firebase_uid) {
      const u = { ...firebaseUser, ...profile, authSource: "firebase" };
      setUser(u);
      persistRole(u.role || regRole);
    } else {
      setUser({ ...firebaseUser, role: regRole, authSource: "firebase" });
      persistRole(regRole);
    }

    return userCredential;
  };

  const logout = async () => {
    localStorage.removeItem("smartgov_target_role");
    localStorage.removeItem(WORKER_TOKEN_KEY);
    applyAxiosWorkerAuth(null);
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
    setUser(null);
    persistRole(null);
  };

  const resetPassword = (email) => {
    return sendPasswordResetEmail(auth, email);
  };

  const value = {
    user,
    role,
    loading,
    login,
    loginWorker,
    registerWorker,
    loginWithGoogle,
    register,
    logout,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
