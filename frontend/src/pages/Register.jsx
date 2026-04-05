import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "react-toastify";
import { User, Mail, Lock, Loader2, ArrowRight, MapPin, Briefcase } from "lucide-react";
import { Card } from "../components/UI";
import { motion } from "framer-motion";
import { INDIAN_STATES, getCitiesForState } from "../data/indiaLocations";
import { WORKER_DUTY_POSITIONS } from "../data/dutyPositions";
import { formatApiError } from "../utils/api";

const defaultRegState = "Andhra Pradesh";

const Register = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const targetRole = queryParams.get("role") || "public";
  
  const getTargetDashboard = (role) => {
    if (role === "admin") return "/admin-dashboard";
    if (role === "worker") return "/worker-dashboard";
    return "/user-dashboard";
  };

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    password: "",
    confirmPassword: "",
    role: targetRole === "worker" ? "worker" : targetRole === "public" ? "public" : "public",
    state: defaultRegState,
    city: getCitiesForState(defaultRegState)[0] || "",
    ward: "",
    duty_position: WORKER_DUTY_POSITIONS[1],
    street: "",
    village: "",
  });
  const [loading, setLoading] = useState(false);
  const { register, registerWorker } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) {
      return toast.error("Passwords do not match.");
    }
    setLoading(true);
    try {
      if (formData.role === "worker") {
        await registerWorker({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          duty_position: formData.duty_position,
          state: formData.state,
          city: formData.city,
          ward: formData.ward || undefined,
          street: formData.street || undefined,
          village: formData.village || undefined,
          phone: formData.phone || undefined,
        });
        toast.success("Worker account created. You can now take assigned missions.");
        navigate("/worker-dashboard");
      } else {
        await register(
          formData.email,
          formData.password,
          formData.name,
          formData.role,
          {
            phone: formData.phone,
            address: formData.address,
            state: formData.state,
            city: formData.city,
            ward: formData.ward,
          }
        );
        toast.success("Account created successfully! Welcome to the platform.");
        navigate(getTargetDashboard(targetRole));
      }
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="mb-6">
            <Link
              to={`/login?role=${targetRole}`}
              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-muted hover:text-primary transition-colors"
            >
              Back to Login
            </Link>
          </div>
          <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center text-white font-bold text-2xl border border-slate-700/20 mx-auto mb-6">भा</div>
          <h1 className="text-3xl font-bold text-secondary tracking-tight">Citizen registration</h1>
          <p className="text-sm text-muted font-medium mt-2">Official portal — select your role and jurisdiction</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="!p-10 glass-card">
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Personal Info */}
                <div className="space-y-6">
                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 group-focus-within:text-primary transition-colors" size={18} />
                      <input
                        name="name"
                        type="text"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        className="input-field pl-12"
                        placeholder="enter name"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 group-focus-within:text-primary transition-colors" size={18} />
                      <input
                        name="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="input-field pl-12"
                        placeholder="enter email"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Phone Number</label>
                    <div className="relative">
                      <input
                        name="phone"
                        type="tel"
                        required={formData.role === 'public'}
                        value={formData.phone}
                        onChange={handleChange}
                        className="input-field"
                        placeholder="e.g. 9876543210"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Address</label>
                    <div className="relative">
                      <input
                        name="address"
                        type="text"
                        required={formData.role === 'public'}
                        value={formData.address}
                        onChange={handleChange}
                        className="input-field"
                        placeholder="e.g. House no, street, city"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 group-focus-within:text-primary transition-colors" size={18} />
                      <input
                        name="password"
                        type="password"
                        required
                        value={formData.password}
                        onChange={handleChange}
                        className="input-field pl-12"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 group-focus-within:text-primary transition-colors" size={18} />
                      <input
                        name="confirmPassword"
                        type="password"
                        required
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        className="input-field pl-12"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>

                {/* Role & Location */}
                <div className="space-y-6">
                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Account Role</label>
                    <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-50 rounded-2xl border-2 border-slate-50">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, role: "public" })}
                        className={`py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${formData.role === "public" ? "bg-white text-primary shadow-sm shadow-blue-100" : "text-muted"}`}
                      >
                        Public
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, role: "worker" })}
                        className={`py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all ${formData.role === "worker" ? "bg-white text-primary shadow-sm shadow-blue-100" : "text-muted"}`}
                      >
                        Worker
                      </button>
                    </div>
                  </div>

                  {formData.role === "worker" && (
                    <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Duty / department</label>
                      <select
                        name="duty_position"
                        required
                        value={formData.duty_position}
                        onChange={handleChange}
                        className="input-field"
                      >
                        {WORKER_DUTY_POSITIONS.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                      <p className="text-[9px] text-muted mt-2">
                        Complaints in this category and your jurisdiction will be routed to you after admin verification.
                      </p>
                    </div>
                  )}

                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">State / UT</label>
                    <select
                      name="state"
                      required={formData.role === "worker"}
                      value={formData.state}
                      onChange={(e) => {
                        const st = e.target.value;
                        const cities = getCitiesForState(st);
                        setFormData({ ...formData, state: st, city: cities[0] || "" });
                      }}
                      className="input-field"
                    >
                      {INDIAN_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">City / Municipality</label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 group-focus-within:text-primary transition-colors pointer-events-none z-[1]" size={18} />
                      <select
                        name="city"
                        required={formData.role === "worker"}
                        value={formData.city}
                        onChange={handleChange}
                        className="input-field pl-12"
                      >
                        {getCitiesForState(formData.state).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="group">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Ward / Area</label>
                    <div className="relative">
                      <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40 group-focus-within:text-primary transition-colors" size={18} />
                      <input
                        name="ward"
                        type="text"
                        required={formData.role === "worker"}
                        value={formData.ward}
                        onChange={handleChange}
                        className="input-field pl-12"
                        placeholder="e.g. Ward 4"
                      />
                    </div>
                  </div>

                  {formData.role === "worker" && (
                    <>
                      <div className="group">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Street / lane (optional)</label>
                        <input
                          name="street"
                          type="text"
                          value={formData.street}
                          onChange={handleChange}
                          className="input-field"
                          placeholder="For finer address matching"
                        />
                      </div>
                      <div className="group">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2 ml-1">Village / locality (optional)</label>
                        <input
                          name="village"
                          type="text"
                          value={formData.village}
                          onChange={handleChange}
                          className="input-field"
                          placeholder="Matches citizen locality when provided"
                        />
                      </div>
                    </>
                  )}

                  <div className="bg-blue-50/50 p-4 rounded-3xl border border-blue-100 mt-4">
                    <p className="text-[10px] text-blue-800 font-medium leading-relaxed italic">
                      {formData.role === 'worker'
                        ? "Location data is required for smart mission assignment."
                        : "Location helps us map your complaints to the correct official."}
                    </p>
                  </div>
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
                    Initialize Governance Account <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-8 pt-8 border-t border-slate-100 text-center">
              <p className="text-[10px] text-muted font-bold uppercase tracking-widest leading-loose">
                Already have an identity? <br />
                <Link to={`/login?role=${targetRole}`} className="text-primary hover:underline">Access Login Terminal</Link>
              </p>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Register;
