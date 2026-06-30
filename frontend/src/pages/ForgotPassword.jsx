import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { toast } from "react-toastify";
import { Mail, Loader2, ArrowLeft, Shield, HardHat } from "lucide-react";
import { Card } from "../components/UI";
import { motion } from "framer-motion";
import { sendWorkerResetEmail } from "../services/emailService";

const ForgotPassword = () => {
  const [searchParams] = useSearchParams();
  const role = searchParams.get("role") === "worker" ? "worker" : "public";
  const isWorker = role === "worker";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devResetLink, setDevResetLink] = useState("");
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setDevResetLink("");
    const normalizedEmail = email.trim();
    try {
      if (isWorker) {
        const response = await api.post("/worker-auth/forgot-password", { email: normalizedEmail });
        const resetLink = response.data?.reset_link;
        if (resetLink) {
          try {
            await sendWorkerResetEmail(normalizedEmail, resetLink);
          } catch (emailErr) {
            console.error("EmailJS fallback sending failed: ", emailErr);
            setDevResetLink(resetLink);
          }
        }
      } else {
        await resetPassword(normalizedEmail);
      }
      setSent(true);
      toast.success("Password reset link sent. Check your inbox and spam folder.");
    } catch (error) {
      toast.error(error.response?.data?.detail || error.message || "Failed to send reset link.");
    } finally {
      setLoading(false);
    }
  };

  const loginLink = isWorker ? "/login?role=worker" : "/login";

  return (
    <div className="page-shell theme-recovery flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
          <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-3xl border border-slate-700 text-3xl font-black text-white shadow-xl ${isWorker ? "bg-amber-600" : "bg-primary"}`}>
            {isWorker ? <HardHat size={32} /> : "S"}
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-100 sm:text-3xl">Reset Password</h1>
          <p className="mt-2 text-sm font-medium text-slate-400">
            {isWorker
              ? "Enter your registered worker email to receive a reset link."
              : "Enter your registered email to receive a reset link."}
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Card className="glass-card !p-6 sm:!p-8">
            {sent ? (
              <div className="space-y-4 text-center">
                <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-5">
                  <p className="text-sm font-bold text-green-200">
                    Check your email at <span className="text-white">{email}</span> for the reset link.
                  </p>
                  <p className="mt-2 text-[10px] uppercase tracking-widest text-green-300/70">
                    {isWorker ? "Link expires in 1 hour." : "Follow the link in the email to set a new password."}
                  </p>
                </div>

                {devResetLink && (
                  <div className="mt-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-left">
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-wider mb-2">Dev Environment Link</p>
                    <a href={devResetLink} className="text-xs text-blue-400 hover:underline break-all block font-medium">
                      {devResetLink}
                    </a>
                  </div>
                )}

                <Link to={loginLink} className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:underline">
                  <ArrowLeft size={14} /> Back to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="flex gap-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5">
                  <Shield className="shrink-0 text-warning" size={24} />
                  <p className="text-[10px] font-bold uppercase leading-relaxed tracking-widest text-amber-200">
                    {isWorker
                      ? "Worker accounts use email-based reset. The link will be sent to your registered Gmail."
                      : "Public accounts use Firebase email reset. Check spam if you don't see the email."}
                  </p>
                </div>

                <div className="group">
                  <label className="mb-2 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-300">
                    Registered Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 transition-colors group-focus-within:text-primary" size={18} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field pl-12"
                      placeholder="name@gmail.com"
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading} className="btn-primary w-full py-3.5">
                  {loading ? <Loader2 className="mx-auto animate-spin" size={18} /> : "Send Reset Link"}
                </button>
              </form>
            )}

            {!sent && (
              <div className="mt-8 border-t border-slate-700 pt-8 text-center">
                <p className="text-[10px] font-bold uppercase leading-loose tracking-widest text-slate-400">
                  Remembered your password? <br />
                  <Link to={loginLink} className="mt-2 inline-flex items-center justify-center gap-2 text-blue-400 hover:text-blue-300 hover:underline">
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
