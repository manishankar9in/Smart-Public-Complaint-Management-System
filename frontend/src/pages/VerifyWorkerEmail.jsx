import { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, XCircle, Loader2, ArrowRight, ShieldCheck, Wrench } from "lucide-react";
import { api, formatApiError } from "../utils/api";

export default function VerifyWorkerEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const token = searchParams.get("token");

  const [status, setStatus] = useState("verifying"); // "verifying" | "success" | "error"
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Invalid verification link. No verification token was provided in the URL.");
      return;
    }

    const verifyToken = async () => {
      try {
        const res = await api.get(`/worker-auth/verify-email?token=${encodeURIComponent(token)}`);
        setStatus("success");
        setMessage(res.data?.message || "Email verified successfully! You can now sign in to your Worker account.");
      } catch (err) {
        setStatus("error");
        setMessage(formatApiError(err) || "Failed to verify email. The link may have expired or already been used.");
      }
    };

    verifyToken();
  }, [token]);

  return (
    <div className="login-shell theme-worker min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950 text-white">
      <div className="login-grid-overlay" aria-hidden />

      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="login-orb login-orb-1 h-80 w-80"
          style={{
            top: "-10%",
            left: "-5%",
            background: status === "error" ? "rgba(239, 68, 68, 0.35)" : "rgba(16, 185, 129, 0.4)",
          }}
        />
        <div
          className="login-orb login-orb-2 h-72 w-72"
          style={{
            bottom: "-10%",
            right: "-5%",
            background: status === "error" ? "rgba(185, 28, 28, 0.3)" : "rgba(5, 150, 105, 0.35)",
          }}
        />
      </div>

      <motion.div
        className="login-card-3d relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/85 p-6 sm:p-8 backdrop-blur-xl shadow-2xl text-center"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <Link
            to="/login?role=worker"
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-white/60 transition-colors hover:text-white"
          >
            ← Back to Login
          </Link>
          <Link to="/" className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1 border border-white/10 hover:bg-white/10 transition-all">
            <img src="/logo-icon.png" alt="Smart Public Complaint" className="h-5 w-5 object-contain" />
            <span className="text-[10px] font-bold text-white tracking-tight">Smart Public Complaint</span>
          </Link>
        </div>
        {status === "verifying" && (
          <div className="py-6 space-y-4">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Loader2 size={36} className="animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-white sm:text-2xl">Verifying Worker Account...</h1>
            <p className="text-xs text-white/60">
              Please wait while we validate your email credentials.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-emerald-600 to-teal-500 shadow-xl shadow-emerald-500/30 text-white"
            >
              <CheckCircle2 size={42} />
            </motion.div>

            <h1 className="text-2xl font-black text-white sm:text-3xl tracking-tight">
              Email Verified!
            </h1>

            <p className="text-sm text-white/70 leading-relaxed">
              {message}
            </p>

            <div className="rounded-2xl bg-emerald-950/40 border border-emerald-500/20 p-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                <ShieldCheck size={16} />
                <span>Account Activated</span>
              </div>
              <p className="text-[11px] text-white/60">
                You can now log in using your worker email and password to receive and resolve public complaints assigned to your duty area.
              </p>
            </div>

            <div className="pt-2">
              <Link
                to="/login?role=worker"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-3.5 text-sm font-bold text-white shadow-lg shadow-emerald-600/30 hover:brightness-110 active:scale-[0.98] transition-all cursor-pointer"
              >
                <span>Proceed to Worker Login</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-rose-600 to-red-500 shadow-xl shadow-rose-500/30 text-white"
            >
              <XCircle size={42} />
            </motion.div>

            <h1 className="text-2xl font-black text-white sm:text-3xl tracking-tight">
              Verification Failed
            </h1>

            <div className="rounded-2xl bg-rose-950/40 border border-rose-500/20 p-4 text-left">
              <p className="text-xs text-rose-200 leading-relaxed">
                {message}
              </p>
            </div>

            <div className="pt-2 space-y-2.5">
              <Link
                to="/login?role=worker"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 border border-white/10 px-5 py-3 text-sm font-bold text-white hover:bg-slate-700 transition-all cursor-pointer"
              >
                <ArrowRight size={16} />
                <span>Go to Worker Login</span>
              </Link>

              <Link
                to="/register?role=worker"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                <Wrench size={13} />
                <span>Need to Register as Worker?</span>
              </Link>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
