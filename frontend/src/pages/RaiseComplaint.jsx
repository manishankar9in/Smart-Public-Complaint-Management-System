import { useState } from "react";
import { createComplaint, getCitizenUid } from "../services/complaintService";
import { COMPLAINT_CATEGORIES } from "../data/categoryMapping";
import { useAuth } from "../context/AuthContext";
import { INDIAN_STATES_WITH_DISTRICTS, getDistrictsForState } from "../data/indianStatesDistricts";
import { ArrowRight, CheckCircle, Loader2, MapPin } from "lucide-react";
import GPSCamera from "../components/GPSCamera";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";

export default function RaiseComplaint() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    category: "",
    description: "",
    state: "",
    city: "",
    village: "",
    proof_image_url: "",
    gps_lat: null,
    gps_long: null,
  });

  const canContinue =
    form.category && form.description.trim() && form.state && form.city && form.village.trim();

  const handleSubmit = async () => {
    if (!form.gps_lat || !form.gps_long || !form.proof_image_url) {
      return toast.warn("Capture a GPS photo before submitting.");
    }
    setLoading(true);
    try {
      const address = `${form.village}, ${form.city}, ${form.state}`;
      await createComplaint({
        firebase_uid: getCitizenUid(user),
        category: form.category,
        description: form.description.trim(),
        proof_image_url: form.proof_image_url,
        gps_lat: parseFloat(form.gps_lat),
        gps_long: parseFloat(form.gps_long),
        address,
        state: form.state,
        city: form.city,
        village: form.village,
        street: "",
        ward: "",
      });
      toast.success("Complaint submitted successfully!");
      setStep(3);
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit complaint.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell theme-raise p-3 sm:p-4">
      <div className="mx-auto max-w-2xl py-3">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-black sm:text-2xl">Raise Complaint</h1>
            <p className="text-xs text-green-900">Select problem → describe → GPS photo → submit</p>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-2 rounded-full ${step >= i ? "w-6 bg-green-600" : "w-2 bg-slate-300"}`} />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <div className="surface-card space-y-3 p-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold uppercase text-green-800">Problem Category *</label>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {COMPLAINT_CATEGORIES.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setForm({ ...form, category: cat })}
                        className={`cursor-pointer rounded-lg border p-2 text-[10px] font-bold leading-tight sm:text-xs ${
                          form.category === cat
                            ? "border-green-600 bg-green-100 text-black"
                            : "border-slate-200 bg-white text-green-900 hover:border-green-400"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-green-800">Describe the Problem *</label>
                  <textarea
                    required
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="input-field min-h-[72px] text-sm"
                    placeholder="What is wrong? When did you notice it?"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-green-800">State *</label>
                    <select
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value, city: "" })}
                      className="input-field min-h-[40px] cursor-pointer text-sm"
                    >
                      <option value="">Select State</option>
                      {Object.keys(INDIAN_STATES_WITH_DISTRICTS).sort().map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-green-800">District *</label>
                    <select
                      value={form.city}
                      disabled={!form.state}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                      className="input-field min-h-[40px] cursor-pointer text-sm"
                    >
                      <option value="">{form.state ? "Select District" : "Select state first"}</option>
                      {form.state && getDistrictsForState(form.state).sort().map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase text-green-800">Area / Village *</label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-green-500" size={16} />
                    <input
                      required
                      value={form.village}
                      onChange={(e) => setForm({ ...form, village: e.target.value })}
                      className="input-field min-h-[40px] pl-9 text-sm"
                      placeholder="Ward, street, village or locality"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canContinue}
                  onClick={() => setStep(2)}
                  className="btn-primary w-full cursor-pointer py-2.5 text-sm disabled:opacity-50"
                >
                  Next: GPS Photo <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              <div className="surface-card space-y-3 p-4">
                <p className="text-xs text-slate-600">
                  <strong>{form.category}</strong> — {form.village}, {form.city}
                </p>
                <GPSCamera
                  label="Capture complaint photo with GPS lock (required)"
                  onCapture={({ image, coords }) => {
                    if (!coords) return;
                    setForm({
                      ...form,
                      proof_image_url: image,
                      gps_lat: coords.lat,
                      gps_long: coords.lng,
                    });
                  }}
                />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStep(1)} className="btn-secondary flex-1 cursor-pointer py-2 text-sm">
                    Back
                  </button>
                  <button
                    type="button"
                    disabled={loading || !form.proof_image_url}
                    onClick={handleSubmit}
                    className="btn-primary flex-1 cursor-pointer py-2 text-sm disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="mx-auto animate-spin" size={18} /> : "Submit Complaint"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="surface-card p-6 text-center">
              <CheckCircle className="mx-auto mb-3 text-green-600" size={48} />
              <h2 className="text-lg font-black text-black">Complaint Submitted!</h2>
              <p className="mt-2 text-sm text-green-900">Admin will review and assign a worker in your area.</p>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button type="button" onClick={() => navigate("/user-dashboard")} className="btn-primary cursor-pointer px-5 py-2 text-sm">
                  Go to Dashboard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ category: "", description: "", state: "", city: "", village: "", proof_image_url: "", gps_lat: null, gps_long: null });
                    setStep(1);
                  }}
                  className="btn-secondary cursor-pointer px-5 py-2 text-sm"
                >
                  Raise Another
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
