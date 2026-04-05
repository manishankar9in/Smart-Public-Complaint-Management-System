import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "react-toastify";
import { Globe, Mail, Lock, Loader2, ArrowRight } from "lucide-react";
import { Card } from "../components/UI";
import { motion } from "framer-motion";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Detect role from URL query
  const queryParams = new URLSearchParams(location.search);
  const targetRole = queryParams.get("role") || "public";

  const getTargetDashboard = (role) => {
    if (role === "admin") return "/admin-dashboard";
    if (role === "worker") return "/worker-dashboard";
    return "/user-dashboard";
  };

  // Handle post-redirect or direct-session auto-routing
  useEffect(() => {
    if (user) {
      // If backend sync hasn't attached `role` yet, use the role from the URL.
      const roleToUse = user.role || targetRole;
      navigate(getTargetDashboard(roleToUse), { replace: true });
    }
  }, [user, navigate, targetRole]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password, targetRole);
      toast.success(`Access Granted: ${targetRole.toUpperCase()} Dashboard`);
      navigate(getTargetDashboard(targetRole));
    } catch (error) {
      toast.error(error.message || "Credential Check Failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await loginWithGoogle(targetRole);
    } catch (error) {
      toast.error("Google Auth Denied");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-blue-50 via-slate-50 to-white">
      <div className="w-full max-w-md">
        <motion.div
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           className="text-center mb-8"
        >
          <div className="mb-6">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted hover:text-primary transition-colors"
            >
              Back to Home
            </Link>
          </div>
          <div className="w-16 h-16 bg-primary rounded-3xl flex items-center justify-center text-white font-black text-3xl shadow-xl shadow-blue-200 mx-auto mb-6">S</div>
          <h1 className="text-3xl font-black text-secondary tracking-tight uppercase">Terminal Access</h1>
          <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mt-2">Authority Level: {targetRole}</p>
        </motion.div>

        <motion.div
           initial={{ opacity: 0, scale: 0.95 }}
           animate={{ opacity: 1, scale: 1 }}
           transition={{ delay: 0.1 }}
        >
          <Card className="!p-10 glass-card border-slate-100 shadow-premium">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-5">
                <div className="group">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Work Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 group-focus-within:text-primary transition-colors" size={18} />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="input-field pl-12 h-14"
                      placeholder="name@authority.in"
                    />
                  </div>
                </div>

                <div className="group">
                  <div className="flex justify-between items-center mb-3 ml-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted">Passphrase</label>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 group-focus-within:text-primary transition-colors" size={18} />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-field pl-12 h-14"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-primary flex items-center justify-center gap-3 py-6 shadow-xl"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    Initialize Dashboard <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            {targetRole !== "admin" && targetRole !== "worker" && (
              <>
                <div className="my-8 flex items-center gap-4">
                  <div className="h-px bg-slate-100 flex-1"></div>
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">or Authenticate With</span>
                  <div className="h-px bg-slate-100 flex-1"></div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full py-5 rounded-[24px] border-2 border-slate-100 flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-50 transition-all hover:border-slate-200"
                >
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-soft border border-slate-100">
                      <Globe size={20} className="text-blue-500" />
                  </div>
                  Google Identity Sync
                </button>
              </>
            )}

            {targetRole === "worker" && (
              <p className="mt-6 text-center text-[10px] text-muted font-medium">
                Field workers use email and password registered in MongoDB (no Firebase / Google).
              </p>
            )}

            <div className="mt-10 pt-8 border-t border-slate-100 text-center">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest leading-loose">
                Don't have an identity yet? <br/>
                <Link to={`/register?role=${targetRole}`} className="text-primary hover:underline">Request Account Access</Link>
              </p>
            </div>
          </Card>
        </motion.div>
        
        <div className="mt-8 text-center">
           <div className="bg-white/50 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-100">
              <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-[10px] font-black uppercase tracking-widest text-muted/60">System Online (Mainnet)</span>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
