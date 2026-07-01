import { useState } from "react";
import { createComplaint, getCitizenUid } from "../services/complaintService";
import { COMPLAINT_CATEGORIES } from "../data/categoryMapping";
import { useAuth } from "../context/AuthContext";
import { INDIAN_STATES_WITH_DISTRICTS, getDistrictsForState } from "../data/indianStatesDistricts";
import { reverseGeocode } from "../utils/mapErrorHandler";
import { ArrowRight, CheckCircle, Loader2, MapPin } from "lucide-react";
import GPSCamera from "../components/GPSCamera";
import GooglePlacesAutocomplete from "../components/GooglePlacesAutocomplete";
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
    pincode: "",
  });
  const [useGoogleMaps, setUseGoogleMaps] = useState(false);

  const canContinue =
    form.category && form.description.trim() && form.state && form.city && form.village.trim();

  const detectCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }

    const toastId = toast.loading("Acquiring GPS lock & fetching address details...");
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        
        try {
          const geocodedAddress = await reverseGeocode(lat, lng);
          if (geocodedAddress) {
            const addr = geocodedAddress.rawAddress || {};
            const stateName = String(geocodedAddress.state || addr.state || "").trim();
            
            // Match state
            const matchedState = Object.keys(INDIAN_STATES_WITH_DISTRICTS).find(
              (s) => s.toLowerCase() === stateName.toLowerCase()
            ) || stateName;
            
            // Match district
            const districtName = String(addr.state_district || addr.county || addr.district || addr.city || addr.town || "").trim();
            let matchedDistrict = "";
            if (matchedState) {
              const districts = getDistrictsForState(matchedState) || [];
              matchedDistrict = districts.find(
                (d) => d.toLowerCase() === districtName.toLowerCase()
              ) || districts.find(
                (d) => districtName.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(districtName.toLowerCase())
              ) || districtName;
            }

            // Local area
            const localArea = addr.suburb || addr.village || addr.neighbourhood || addr.road || addr.town || addr.city || "";

            setForm((prev) => ({
              ...prev,
              gps_lat: lat,
              gps_long: lng,
              state: matchedState,
              city: matchedDistrict,
              village: localArea || geocodedAddress.address || "",
              pincode: geocodedAddress.postcode || "",
            }));

            toast.update(toastId, {
              render: "Location details auto-populated successfully!",
              type: "success",
              isLoading: false,
              autoClose: 3000,
            });
          } else {
            toast.update(toastId, {
              render: "GPS lock acquired, but reverse geocoding failed. Please select manually.",
              type: "warn",
              isLoading: false,
              autoClose: 3000,
            });
          }
        } catch (error) {
          console.error("Reverse geocoding error:", error);
          toast.update(toastId, {
            render: "Error fetching address. Please select manually.",
            type: "error",
            isLoading: false,
            autoClose: 3000,
          });
        }
      },
      (error) => {
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

  const handlePlaceSelect = (placeData) => {
    if (placeData) {
      setForm({
        ...form,
        state: placeData.state || form.state,
        city: placeData.district || placeData.city || form.city,
        village: placeData.village || placeData.city || form.village,
        pincode: placeData.pincode || "",
        gps_lat: placeData.latitude,
        gps_long: placeData.longitude,
      });
    }
  };

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
        pincode: form.pincode,
      });
      toast.success("Complaint submitted successfully!");
      setStep(3);
    } catch (err) {
      console.error('Complaint submission error:', err);
      
      // Detailed error messages for debugging
      let errorMessage = "Failed to submit complaint.";
      
      if (err.response?.status === 409) {
        errorMessage = "This complaint appears to be a duplicate. A similar complaint already exists.";
      } else if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        errorMessage = "Network timeout: Image too large or connection slow. Try with better network or smaller image.";
      } else if (!err.response) {
        errorMessage = "Network Error: Cannot reach server. Check your internet connection.";
      } else if (err.response?.status === 413) {
        errorMessage = "Image Too Large: Compress image before uploading.";
      } else if (err.response?.status === 401) {
        errorMessage = "Authentication Failed: Please login again.";
      } else if (err.response?.status === 500) {
        errorMessage = "Server Error: Backend issue. Try again later.";
      } else if (err.response?.data?.detail) {
        errorMessage = typeof err.response.data.detail === 'string' 
          ? err.response.data.detail 
          : JSON.stringify(err.response.data.detail);
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      toast.error(errorMessage);
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

                <div className="mb-3">
                  <label className="flex items-center gap-2 mb-2 text-[10px] font-bold uppercase text-green-800">
                    <input
                      type="checkbox"
                      checked={useGoogleMaps}
                      onChange={(e) => setUseGoogleMaps(e.target.checked)}
                      className="cursor-pointer"
                    />
                    Use Google Maps Address Search (Auto-fill location)
                  </label>
                </div>

                {useGoogleMaps ? (
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase text-green-800">Search Address *</label>
                    <GooglePlacesAutocomplete
                      onPlaceSelect={handlePlaceSelect}
                      placeholder="Type address, village, city, district..."
                    />
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase text-slate-600">State</label>
                        <input
                          value={form.state}
                          onChange={(e) => setForm({ ...form, state: e.target.value })}
                          className="input-field min-h-[36px] text-sm bg-slate-50"
                          placeholder="Auto-filled"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[10px] font-bold uppercase text-slate-600">District</label>
                        <input
                          value={form.city}
                          onChange={(e) => setForm({ ...form, city: e.target.value })}
                          className="input-field min-h-[36px] text-sm bg-slate-50"
                          placeholder="Auto-filled"
                        />
                      </div>
                    </div>
                    <div className="mt-2">
                      <label className="mb-1 block text-[10px] font-bold uppercase text-slate-600">Area / Village *</label>
                      <input
                        required
                        value={form.village}
                        onChange={(e) => setForm({ ...form, village: e.target.value })}
                        className="input-field min-h-[36px] text-sm"
                        placeholder="Enter specific area/village"
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-1.5 mt-2">
                      <span className="text-[10px] font-bold uppercase text-green-800">Location Area</span>
                      <button
                        type="button"
                        onClick={detectCurrentLocation}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 hover:text-blue-900 transition-colors cursor-pointer bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100"
                      >
                        <MapPin size={12} className="text-blue-700" />
                        Detect GPS Address
                      </button>
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
                  </>
                )}

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
                  onCapture={async ({ image, coords }) => {
                    if (!coords) return;
                    
                    let geocodedAddress = null;
                    try {
                      geocodedAddress = await reverseGeocode(coords.lat, coords.lng);
                    } catch (err) {
                      console.error("Reverse geocoding error:", err);
                    }

                    setForm((prev) => {
                      const updated = {
                        ...prev,
                        proof_image_url: image,
                        gps_lat: coords.lat,
                        gps_long: coords.lng,
                      };

                      if (geocodedAddress) {
                        const addr = geocodedAddress.rawAddress || {};
                        const stateName = String(geocodedAddress.state || addr.state || "").trim();
                        
                        const matchedState = Object.keys(INDIAN_STATES_WITH_DISTRICTS).find(
                          (s) => s.toLowerCase() === stateName.toLowerCase()
                        ) || stateName;
                        
                        const districtName = String(addr.state_district || addr.county || addr.district || addr.city || addr.town || "").trim();
                        let matchedDistrict = "";
                        if (matchedState) {
                          const districts = getDistrictsForState(matchedState) || [];
                          matchedDistrict = districts.find(
                            (d) => d.toLowerCase() === districtName.toLowerCase()
                          ) || districts.find(
                            (d) => districtName.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(districtName.toLowerCase())
                          ) || districtName;
                        }

                        const localArea = addr.suburb || addr.village || addr.neighbourhood || addr.road || addr.town || addr.city || "";

                        updated.state = matchedState;
                        updated.city = matchedDistrict;
                        updated.village = localArea || geocodedAddress.address || "";
                        updated.pincode = geocodedAddress.postcode || "";
                      }
                      return updated;
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
                    setForm({ category: "", description: "", state: "", city: "", village: "", proof_image_url: "", gps_lat: null, gps_long: null, pincode: "" });
                    setStep(1);
                    setUseGoogleMaps(false);
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
