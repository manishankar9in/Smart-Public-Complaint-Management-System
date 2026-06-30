import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "react-toastify";
import { Mail, Lock, Loader2, ArrowRight, MapPin, Phone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { WORKER_DUTY_POSITIONS } from "../data/dutyPositions";
import { api, formatApiError } from "../utils/api";
import { PORTAL_THEMES } from "../data/roleThemes";
import { INDIAN_STATES_WITH_DISTRICTS, getDistrictsForState, getAllStates } from "../data/indianStatesDistricts";

const ROLE_CONFIG = {
  public: {
    ...PORTAL_THEMES.public,
    title: "Public User Registration",
    subtitle: "Email, phone, password & address",
  },
  worker: {
    ...PORTAL_THEMES.worker,
    title: "Worker Registration",
    subtitle: "Email, phone, password, area & category",
  },
};

const Register = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const urlRole = new URLSearchParams(location.search).get("role");
  const targetRole = urlRole === "worker" ? "worker" : "public";
  const config = ROLE_CONFIG[targetRole];
  const isWorker = targetRole === "worker";

  const [formData, setFormData] = useState({
    email: "",
    phone: "",
    password: "",
    address: "",
    state: "",
    city: "",
    duty_position: WORKER_DUTY_POSITIONS[0],
  });
  const [customRole, setCustomRole] = useState("");
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();

  useEffect(() => {
    if (urlRole === "admin") {
      toast.info("Admin accounts cannot be self-registered.");
      navigate("/login?role=admin", { replace: true });
    }
  }, [urlRole, navigate]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password.length < 6) {
      return toast.error("Password must be at least 6 characters.");
    }

    const finalDutyPosition = formData.duty_position === "Other" ? customRole.trim() : formData.duty_position;
    if (isWorker && formData.duty_position === "Other" && !customRole.trim()) {
      return toast.error("Please specify your custom category/role.");
    }
    if (isWorker && (!formData.state || !formData.city || !formData.address.trim())) {
      return toast.error("State, District, and Area/Location are required for workers.");
    }

    setLoading(true);
    try {
      if (isWorker) {
        const name = formData.email.split("@")[0] || "Worker";
        await api.post("/worker-auth/register", {
          email: formData.email,
          password: formData.password,
          name,
          phone: formData.phone,
          duty_position: finalDutyPosition,
          state: formData.state,
          city: formData.city,
          ward: formData.address.trim(),
        });
        toast.success("Worker registered! Sign in with your email and password.");
        navigate("/login?role=worker", { replace: true });
      } else {
        const name = formData.email.split("@")[0] || "Citizen";
        await register(formData.email, formData.password, name, "public", {
          phone: formData.phone,
          address: formData.address,
        });
        toast.success("Account created! Welcome to the platform.");
        navigate("/user-dashboard");
      }
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setLoading(false);
    }
  };

  const PortalIcon = config.icon;

  const fields = isWorker
    ? [
        { id: "email", label: "Email Address *", type: "email", icon: Mail, name: "email", placeholder: "you@email.com" },
        { id: "phone", label: "Phone Number *", type: "tel", icon: Phone, name: "phone", placeholder: "9876543210" },
        { id: "password", label: "Password *", type: "password", icon: Lock, name: "password", placeholder: "Min. 6 characters" },
        { id: "address", label: "Area / Location *", type: "text", icon: MapPin, name: "address", placeholder: "Ward, city or work area" },
      ]
    : [
        { id: "email", label: "Email Address *", type: "email", icon: Mail, name: "email", placeholder: "you@email.com" },
        { id: "phone", label: "Phone Number *", type: "tel", icon: Phone, name: "phone", placeholder: "9876543210" },
        { id: "password", label: "Password *", type: "password", icon: Lock, name: "password", placeholder: "Min. 6 characters" },
        { id: "address", label: "Address *", type: "text", icon: MapPin, name: "address", placeholder: "House no, street, city" },
      ];

  return (
    <div className={`login-shell ${config.shellClass}`}>
      <div className="login-grid-overlay" aria-hidden />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="login-orb login-orb-1 h-72 w-72" style={{ top: "-8%", left: "-5%", background: config.orbA, opacity: 0.5 }} />
        <div className="login-orb login-orb-2 h-64 w-64" style={{ bottom: "-10%", right: "-5%", background: config.orbB, opacity: 0.45 }} />
      </div>

      <motion.div className="login-card-3d" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-5 text-center">
          <Link
            to={`/login?role=${targetRole}`}
            className="mb-4 inline-flex cursor-pointer text-xs font-semibold text-white/60 transition-colors hover:text-white sm:text-sm"
          >
            ← Back to {isWorker ? "Worker" : "User"} Login
          </Link>
          <AnimatePresence mode="wait">
            <motion.div
              key={targetRole}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <div className={`login-portal-icon ${config.iconBg}`} style={{ boxShadow: `0 12px 40px ${config.glow}` }}>
                <PortalIcon size={28} className="text-white" aria-hidden />
              </div>
              <h1 className="text-xl font-black text-white sm:text-2xl">{config.title}</h1>
              <p className="mt-1.5 text-xs text-white/65 sm:text-sm">{config.subtitle}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="login-tab-bar cols-2 mb-4">
          {["public", "worker"].map((role, idx) => {
            const rc = ROLE_CONFIG[role];
            const RIcon = rc.icon;
            const active = targetRole === role;
            return (
              <Link
                key={role}
                to={`/register?role=${role}`}
                className={`login-tab-btn col-span-1 ${active ? `login-tab-active ${rc.tabActive}` : ""}`}
                style={{ gridColumn: idx + 1 }}
              >
                <RIcon size={17} aria-hidden />
                <span className="text-[9px] font-bold uppercase sm:text-[10px]">{rc.tabLabel}</span>
              </Link>
            );
          })}
          <motion.div
            className={`login-tab-indicator login-tab-indicator-${targetRole}`}
            layout
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            style={{
              left: targetRole === "public" ? "4px" : "calc(50% + 2px)",
              width: "calc(50% - 8px)",
            }}
            aria-hidden
          />
        </div>

        <div className="login-glass-panel">
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {fields.filter(f => f.name !== "address").map((f) => (
              <div key={f.id}>
                <label htmlFor={f.id} className="mb-1.5 ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
                  {f.label}
                </label>
                <div className="relative">
                  <f.icon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} aria-hidden />
                  <input
                    id={f.id}
                    name={f.name}
                    type={f.type}
                    required
                    minLength={f.name === "password" ? 6 : undefined}
                    autoComplete={f.name === "password" ? "new-password" : f.name}
                    value={formData[f.name]}
                    onChange={handleChange}
                    className="login-input min-h-[42px]"
                    placeholder={f.placeholder}
                  />
                </div>
              </div>
            ))}

            {!isWorker && (
              <div>
                <label htmlFor="address" className="mb-1.5 ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
                  Address *
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} aria-hidden />
                  <input
                    id="address"
                    name="address"
                    type="text"
                    required
                    value={formData.address}
                    onChange={handleChange}
                    className="login-input min-h-[42px]"
                    placeholder="House no, street, city"
                  />
                </div>
              </div>
            )}

            {isWorker && (
              <div className="space-y-3.5">
                {/* Worker Category Select */}
                <div>
                  <label htmlFor="duty_position" className="mb-1.5 ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
                    Worker Category *
                  </label>
                  <select
                    id="duty_position"
                    name="duty_position"
                    required
                    value={formData.duty_position}
                    onChange={handleChange}
                    className="login-input min-h-[42px] cursor-pointer"
                  >
                    {WORKER_DUTY_POSITIONS.map((d) => (
                      <option key={d} value={d} className="bg-slate-900 text-white">{d}</option>
                    ))}
                  </select>
                </div>

                {/* Custom Category Input if 'Other' is chosen */}
                {formData.duty_position === "Other" && (
                  <div>
                    <label htmlFor="custom_role" className="mb-1.5 ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
                      Specify Category / Issue *
                    </label>
                    <input
                      id="custom_role"
                      type="text"
                      required
                      placeholder="e.g. Drainage, Pension, etc."
                      value={customRole}
                      onChange={(e) => setCustomRole(e.target.value)}
                      className="login-input min-h-[42px]"
                    />
                  </div>
                )}

                {/* State Dropdown */}
                <div>
                  <label htmlFor="state" className="mb-1.5 ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
                    State *
                  </label>
                  <select
                    id="state"
                    name="state"
                    required
                    value={formData.state}
                    onChange={(e) => {
                      setFormData({ ...formData, state: e.target.value, city: "" });
                    }}
                    className="login-input min-h-[42px] cursor-pointer"
                  >
                    <option value="" className="bg-slate-900 text-white">Select State</option>
                    {getAllStates().sort().map((s) => (
                      <option key={s} value={s} className="bg-slate-900 text-white">{s}</option>
                    ))}
                  </select>
                </div>

                {/* District Dropdown */}
                <div>
                  <label htmlFor="city" className="mb-1.5 ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
                    District *
                  </label>
                  <select
                    id="city"
                    name="city"
                    required
                    disabled={!formData.state}
                    value={formData.city}
                    onChange={handleChange}
                    className="login-input min-h-[42px] cursor-pointer"
                  >
                    <option value="" className="bg-slate-900 text-white">
                      {formData.state ? "Select District" : "Select state first"}
                    </option>
                    {formData.state && getDistrictsForState(formData.state).sort().map((d) => (
                      <option key={d} value={d} className="bg-slate-900 text-white">{d}</option>
                    ))}
                  </select>
                </div>

                {/* Specific Area Input */}
                <div>
                  <label htmlFor="address" className="mb-1.5 ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
                    Area / Location *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={16} aria-hidden />
                    <input
                      id="address"
                      name="address"
                      type="text"
                      required
                      value={formData.address}
                      onChange={handleChange}
                      className="login-input min-h-[42px]"
                      placeholder="e.g. Ward 5, Gandhi Road"
                    />
                  </div>
                </div>
              </div>
            )}

            <button type="submit" disabled={loading} className={`inline-flex items-center justify-center gap-2 ${config.btnClass}`}>
              {loading ? <Loader2 className="animate-spin" size={16} /> : <>Register <ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="mt-4 border-t border-white/10 pt-4 text-center text-xs text-white/55">
            Have an account?{" "}
            <Link to={`/login?role=${targetRole}`} className={`cursor-pointer font-bold hover:underline ${config.linkClass}`}>
              Sign In
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Register;
