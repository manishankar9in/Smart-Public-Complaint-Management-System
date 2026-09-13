import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { toast } from "react-toastify";
import { Mail, Loader2, ArrowLeft, ShieldCheck, AlertTriangle } from "lucide-react";
import { Card } from "../components/UI";
import { motion } from "framer-motion";

const ForgotPassword = () => {
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") === "worker" ? "worker" : "public";
  const isWorker = role === "worker";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldError("");
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setFieldError("Please enter your registered email address.");
      return;
    }

    setLoading(true);
    try {
      // Step 1: Backend verifies the email belongs to the correct role.
      // Citizen emails cannot reset via Worker portal and vice versa.
      await api.post("/auth/verify-reset-email", {
        email: normalizedEmail,
        role,
      });

      // Step 2: Firebase sends the actual password-reset email link.
      await resetPassword(normalizedEmail);

      setSent(true);
      toast.success("Password reset link sent! Check your inbox and spam folder.");
    } catch (error) {
      const detail =
        error.response?.data?.detail ||
        error.message ||
        "Failed to send reset link.";
      setFieldError(detail);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const loginLink = isWorker ? "/login?role=worker" : "/login";
  const portalLabel = isWorker ? "Field Worker" : "Citizen";
  const portalHint = isWorker
    ? "Enter your registered Worker email address. Only Worker accounts can reset their password here."
    : "Enter your registered Citizen email address. Only Citizen accounts can reset their password here.";

  return (
    <div className="page-shell theme-recovery flex items-center justify-center p-4 sm:p-6 min-h-screen">
      <div className="w-full max-w-md">
        <div className="mb-4 flex items-center justify-between">
          <Link
            to={loginLink}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-white/60 transition-colors hover:text-white"
          >
            ← Back to Login
          </Link>
          <Link
            to="/"
            className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1 border border-white/10 hover:bg-white/10 transition-all"
          >
            <img src="/logo-icon.png" alt="Smart Public Complaint" className="h-5 w-5 object-contain" />
            <span className="text-[10px] font-bold text-white tracking-tight">Smart Public Complaint</span>
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 text-center"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-700/60 bg-white/10 p-2 text-3xl font-black text-white shadow-xl backdrop-blur-md">
            <img src="/logo-icon.png" alt="Logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-100 sm:text-3xl">Reset Password</h1>
          <p className="mt-2 text-sm font-medium text-slate-400">
            {portalLabel} Portal — Secure password reset via email link.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="glass-card !p-6 sm:!p-8">
            {sent ? (
              <div className="space-y-4 text-center">
                <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-5">
                  <div className="flex justify-center mb-2">
                    <ShieldCheck className="text-green-400" size={32} />
                  </div>
                  <p className="text-sm font-bold text-green-200">
                    Check your email at <span className="text-white">{email}</span> for the reset link.
                  </p>
                  <p className="mt-2 text-[10px] uppercase tracking-widest text-green-300/70">
                    Click the link in the email to set a new password. Check spam if not found.
                  </p>
                </div>
                <Link
                  to={loginLink}
                  className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-400 hover:underline pt-2"
                >
                  <ArrowLeft size={14} /> Back to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Role hint banner */}
                <div
                  className={`flex items-center gap-3 rounded-2xl border p-4 ${
                    isWorker
                      ? "border-amber-500/20 bg-amber-500/10"
                      : "border-blue-500/20 bg-blue-500/10"
                  }`}
                >
                  <ShieldCheck
                    className={`shrink-0 ${isWorker ? "text-amber-400" : "text-blue-400"}`}
                    size={22}
                  />
                  <p className="text-[11px] font-medium leading-relaxed text-slate-200">
                    {portalHint}
                  </p>
                </div>

                <div className="group">
                  <label className="mb-2 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-300">
                    Registered {portalLabel} Email Address
                  </label>
                  <div className="relative">
                    <Mail
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 transition-colors group-focus-within:text-primary"
                      size={18}
                    />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setFieldError("");
                      }}
                      className={`input-field pl-12 ${
                        fieldError ? "border-red-500/60 focus:border-red-500" : ""
                      }`}
                      placeholder="name@example.com"
                    />
                  </div>

                  {/* Inline role-mismatch / not-found error */}
                  {fieldError && (
                    <div className="mt-2 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2">
                      <AlertTriangle className="mt-0.5 shrink-0 text-red-400" size={14} />
                      <p className="text-[11px] font-medium leading-snug text-red-300">{fieldError}</p>
                    </div>
                  )}
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3.5">
                  {loading ? (
                    <Loader2 className="mx-auto animate-spin" size={18} />
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            )}

            {!sent && (
              <div className="mt-8 border-t border-slate-700 pt-6 text-center">
                <p className="text-[10px] font-bold uppercase leading-loose tracking-widest text-slate-400">
                  Remembered your password? <br />
                  <Link
                    to={loginLink}
                    className="mt-2 inline-flex items-center justify-center gap-2 text-blue-400 hover:text-blue-300 hover:underline"
                  >
                    <ArrowLeft size={14} /> Back to Sign In
                  </Link>
                </p>
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default ForgotPassword;
