import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MailCheck, RefreshCw, ArrowLeft, CheckCircle, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "react-toastify";
import { api } from "../utils/api";

export default function EmailVerificationPending() {
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);

  const email = searchParams.get("email") || location.state?.email || "your registered email";
  const role = searchParams.get("role") || location.state?.role || "public";
  const isWorker = role === "worker";
  const isGoogleUser = location.state?.isGoogleUser || false;

  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResending(true);
    try {
      if (isWorker) {
        const res = await api.post("/worker-auth/resend-verification", { email });
        toast.success(res.data?.message || "Verification link re-sent to your email!");
      } else {
        const res = await api.post("/auth/resend-citizen-verification", { email });
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
      toast.error(err.response?.data?.detail || err.message || "Failed to resend verification email.");
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="login-shell theme-public min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950 text-white">
      <div className="login-grid-overlay" aria-hidden />

      {/* Decorative Orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div
          className="login-orb login-orb-1 h-72 w-72"
          style={{
            top: "-10%",
            left: "-5%",
            background: isWorker ? "rgba(16, 185, 129, 0.4)" : "rgba(37, 99, 235, 0.4)",
          }}
        />
        <div
          className="login-orb login-orb-2 h-64 w-64"
          style={{
            bottom: "-10%",
            right: "-5%",
            background: isWorker ? "rgba(5, 150, 105, 0.35)" : "rgba(99, 102, 241, 0.35)",
          }}
        />
      </div>

      <motion.div
        className="login-card-3d relative z-10 w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-6 sm:p-8 backdrop-blur-xl shadow-2xl text-center"
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <Link
            to={isWorker ? "/login?role=worker" : "/login?role=public"}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-white/60 transition-colors hover:text-white"
          >
            ← Back to Login
          </Link>
          <Link to="/" className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1 border border-white/10 hover:bg-white/10 transition-all">
            <img src="/logo-icon.png" alt="Smart Public Complaint" className="h-5 w-5 object-contain" />
            <span className="text-[10px] font-bold text-white tracking-tight">Smart Public Complaint</span>
          </Link>
        </div>

        {/* Animated Icon Badge */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-500 shadow-xl shadow-blue-500/25">
          <MailCheck size={40} className="text-white animate-pulse" />
        </div>

        <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">
          Check Your Email
        </h1>

        {isGoogleUser ? (
          <p className="mt-3 text-sm text-white/70 leading-relaxed">
            You signed in with <span className="font-bold text-blue-300">Google</span>. We&apos;ve sent
            a one-time verification link to your Google email:
          </p>
        ) : (
          <p className="mt-3 text-sm text-white/70 leading-relaxed">
            We&apos;ve sent a secure verification link to:
          </p>
        )}

        <div className="mt-2 inline-block rounded-xl bg-white/10 px-4 py-2 font-mono text-sm font-bold text-blue-300 border border-white/10 break-all">
          {email}
        </div>

        <div className="mt-6 rounded-2xl bg-white/5 border border-white/10 p-4 text-left space-y-2.5">
          <div className="flex items-start gap-2.5 text-xs text-white/80">
            <CheckCircle size={16} className="text-emerald-400 mt-0.5 shrink-0" />
            <span>Click the verification link in your inbox to activate your account.</span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-white/80">
            <ShieldCheck size={16} className="text-blue-400 mt-0.5 shrink-0" />
            <span>
              {isWorker
                ? "Once verified, sign in with your worker email and password."
                : isGoogleUser
                  ? "Once verified, click 'Sign in with Google' again to access your account."
                  : "Once verified, sign in to submit complaints and track resolutions."}
            </span>
          </div>
          <div className="flex items-start gap-2.5 text-xs text-white/50">
            <span className="font-bold text-amber-300 shrink-0">Tip:</span>
            <span>If you don&apos;t see the email, please check your Spam or Junk folder.</span>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <Link
            to={`/login?role=${role}`}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-600/30 transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <span>Proceed to Login</span>
            <ExternalLink size={16} />
          </Link>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending || resendCooldown > 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-4 py-2.5 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={resending ? "animate-spin" : ""} />
            <span>
              {resendCooldown > 0
                ? `Resend available in ${resendCooldown}s`
                : "Didn't receive email? Resend"}
            </span>
          </button>
        </div>

        <div className="mt-6 border-t border-white/10 pt-4">
          {isGoogleUser ? (
            <Link
              to={`/login?role=${role}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Back to Login</span>
            </Link>
          ) : (
            <Link
              to={`/register?role=${role}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/60 hover:text-white transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Back to Registration</span>
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  );
}
