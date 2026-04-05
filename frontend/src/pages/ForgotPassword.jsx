import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "react-toastify";
import { Mail, Loader2, ArrowLeft, Shield } from "lucide-react";
import { Card } from "../components/UI";
import { motion } from "framer-motion";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { resetPassword } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await resetPassword(email);
      toast.success("Identity recovery link sent. Check your inbox.");
    } catch (error) {
      toast.error(error.message || "Failed to send reset link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_left,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-white">
      <div className="w-full max-w-md">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="text-center mb-8"
        >
          <div className="w-16 h-16 bg-secondary rounded-3xl flex items-center justify-center text-white font-black text-3xl shadow-xl shadow-slate-200 mx-auto mb-6">S</div>
          <h1 className="text-3xl font-black text-secondary tracking-tight">Identity Recovery</h1>
          <p className="text-sm text-muted font-medium mt-2">Recover your municipal governance access key</p>
        </motion.div>

        <motion.div
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ delay: 0.1 }}
        >
          <Card className="!p-8 glass-card border-slate-100">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100 flex gap-4">
                 <Shield className="text-warning shrink-0" size={24} />
                 <p className="text-[10px] text-amber-800 font-bold uppercase tracking-widest leading-relaxed italic">
                   Note: For high-security verified worker accounts, recovery requires secondary biometric local auth if the primary key is lost.
                 </p>
              </div>

              <div className="group">
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Registered Email</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 group-focus-within:text-primary transition-colors" size={18} />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input-field pl-12"
                    placeholder="name@government.in"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary flex items-center justify-center gap-3 py-5"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    Send Recovery Protocol
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-100 text-center">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest leading-loose">
                Remembered your key? <br/>
                <Link to="/login" className="text-primary hover:underline flex items-center justify-center gap-2 mt-2">
                   <ArrowLeft size={14} /> Back to Login
                </Link>
              </p>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default ForgotPassword;
