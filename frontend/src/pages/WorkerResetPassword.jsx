import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "../utils/api";
import { toast } from "react-toastify";
import { Lock, Loader2, ArrowLeft, HardHat } from "lucide-react";
import { Card } from "../components/UI";
import { motion } from "framer-motion";

const WorkerResetPassword = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      toast.error("Invalid reset link. Request a new one from the login page.");
      return;
    }
    if (password.length < 6) {
      toast.warn("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      toast.warn("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await api.post("/worker-auth/reset-password", {
        token,
        new_password: password,
      });
      toast.success("Password updated! You can sign in now.");
      navigate("/login?role=worker", { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="page-shell theme-recovery flex items-center justify-center p-4">
        <Card className="glass-card max-w-md !p-8 text-center">
          <p className="mb-4 text-sm text-slate-400">This reset link is invalid or has expired.</p>
          <Link to="/forgot-password?role=worker" className="text-blue-400 hover:underline text-sm font-bold">
            Request a new reset link
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-shell theme-recovery flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-600 shadow-lg">
            <HardHat size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-slate-100 sm:text-3xl">Set New Password</h1>
          <p className="mt-2 text-sm font-medium text-slate-400">Enter your new worker account password below.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}>
          <Card className="glass-card !p-6 sm:!p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="group">
                <label className="mb-2 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-300">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40" size={18} />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-field pl-12"
                    placeholder="Minimum 6 characters"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="group">
                <label className="mb-2 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-300">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40" size={18} />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field pl-12"
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full py-3.5">
                {loading ? <Loader2 className="mx-auto animate-spin" size={18} /> : "Update Password"}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-700 pt-6 text-center">
              <Link to="/login?role=worker" className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-400 hover:underline">
                <ArrowLeft size={14} /> Back to Worker Sign In
              </Link>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default WorkerResetPassword;
