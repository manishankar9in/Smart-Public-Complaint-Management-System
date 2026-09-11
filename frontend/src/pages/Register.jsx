import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { toast } from "react-toastify";
import { Mail, Lock, Loader2, ArrowRight, MapPin, Phone, Briefcase, Navigation } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { WORKER_DEPARTMENTS } from "../data/dutyPositions";
import { api, formatApiError } from "../utils/api";
import { PORTAL_THEMES } from "../data/roleThemes";
import { INDIAN_STATES_WITH_DISTRICTS, getDistrictsForState, getAllStates } from "../data/indianStatesDistricts";
import { reverseGeocode } from "../utils/mapErrorHandler";

const ROLE_CONFIG = {
  public: {
    ...PORTAL_THEMES.public,
    title: "Public User Registration",
    subtitle: "Email, phone, password & address",
  },
  worker: {
    ...PORTAL_THEMES.worker,
    title: "Worker Registration",
    subtitle: "Email, phone, password, duty area & department",
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
    department: WORKER_DEPARTMENTS[0] || "Public Works",
    latitude: null,
    longitude: null,
  });
  const [customDepartment, setCustomDepartment] = useState("");
  const [loading, setLoading] = useState(false);
  const [detectingGps, setDetectingGps] = useState(false);
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

  // Direct GPS Detection (similar to Raise Complaint page)
  const detectCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }

    setDetectingGps(true);
    const toastId = toast.loading("Acquiring GPS lock & auto-populating address details...");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = parseFloat(position.coords.latitude.toFixed(6));
        const lng = parseFloat(position.coords.longitude.toFixed(6));

        try {
          const geocodedAddress = await reverseGeocode(lat, lng);
          if (geocodedAddress) {
            const addr = geocodedAddress.rawAddress || {};
            const stateName = String(geocodedAddress.state || addr.state || "").trim();

            // Match state against standardized list
            const matchedState =
              Object.keys(INDIAN_STATES_WITH_DISTRICTS).find(
                (s) => s.toLowerCase() === stateName.toLowerCase()
              ) || stateName;

            // Match district against standardized list
            const districtName = String(
              addr.state_district || addr.county || addr.district || addr.city || addr.town || ""
            ).trim();

            let matchedDistrict = "";
            if (matchedState) {
              const districts = getDistrictsForState(matchedState) || [];
              matchedDistrict =
                districts.find((d) => d.toLowerCase() === districtName.toLowerCase()) ||
                districts.find(
                  (d) =>
                    districtName.toLowerCase().includes(d.toLowerCase()) ||
                    d.toLowerCase().includes(districtName.toLowerCase())
                ) ||
                districtName;
            }

            // Extract local area
            const localArea =
              addr.suburb ||
              addr.village ||
              addr.neighbourhood ||
              addr.road ||
              addr.town ||
              addr.city ||
              geocodedAddress.address ||
              "";

            setFormData((prev) => ({
              ...prev,
              latitude: lat,
              longitude: lng,
              state: matchedState,
              city: matchedDistrict,
              address: localArea || prev.address,
            }));

            toast.update(toastId, {
              render: "GPS detected! State, District & Area auto-filled successfully.",
              type: "success",
              isLoading: false,
              autoClose: 3000,
            });
          } else {
            setFormData((prev) => ({
              ...prev,
              latitude: lat,
              longitude: lng,
            }));
            toast.update(toastId, {
              render: `GPS locked (${lat}, ${lng}). Please select State & District manually.`,
              type: "warn",
              isLoading: false,
              autoClose: 3000,
            });
          }
        } catch (error) {
          console.error("Reverse geocoding error:", error);
          setFormData((prev) => ({
            ...prev,
            latitude: lat,
            longitude: lng,
          }));
          toast.update(toastId, {
            render: "GPS lock acquired. Please select State & District.",
            type: "info",
            isLoading: false,
            autoClose: 3000,
          });
        } finally {
          setDetectingGps(false);
        }
      },
      (error) => {
        setDetectingGps(false);
        toast.update(toastId, {
          render: `GPS Lock Failed: ${error.message}. Please select manually.`,
          type: "error",
          isLoading: false,
          autoClose: 3000,
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password.length < 6) {
      return toast.error("Password must be at least 6 characters.");
    }

    const finalDepartment =
      formData.department === "Other" ? customDepartment.trim() : formData.department;

    if (isWorker) {
      if (formData.department === "Other" && !customDepartment.trim()) {
        return toast.error("Please specify your custom department name.");
      }
      if (!formData.state || !formData.city || !formData.address.trim()) {
        return toast.error("State, District, and Area/Location are required for workers.");
      }
    }

    setLoading(true);
    try {
      if (isWorker) {
        const name = formData.email.split("@")[0] || "Worker";
        let lat = formData.latitude;
        let lng = formData.longitude;

        if (lat == null || lng == null) {
          try {
            if (navigator?.geolocation) {
              const pos = await new Promise((res, rej) => {
                navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 });
              });
              lat = parseFloat(pos.coords.latitude.toFixed(6));
              lng = parseFloat(pos.coords.longitude.toFixed(6));
            }
          } catch {
            lat = 9.5872;
            lng = 77.9624;
          }
        }

        const res = await api.post("/worker-auth/register", {
          email: formData.email.trim(),
          password: formData.password,
          name,
          phone: formData.phone,
          department: finalDepartment,
          state: formData.state,
          city: formData.city,
          ward: formData.address.trim(),
          latitude: lat,
          longitude: lng,
          available: true,
        });

        toast.success("Registration submitted! Please check your email to activate your account.");
        navigate(`/email-verification-pending?email=${encodeURIComponent(formData.email.trim())}&role=worker`, {
          replace: true,
          state: {
            email: formData.email.trim(),
            role: "worker",
          },
        });
      } else {
        const name = formData.email.split("@")[0] || "Citizen";
        try {
          await register(formData.email.trim(), formData.password, name, "public", {
            phone: formData.phone,
            address: formData.address,
          });
          toast.success("Account created! Please check your email to verify your account.");
          navigate(`/email-verification-pending?email=${encodeURIComponent(formData.email.trim())}&role=public`, {
            replace: true,
            state: { email: formData.email.trim(), role: "public" },
          });
        } catch (regErr) {
          if (regErr.message === "VERIFICATION_EMAIL_SENT" || regErr.email) {
            toast.success("Account created! Verification email sent.");
            navigate(`/email-verification-pending?email=${encodeURIComponent(formData.email.trim())}&role=public`, {
              replace: true,
              state: { email: formData.email.trim(), role: "public" },
            });
            return;
          }
          throw regErr;
        }
      }
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setLoading(false);
    }
  };

  const PortalIcon = config.icon;

  const fields = [
    { id: "email", label: "Email Address *", type: "email", icon: Mail, name: "email", placeholder: "you@email.com" },
    { id: "phone", label: "Phone Number *", type: "tel", icon: Phone, name: "phone", placeholder: "9876543210" },
    { id: "password", label: "Password *", type: "password", icon: Lock, name: "password", placeholder: "Min. 6 characters" },
  ];

  return (
    <div className={`login-shell ${config.shellClass}`}>
      <div className="login-grid-overlay" aria-hidden />
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="login-orb login-orb-1 h-72 w-72" style={{ top: "-8%", left: "-5%", background: config.orbA, opacity: 0.5 }} />
        <div className="login-orb login-orb-2 h-64 w-64" style={{ bottom: "-10%", right: "-5%", background: config.orbB, opacity: 0.45 }} />
      </div>

      <motion.div className="login-card-3d max-w-lg w-full" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
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
            {fields.map((f) => (
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
              <div className="space-y-3.5 pt-1 border-t border-white/10">
                {/* Department Select */}
                <div>
                  <label htmlFor="department" className="mb-1.5 ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-white/70 sm:text-xs">
                    Department *
                  </label>
                  <div className="relative">
                    <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" size={16} aria-hidden />
                    <select
                      id="department"
                      name="department"
                      required
                      value={formData.department}
                      onChange={handleChange}
                      className="login-input min-h-[42px] pl-10 cursor-pointer"
                    >
                      {WORKER_DEPARTMENTS.map((d) => (
                        <option key={d} value={d} className="bg-slate-900 text-white">{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* If "Other" selected, show custom text input */}
                {formData.department === "Other" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <label htmlFor="customDepartment" className="mb-1.5 ml-0.5 block text-[10px] font-bold uppercase tracking-widest text-amber-300 sm:text-xs">
                      Enter Department Name *
                    </label>
                    <div className="relative">
                      <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400" size={16} aria-hidden />
                      <input
                        id="customDepartment"
                        name="customDepartment"
                        type="text"
                        required
                        value={customDepartment}
                        onChange={(e) => setCustomDepartment(e.target.value)}
                        className="login-input min-h-[42px] border-amber-400/50 focus:border-amber-400"
                        placeholder="e.g. Street Lighting, Drainage, Parks & Gardens"
                      />
                    </div>
                  </motion.div>
                )}

                {/* GPS Auto-Detect Location Bar */}
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/30 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                  <div className="space-y-0.5">
                    <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                      <Navigation size={13} className="text-emerald-400" />
                      Auto-Detect Location
                    </span>
                    <p className="text-[10px] text-white/60">
                      Click to auto-fill State, District, Area &amp; GPS coordinates.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={detectCurrentLocation}
                    disabled={detectingGps}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow transition-all cursor-pointer disabled:opacity-50"
                  >
                    {detectingGps ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <MapPin size={14} />
                    )}
                    <span>{detectingGps ? "Detecting..." : "📍 Detect GPS Location"}</span>
                  </button>
                </div>

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
                    Area / Location / Ward *
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
