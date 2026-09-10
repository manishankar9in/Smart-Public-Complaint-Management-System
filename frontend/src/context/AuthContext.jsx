import { createContext, useContext, useEffect, useState, useRef } from "react";
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
const API_TOKEN_KEY = "smartgov_api_token";
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
  if (code === "auth/email-already-in-use") {
    return "This email is already registered. Please sign in or use a different email.";
  }
  if (code === "auth/weak-password") {
    return "Password is too weak. Please use at least 6 characters.";
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

function normalizeWorkerUser(data) {
  if (!data?.worker) return null;
  const w = data.worker;
  return {
    ...w,
    uid: w._id || w.worker_uid || w.id,
    id: w._id || w.worker_uid || w.id,
    role: "worker",
    name: w.name,
    email: w.email,
    department: w.department,
    state: w.state,
    city: w.city,
    ward: w.ward,
    street: w.street,
    village: w.village,
    phone: w.phone,
    available: w.available !== undefined ? w.available : true,
    latitude: w.latitude,
    longitude: w.longitude,
    complaints_solved: w.complaints_solved ?? 0,
    authSource: "worker",
  };
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(() => localStorage.getItem(ROLE_STORAGE_KEY));
  const [loading, setLoading] = useState(true);
  const isRegisteringRef = useRef(false);

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

  const syncFirebaseUser = async (firebaseUser, roleOverride, options = {}) => {
    const resolvedRole =
      roleOverride ||
      localStorage.getItem(ROLE_STORAGE_KEY) ||
      localStorage.getItem("smartgov_target_role") ||
      "public";

    const isGoogle = firebaseUser.providerData?.some((p) => p.providerId === "google.com");

    const syncData = {
      firebase_uid: firebaseUser.uid,
      email: firebaseUser.email,
      name: firebaseUser.displayName || "User",
      role: resolvedRole,
      auth_provider: isGoogle ? "google.com" : "password",
      email_verified: isGoogle ? true : Boolean(firebaseUser.emailVerified),
      is_login: options.is_login || false,
      ...options.locationData,
    };

    try {
      const { data: profile } = await api.post("/auth/sync", syncData);

      // If citizen account is not verified and not Google login, block access!
      if (resolvedRole === "public" && profile && profile.email_verified === false && !isGoogle) {
        if (!options.is_registration) {
          try { await signOut(auth); } catch { /* ignore */ }
          localStorage.removeItem("smartgov_target_role");
          localStorage.removeItem(ROLE_STORAGE_KEY);
          throw new Error("EMAIL_NOT_VERIFIED: Please check your email inbox and click the verification link before signing in.");
        }
      }

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
        
        // Check if this is a worker trying to login via public portal
        if (backendMsg.includes("WORKER") && backendMsg.includes("PUBLIC")) {
          throw new Error("This account is registered as a Worker. Please use the Worker Login portal instead.");
        }
        
        throw new Error(backendMsg);
      }
      if (syncErr.message?.startsWith("EMAIL_NOT_VERIFIED")) {
        throw syncErr;
      }
      localStorage.setItem(ROLE_STORAGE_KEY, resolvedRole);
      return { ...firebaseUser, role: resolvedRole, authSource: "firebase" };
    }
  };

  useEffect(() => {
    let mounted = true;
    let unsubscribeFirebase = () => {};

    const bootstrap = async () => {
      const token = localStorage.getItem(API_TOKEN_KEY) || localStorage.getItem(WORKER_TOKEN_KEY);
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
          try {
            const res = await api.get("/auth/admin-me");
            if (mounted) {
              const adminData = res.data;
              if (adminData?.role === "admin") {
                setUser({ ...adminData, authSource: "admin" });
                persistRole("admin");
                setLoading(false);
                return;
              }
            }
          } catch {
            // ignore and clear invalid or expired token
          }
          localStorage.removeItem(API_TOKEN_KEY);
          localStorage.removeItem(WORKER_TOKEN_KEY);
          applyAxiosWorkerAuth(null);
        }
      }

      try {
        await new Promise((resolve) => {
          const unsubscribeInit = onAuthStateChanged(
            auth,
            () => {
              unsubscribeInit();
              resolve();
            },
            () => {
              unsubscribeInit();
              resolve();
            }
          );
        });
      } catch (err) {
        console.error("Firebase initialization failed:", err);
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
        // If registration is in progress, do not auto-login
        if (isRegisteringRef.current) return;
        try {
          if (firebaseUser) {
            const savedRole = localStorage.getItem(ROLE_STORAGE_KEY);
            if (savedRole) setRole(savedRole);
            const isGoogle = firebaseUser.providerData?.some((p) => p.providerId === "google.com");
            const syncedUser = await syncFirebaseUser(firebaseUser, savedRole, { is_login: true });
            if (mounted && (syncedUser?.email_verified !== false || isGoogle)) {
              setUser(syncedUser);
              persistRole(syncedUser.role || savedRole);
            }
          } else if (mounted) {
            if (!localStorage.getItem(API_TOKEN_KEY) && !localStorage.getItem(WORKER_TOKEN_KEY)) {
              setUser(null);
              persistRole(null);
            }
          }
        } catch (err) {
          console.error("Auth state change error:", err);
          if (mounted && !localStorage.getItem(API_TOKEN_KEY) && !localStorage.getItem(WORKER_TOKEN_KEY)) {
            setUser(null);
          }
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
if (user?.authSource === "worker" || user?.authSource === "admin") {
        const t = localStorage.getItem(API_TOKEN_KEY) || localStorage.getItem(WORKER_TOKEN_KEY);
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
      
      localStorage.setItem(API_TOKEN_KEY, token);
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
      localStorage.removeItem(API_TOKEN_KEY);
      localStorage.removeItem(WORKER_TOKEN_KEY);
      applyAxiosWorkerAuth(null);
      throw new Error(mapApiError(error));
    }
  };

  const registerWorker = async (payload) => {
    try {
      localStorage.removeItem(API_TOKEN_KEY);
      localStorage.removeItem(WORKER_TOKEN_KEY);
      applyAxiosWorkerAuth(null);
      const res = await api.post("/worker-auth/register", payload);
      try {
        await signOut(auth);
      } catch {
        /* ignore */
      }
      setUser(null);
      persistRole(null);
      return res.data;
    } catch (error) {
      localStorage.removeItem(API_TOKEN_KEY);
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

      // Check email verification via our MongoDB backend (Brevo SMTP flow)
      try {
        const verifyCheck = await api.get(`/auth/${userCredential.user.uid}`);
        if (verifyCheck.data && verifyCheck.data.email_verified === false) {
          await signOut(auth);
          localStorage.removeItem("smartgov_target_role");
          localStorage.removeItem(ROLE_STORAGE_KEY);
          throw new Error(
            "EMAIL_NOT_VERIFIED: Your email address has not been verified. " +
            "Please check your inbox for a verification link from SmartGov."
          );
        }
      } catch (checkErr) {
        // If the check itself throws EMAIL_NOT_VERIFIED, re-throw it
        if (checkErr.message?.startsWith("EMAIL_NOT_VERIFIED:")) throw checkErr;
        // If profile not found yet (404) or network error, allow login to proceed
        // (the sync step will create the profile)
        console.warn("Email verify check skipped:", checkErr.message);
      }

      const syncedUser = await syncFirebaseUser(userCredential.user, role, { is_login: true });
      if (syncedUser) {
        setUser(syncedUser);
        persistRole(syncedUser.role || role);
      }
      return userCredential;
    } catch (error) {
      localStorage.removeItem("smartgov_target_role");
      if (role !== "worker") localStorage.removeItem(ROLE_STORAGE_KEY);
      // Pass through already-mapped errors
      if (error.message?.startsWith("EMAIL_NOT_VERIFIED:")) throw error;
      throw new Error(role === "worker" ? mapApiError(error) : mapFirebaseError(error));
    }
  };

  const adminLogin = async (email, password) => {
    try {
      const res = await api.post("/auth/admin-login", { email, password });
      const adminData = res.data;
      
      // Store admin user data
      const adminUser = {
        uid: adminData.firebase_uid,
        email: adminData.email,
        name: adminData.name,
        role: "admin",
        authSource: "admin",
      };
      
      const accessToken = adminData.access_token;
      if (accessToken) {
        localStorage.setItem(API_TOKEN_KEY, accessToken);
        localStorage.removeItem(WORKER_TOKEN_KEY);
        applyAxiosWorkerAuth(accessToken);
      }
      setUser(adminUser);
      persistRole("admin");
      localStorage.setItem("auth_user", JSON.stringify(adminUser));
      
      return adminData;
    } catch (error) {
      throw new Error(mapApiError(error));
    }
  };

  const loginWorkerWithGoogle = async (firebaseUser) => {
    try {
      const res = await api.post("/worker-auth/google-login", {
        firebase_uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || "Worker",
      });
      const token = res.data.access_token;
      if (!token) throw new Error("No token received from worker Google login");

      localStorage.setItem(API_TOKEN_KEY, token);
      localStorage.setItem(WORKER_TOKEN_KEY, token);
      localStorage.setItem(ROLE_STORAGE_KEY, "worker");
      applyAxiosWorkerAuth(token);

      try { await signOut(auth); } catch { /* ignore */ }

      const normalized = normalizeWorkerUser(res.data);
      if (normalized) {
        setUser(normalized);
        persistRole(normalized.role);
      }
      return res.data;
    } catch (error) {
      localStorage.removeItem(API_TOKEN_KEY);
      localStorage.removeItem(WORKER_TOKEN_KEY);
      applyAxiosWorkerAuth(null);
      throw new Error(mapApiError(error));
    }
  };

  const loginWithGoogle = async (role = "public") => {
    if (role === "admin") {
      toast.error("Administrative access requires secure credential authentication. Google Sign-In is restricted for Admin.");
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

      if (role === "worker") {
        // Worker Google login: Firebase auth → backend worker-auth/google-login
        const workerData = await loginWorkerWithGoogle(result.user);
        return workerData;
      }

      const syncedUser = await syncFirebaseUser(result.user, role);
      if (syncedUser) {
        setUser(syncedUser);
        persistRole(syncedUser.role || role);
      }
      return result;
    } catch (error) {
      localStorage.removeItem("smartgov_target_role");
      if (error.message && !error.code) throw error; // already mapped
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
    isRegisteringRef.current = true;
    let firebaseUser;
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      firebaseUser = userCredential.user;
    } catch (error) {
      isRegisteringRef.current = false;
      throw new Error(mapFirebaseError(error));
    }

    // Sync user profile to backend (stores email_verified: false)
    try {
      await api.post("/auth/sync", {
        firebase_uid: firebaseUser.uid,
        email,
        name: displayName,
        role: regRole,
        email_verified: false,
        auth_provider: "password",
        is_registration: true,
        ...locationData,
      });
    } catch (syncErr) {
      console.warn("Backend sync during registration:", syncErr?.message);
    }

    // Send verification email via our Brevo SMTP backend (reliable — not Firebase's mailer)
    try {
      await api.post("/auth/send-verification", {
        firebase_uid: firebaseUser.uid,
        email,
        name: displayName,
      });
    } catch (verifyErr) {
      console.warn("Could not send Brevo verification email:", verifyErr?.message);
    }

    // Sign out immediately — user must verify email before logging in
    try {
      await signOut(auth);
    } catch { /* ignore */ }

    isRegisteringRef.current = false;
    setUser(null);
    localStorage.removeItem("smartgov_target_role");
    localStorage.removeItem(ROLE_STORAGE_KEY);

    // Throw a special sentinel so the calling component can redirect to the pending page
    const err = new Error("VERIFICATION_EMAIL_SENT");
    err.email = email;
    err.role = regRole;
    throw err;
  };

  const logout = async () => {
    localStorage.removeItem("smartgov_target_role");
    localStorage.removeItem(API_TOKEN_KEY);
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
    adminLogin,
    loginWorker,
    loginWorkerWithGoogle,
    registerWorker,
    loginWithGoogle,
    register,
    logout,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
