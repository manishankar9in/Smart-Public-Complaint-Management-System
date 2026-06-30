import { createContext, useContext, useEffect, useState } from "react";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from "firebase/auth";
import { auth } from "../config/firebase";
import { toast } from "react-toastify";
import { api } from "../utils/api";

const AuthContext = createContext();

const WORKER_TOKEN_KEY = "smartgov_worker_token";
const ROLE_STORAGE_KEY = "role";

function mapApiError(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || String(d)).join(", ");
  return error?.message || "Request failed.";
}

function mapFirebaseError(error) {
  const code = error?.code || "";
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Invalid email or password. Please check your credentials.";
  }
  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }
  if (code === "auth/user-disabled") {
    return "This account is disabled in Firebase Authentication.";
  }
  if (code === "auth/too-many-requests") {
    return "Too many failed attempts. Please wait a moment and try again.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Email/password sign-in is disabled in Firebase Console. Enable it in Authentication > Sign-in method.";
  }
  if (code === "auth/network-request-failed") {
    return "Network error while contacting Firebase. Check your internet connection.";
  }
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Google sign-in was cancelled.";
  }
  if (code === "auth/popup-blocked") {
    return "Popup blocked. Allow popups for this site and try again.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This domain is not authorized in Firebase Console (Authentication > Settings > Authorized domains). Add localhost.";
  }
  if (code === "auth/api-key-not-valid.-please-pass-a-valid-api-key.") {
    return "Firebase API key is invalid. Check VITE_FIREBASE_API_KEY in frontend/.env.local.";
  }
  if (code === "auth/argument-error") {
    return "Google sign-in configuration error. Restart the dev server and ensure Google is enabled in Firebase Console.";
  }
  return error?.message || "Authentication failed.";
}

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
    complaints_solved: w.complaints_solved ?? 0,
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
      api.defaults.headers.common.Authorization = `Bearer ${tokenOrNull}`;
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
      if (syncErr?.response && (syncErr.response.status === 403 || syncErr.response.status === 400)) {
        try {
          await signOut(auth);
        } catch (signOutErr) {
          console.error("SignOut during sync error failed:", signOutErr);
        }
        const backendMsg = syncErr.response.data?.detail || "Access denied by server validation.";
        throw new Error(backendMsg);
      }
      localStorage.setItem(ROLE_STORAGE_KEY, resolvedRole);
      return { ...firebaseUser, role: resolvedRole, authSource: "firebase" };
    }
  };

  useEffect(() => {
    let mounted = true;
    let unsubscribeFirebase = () => {};

    const bootstrap = async () => {
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

      try {
        await auth.authStateReady();
      } catch (err) {
        console.error("Firebase authStateReady failed:", err);
        if (mounted) setLoading(false);
        return;
      }

      try {
        const redirectResult = await getRedirectResult(auth);
        if (redirectResult?.user && mounted) {
          const savedRole =
            localStorage.getItem(ROLE_STORAGE_KEY) ||
            localStorage.getItem("smartgov_target_role") ||
            "public";
          const syncedUser = await syncFirebaseUser(redirectResult.user, savedRole);
          if (mounted) {
            setUser(syncedUser);
            persistRole(syncedUser.role || savedRole);
            setLoading(false);
          }
          return;
        }
      } catch (redirectErr) {
        console.error("Google redirect sign-in failed:", redirectErr);
      }

      if (!mounted) return;

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
            if (!localStorage.getItem(WORKER_TOKEN_KEY)) {
              setUser(null);
              persistRole(null);
            }
          }
        } catch (err) {
          console.error("Auth state change error:", err);
          if (mounted && !localStorage.getItem(WORKER_TOKEN_KEY)) setUser(null);
        } finally {
          if (mounted) setLoading(false);
        }
      });
    };

    bootstrap();

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
    try {
      const res = await api.post("/worker-auth/login", { email, password });
      const token = res.data.access_token;
      if (!token) {
        throw new Error("No token received from worker login");
      }
      
      localStorage.setItem(WORKER_TOKEN_KEY, token);
      localStorage.setItem(ROLE_STORAGE_KEY, "worker");
      applyAxiosWorkerAuth(token);
      
      try {
        await signOut(auth);
      } catch {
        /* ignore Firebase logout errors */
      }
      
      const normalized = normalizeWorkerUser(res.data);
      if (normalized) {
        setUser(normalized);
        persistRole(normalized.role);
      }
      return res.data;
    } catch (error) {
      localStorage.removeItem(WORKER_TOKEN_KEY);
      applyAxiosWorkerAuth(null);
      throw new Error(mapApiError(error));
    }
  };

  const registerWorker = async (payload) => {
    try {
      const res = await api.post("/worker-auth/register", payload);
      const token = res.data.access_token;
      if (!token) {
        throw new Error("No token received from worker registration");
      }
      
      localStorage.setItem(WORKER_TOKEN_KEY, token);
      localStorage.setItem(ROLE_STORAGE_KEY, "worker");
      applyAxiosWorkerAuth(token);
      
      try {
        await signOut(auth);
      } catch {
        /* ignore Firebase logout errors */
      }
      
      const normalized = normalizeWorkerUser(res.data);
      if (normalized) {
        setUser(normalized);
        persistRole(normalized.role);
      }
      return res.data;
    } catch (error) {
      localStorage.removeItem(WORKER_TOKEN_KEY);
      applyAxiosWorkerAuth(null);
      throw new Error(mapApiError(error));
    }
  };

  const login = async (email, password, role = "public") => {
    try {
      if (role === "worker") {
        return await loginWorker(email, password);
      }
      localStorage.removeItem(WORKER_TOKEN_KEY);
      applyAxiosWorkerAuth(null);
      localStorage.setItem("smartgov_target_role", role);
      localStorage.setItem(ROLE_STORAGE_KEY, role);
      
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const syncedUser = await syncFirebaseUser(userCredential.user, role);
      if (syncedUser) {
        setUser(syncedUser);
        persistRole(syncedUser.role || role);
      }
      return userCredential;
    } catch (error) {
      localStorage.removeItem("smartgov_target_role");
      if (role !== "worker") localStorage.removeItem(ROLE_STORAGE_KEY);
      throw new Error(role === "worker" ? mapApiError(error) : mapFirebaseError(error));
    }
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
    provider.addScope("email");
    provider.addScope("profile");
    provider.setCustomParameters({ prompt: "select_account" });
    localStorage.setItem("smartgov_target_role", role);
    localStorage.setItem(ROLE_STORAGE_KEY, role);

    try {
      let result;
      try {
        result = await signInWithPopup(auth, provider);
      } catch (popupErr) {
        const code = popupErr?.code || "";
        if (
          code === "auth/popup-blocked" ||
          code === "auth/operation-not-supported-in-this-environment"
        ) {
          await signInWithRedirect(auth, provider);
          return null;
        }
        throw popupErr;
      }
      const syncedUser = await syncFirebaseUser(result.user, role);
      if (syncedUser) {
        setUser(syncedUser);
        persistRole(syncedUser.role || role);
      }
      return result;
    } catch (error) {
      localStorage.removeItem("smartgov_target_role");
      throw new Error(mapFirebaseError(error));
    }
  };

  const register = async (email, password, name, role, locationData) => {
    if (role === "worker") {
      throw new Error("Use worker registration form fields (duty, jurisdiction).");
    }
    localStorage.removeItem(WORKER_TOKEN_KEY);
    applyAxiosWorkerAuth(null);
    const regRole = role || "public";
    const displayName = (name && name.trim()) || email.split("@")[0] || "User";
    localStorage.setItem("smartgov_target_role", regRole);
    localStorage.setItem(ROLE_STORAGE_KEY, regRole);
    let firebaseUser;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      firebaseUser = userCredential.user;
    } catch (error) {
      throw new Error(mapFirebaseError(error));
    }

    const { data: profile } = await api.post("/auth/sync", {
      firebase_uid: firebaseUser.uid,
      email,
      name: displayName,
      role: regRole,
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

    return firebaseUser;
  };

  const logout = async () => {
    localStorage.removeItem("smartgov_target_role");
    localStorage.removeItem(WORKER_TOKEN_KEY);
    localStorage.removeItem("auth_user");
    applyAxiosWorkerAuth(null);
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
    setUser(null);
    persistRole(null);
  };

  const resetPassword = async (email) => {
    const normalizedEmail = email.trim();
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
    } catch (error) {
      throw new Error(mapFirebaseError(error));
    }
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
