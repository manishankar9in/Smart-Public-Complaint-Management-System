import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "react-toastify";
import { Mail, Lock, Loader2, ArrowRight, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { LOGIN_ROLE_CONFIG } from "../data/roleThemes";
import { api } from "../utils/api";

const VALID_ROLES = ["public", "worker"];

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const [unverifiedState, setUnverifiedState] = useState(null); // { email, role }
  const [resendingVerification, setResendingVerification] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isVerifiedBanner, setIsVerifiedBanner] = useState(false);

  const { user, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const urlRole = searchParams.get("role");
  const urlEmail = searchParams.get("email");
  const isVerified = searchParams.get("verified") === "1";

  const defaultRole = location.pathname.includes("/worker") ? "worker" : "public";
  const targetRole = VALID_ROLES.includes(urlRole) ? urlRole : defaultRole;
  const config = LOGIN_ROLE_CONFIG[targetRole];
  const theme = LOGIN_ROLE_CONFIG[targetRole];

  const getTargetDashboard = (role) => {
    if (role === "admin") return "/admin/dashboard";
    if (role === "worker") return "/worker/dashboard";
    return "/user-dashboard";
  };

  useEffect(() => {
    localStorage.setItem("role", targetRole);
    if (urlEmail && !email) {
      setEmail(urlEmail);
    }
    if (isVerified) {
      setIsVerifiedBanner(true);
      toast.success("Email verified successfully! Please sign in with your credentials.");
    }
  }, [targetRole, location.search]);

  useEffect(() => {
    if (user) {
      const roleToUse = user.role || targetRole;
      if (roleToUse === targetRole) {
        navigate(getTargetDashboard(roleToUse), { replace: true });
      }
    }
  }, [user, targetRole, navigate]);

  const switchRole = (role) => {
    setUnverifiedState(null);
    navigate(`/login?role=${role}`, { replace: true });
  };

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    setMouse({ x, y });
  };

  const handleResendVerification = async () => {
    if (!unverifiedState?.email || resendCooldown > 0) return;
    setResendingVerification(true);
    try {
      if (unverifiedState.role === "worker") {
        const res = await api.post("/worker-auth/resend-verification", { email: unverifiedState.email });
        toast.success(res.data?.message || "Verification link re-sent to your email!");
      } else {
        const res = await api.post("/auth/resend-citizen-verification", { email: unverifiedState.email });
        toast.success(res.data?.message || "Verification email re-sent! Please check your inbox.");
      }
      setResendCooldown(60);
      const interval = setInterval(() => {
        setResendCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      toast.error(err.response?.data?.detail || err.message || "Failed to resend verification link.");
    } finally {
      setResendingVerification(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setUnverifiedState(null);
    try {
      localStorage.setItem("role", targetRole);
      await login(email.trim(), password, targetRole);
      toast.success(`Welcome to ${config.label} dashboard.`);
      navigate(getTargetDashboard(targetRole), { replace: true });
    } catch (error) {
      const errorMsg = error.message || "Sign in failed.";
      if (errorMsg.includes("EMAIL_NOT_VERIFIED")) {
        setUnverifiedState({
          email: error.unverifiedEmail || email.trim(),
          role: targetRole,
        });
        toast.warn("Please verify your email before logging in. Check your inbox for the activation link.", {
          autoClose: 6000,
        });
      } else {
        toast.error(errorMsg);
      }

      // If worker account error, show helpful message
      if (errorMsg.includes("Worker") && errorMsg.includes("Worker Login")) {
        toast.info("Please click the Worker tab above to login as a worker.", { autoClose: 5000 });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (targetRole === "admin") return;
    setLoading(true);
    setUnverifiedState(null);
    try {
      localStorage.setItem("role", targetRole);
      const result = await loginWithGoogle(targetRole);
      if (result) {
        if (targetRole === "worker") {
          toast.success("Signed in as Field Worker with Google.");
          navigate("/worker/dashboard", { replace: true });
        } else {
          toast.success("Signed in with Google.");
          navigate("/user-dashboard", { replace: true });
        }
      }
    } catch (error) {
      const msg = error?.message || "Google sign-in failed.";

      // New Google user — redirect to email verification pending page
      if (msg.includes("EMAIL_NOT_VERIFIED")) {
        const unverifiedEmail = error?.unverifiedEmail || "";
        toast.info(
          "A verification email has been sent to your Google address. Please verify to continue.",
          { autoClose: 7000 }
        );
        navigate(
          `/email-verification-pending?email=${encodeURIComponent(unverifiedEmail)}&role=${targetRole}`,
          {
            replace: true,
            state: { email: unverifiedEmail, role: targetRole, isGoogleUser: true },
          }
        );
        return;
      }

      toast.error(msg);
      if (msg.toLowerCase().includes("no field worker profile") || msg.toLowerCase().includes("register")) {
        toast.info("Register as a Worker first using the 'Register as Worker' link below.", { autoClose: 6000 });
      }
    } finally {
      setLoading(false);
    }
  };

  const PortalIcon = config.icon;
  const tabIndex = VALID_ROLES.indexOf(targetRole);

  return (
    <div
      className={`login-shell ${theme.shellClass}`}
      onMouseMove={handleMouseMove}
      aria-label={`${config.label} sign in`}
    >
      <div className="login-grid-overlay" aria-hidden />

      {/* Animated background orbs — color changes per portal */}
      <AnimatePresence mode="wait">
        <motion.div
          key={targetRole}
          className="pointer-events-none absolute inset-0 overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          aria-hidden
        >
          <div
            className="login-orb login-orb-1 h-72 w-72 sm:h-96 sm:w-96"
            style={{ top: "-8%", left: "-5%", background: theme.orbA, opacity: 0.5 }}
          />
          <div
            className="login-orb login-orb-2 h-64 w-64 sm:h-80 sm:w-80"
            style={{ bottom: "-10%", right: "-5%", background: theme.orbB, opacity: 0.45 }}
          />
          <div
            className="login-orb login-orb-3 h-48 w-48 sm:h-56 sm:w-56"
            style={{ top: "40%", right: "15%", background: theme.orbC, opacity: 0.35 }}
          />
        </motion.div>
      </AnimatePresence>

      <motion.div
        className="login-card-3d"
        style={{
          rotateX: mouse.y * -6,
          rotateY: mouse.x * 6,
        }}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
      >
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-5 text-center">
          <div className="mb-4 flex items-center justify-between">
            <Link
              to="/"
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-white/60 transition-colors hover:text-white sm:text-sm"
            >
              ← Back to Home
            </Link>
            <Link to="/" className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1 border border-white/10 hover:bg-white/10 transition-all">
              <img src="/logo-icon.png" alt="Smart Public Complaint" className="h-5 w-5 object-contain" />
              <span className="text-[10px] font-bold text-white tracking-tight">Smart Public Complaint</span>
            </Link>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={targetRole}
              initial={{ opacity: 0, scale: 0.85, rotateX: -12 }}
              animate={{ opacity: 1, scale: 1, rotateX: 0 }}
              exit={{ opacity: 0, scale: 0.9, rotateX: 12 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            >
              <div className={`login-portal-icon ${theme.iconBg} shadow-lg relative`} style={{ boxShadow: `0 12px 40px ${theme.glow}` }}>
                <PortalIcon size={28} className="text-white" aria-hidden />
              </div>
              <h1 className="text-xl font-black tracking-tight text-white sm:text-2xl">{config.title}</h1>
              <p className="mt-1.5 text-xs text-white/65 sm:text-sm">{config.subtitle}</p>
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {/* Portal tabs with sliding color indicator */}
        {targetRole !== "admin" && (
          <div className="login-tab-bar cols-2" role="tablist" aria-label="Login portal">
            <motion.div
              className={`login-tab-indicator login-tab-indicator-${targetRole}`}
              layout
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              style={{
                left: targetRole === "public" ? "2px" : "calc(50% + 2px)",
                width: "calc(50% - 4px)",
              }}
              aria-hidden
            />
            {["public", "worker"].map((role) => {
              const rc = LOGIN_ROLE_CONFIG[role];
              const RIcon = rc.icon;
              const active = targetRole === role;
              return (
                <button
                  key={role}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => switchRole(role)}
                  className={`login-tab-btn ${active ? `login-tab-active ${rc.tabActive}` : ""}`}
                >
                  <RIcon size={17} aria-hidden />
                  <span className="text-[9px] font-bold uppercase tracking-wide sm:text-[10px]">{rc.tabLabel}</span>
                </button>
              );
            })}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={targetRole}
            initial={{ opacity: 0, y: 14, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            exit={{ opacity: 0, y: -10, rotateX: -6 }}
            transition={{ duration: 0.32 }}
            style={{ transformStyle: "preserve-3d" }}
          >
            <div className="login-glass-panel">
              {/* Verified Success Banner */}
              {isVerifiedBanner && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-3.5 text-emerald-200"
                >
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={18} />
                    <div className="flex-1 text-xs">
                      <p className="font-bold text-emerald-300">Email Verified Successfully!</p>
                      <p className="mt-0.5 text-white/80">
                        Your account is active. Enter your password below to sign in.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Unverified Account Alert Box */}
              {unverifiedState && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  className="mb-4 rounded-2xl border border-amber-500/40 bg-amber-950/50 p-3.5 text-amber-200 shadow-lg"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} />
                    <div className="flex-1 text-xs">
                      <p className="font-bold text-amber-300">Email Verification Required</p>
                      <p className="mt-1 text-white/80 leading-relaxed">
                        A verification link was sent to <strong className="text-amber-200 font-mono break-all">{unverifiedState.email}</strong>. Please check your inbox and verify before signing in.
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleResendVerification}
                          disabled={resendingVerification || resendCooldown > 0}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-md transition-all disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw size={13} className={resendingVerification ? "animate-spin" : ""} />
                          <span>
                            {resendCooldown > 0
                              ? `Resend in ${resendCooldown}s`
                              : "Resend Verification Link"}
                          </span>
                        </button>
                        <Link
                          to={`/email-verification-pending?email=${encodeURIComponent(unverifiedState.email)}&role=${unverifiedState.role}`}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-300 hover:text-amber-100 underline"
                        >
                          Verification instructions →
                        </Link>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5">
                <div>
                  <label htmlFor="email" className="mb-1.5 ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} aria-hidden />
                    <input
                      id="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="login-input min-h-[42px]"
                      placeholder="Enter your email"
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="password" className="ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
                      Password
                    </label>
                    {config.showForgot && (
                      <Link
                        to={config.forgotLink || "/forgot-password"}
                        className={`cursor-pointer text-[10px] font-bold hover:underline sm:text-xs ${theme.linkClass}`}
                      >
                        Forgot?
                      </Link>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} aria-hidden />
                    <input
                      id="password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="login-input min-h-[42px]"
                      placeholder="Enter your password"
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading} className={`inline-flex items-center justify-center gap-2 ${theme.btnClass}`}>
                  {loading ? <Loader2 className="animate-spin" size={16} /> : <>Sign In <ArrowRight size={16} /></>}
                </button>
              </form>

              {config.showGoogle && (
                <>
                  <div className="my-4 flex items-center gap-2">
                    <div className="h-px flex-1 bg-white/10" />
                    <span className="text-[10px] font-bold uppercase text-white/40">or</span>
                    <div className="h-px flex-1 bg-white/10" />
                  </div>
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl border border-white/15 bg-white/95 px-3 py-2.5 text-sm font-semibold text-slate-800 shadow-md transition-all duration-300 hover:-translate-y-0.5 hover:bg-white hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    {targetRole === "worker" ? "Sign in as Worker with Google" : "Sign in with Google"}
                  </button>
                  {targetRole === "worker" && (
                    <p className="mt-2 text-center text-[10px] text-white/45 leading-tight">
                      Your Google email must match your pre-registered worker account.
                    </p>
                  )}
                </>
              )}

              {config.showRegister && (
                <p className="mt-4 border-t border-white/10 pt-4 text-center text-xs text-white/55">
                  New here?{" "}
                  <Link to={`/register?role=${targetRole}`} className={`cursor-pointer font-bold hover:underline ${theme.linkClass}`}>
                    {config.registerLink}
                  </Link>
                </p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default Login;
