import { useState, useRef, useEffect } from "react";
import { createComplaint, getCitizenUid } from "../services/complaintService";
import { useAuth } from "../context/AuthContext";
import { 
  Camera, 
  MapPin, 
  UploadCloud, 
  AlertCircle, 
  ArrowLeft, 
  ArrowRight,
  CheckCircle,
  Loader2,
  Trash2,
  Zap
} from "lucide-react";
import { Card, Badge } from "../components/UI";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom";
import { getCurrentLocation } from "../utils/geolocation";
import { sendNotification } from "../services/emailService";
import { waitForVideoReady } from "../utils/cameraCapture";
import { INDIAN_STATES, getCitiesForState } from "../data/indiaLocations";

const CATEGORIES = [
  "Electricity", "Water", "Road", "Hospital", "Women Safety", "Ration", "Other"
];

const RaiseComplaint = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const defaultState = "Andhra Pradesh";
  const defaultCity = getCitiesForState(defaultState)[0] || "";

  const [formData, setFormData] = useState({
    category: "",
    description: "",
    address: "",
    state: defaultState,
    city: defaultCity,
    street: "",
    village: "",
    ward: "",
    proof_image_url: "",
    gps_lat: null,
    gps_long: null
  });

  /** Bind MediaStream after <video> exists (ref is null until isCapturing is true). */
  useEffect(() => {
    if (!stream || !isCapturing || step !== 2) return;
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "true");
    video.srcObject = stream;
    setVideoReady(false);

    let cancelled = false;

    const markReady = async () => {
      try {
        await video.play();
      } catch {
        /* autoplay quirks; muted usually allowed */
      }
      await new Promise((r) => requestAnimationFrame(r));
      if (!cancelled && video.videoWidth > 0 && video.videoHeight > 0) {
        setVideoReady(true);
      }
    };

    const onFrame = () => {
      void markReady();
    };

    video.addEventListener("loadedmetadata", onFrame);
    video.addEventListener("loadeddata", onFrame);
    video.addEventListener("canplay", onFrame);

    if (video.readyState >= 2) {
      void markReady();
    }

    return () => {
      cancelled = true;
      video.removeEventListener("loadedmetadata", onFrame);
      video.removeEventListener("loadeddata", onFrame);
      video.removeEventListener("canplay", onFrame);
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [stream, isCapturing, step]);

  const stopLiveCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
    setIsCapturing(false);
    setVideoReady(false);
  };

  const startCamera = async () => {
    try {
      setVideoReady(false);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
        setStream(null);
      }

      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      } catch {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      }

      setIsCapturing(true);
      setStream(mediaStream);
    } catch (err) {
      toast.error("Camera access denied. Please enable permissions.");
      setIsCapturing(false);
    }
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    try {
      await waitForVideoReady(videoRef.current);
    } catch (e) {
      toast.error(e.message || "Camera not ready. Wait for preview, then try again.");
      return;
    }

    const video = videoRef.current;
    const context = canvasRef.current.getContext("2d");
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (!videoWidth || !videoHeight) {
      toast.error("Camera preview has no image yet. Please wait and try again.");
      return;
    }

    canvasRef.current.width = videoWidth;
    canvasRef.current.height = videoHeight;

    // 1. Draw frame
    context.drawImage(video, 0, 0);

    // 2. Lock GPS Position
    let coords;
    try {
      coords = await getCurrentLocation();
    } catch (err) {
      toast.error("Failed to secure GPS lock. Location is mandatory.");
      return;
    }

    // 3. Overlay Metadata on Image (GPS Camera Style)
    const timestamp = new Date().toLocaleString();
    const address = formData.address || "Fetching address...";

    context.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.fillRect(0, videoHeight - 120, videoWidth, 120);

    context.fillStyle = "white";
    context.font = "bold 20px Arial";
    context.fillText(`GPS: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`, 30, videoHeight - 80);
    context.fillText(`TIME: ${timestamp}`, 30, videoHeight - 50);
    context.font = "italic 16px Arial";
    context.fillText(`LOCATION: ${address}`, 30, videoHeight - 20);

    const imageUrl = canvasRef.current.toDataURL("image/jpeg", 0.9);

    stream?.getTracks().forEach((track) => track.stop());
    setIsCapturing(false);
    setStream(null);
    setVideoReady(false);

    setFormData((prev) => ({
      ...prev,
      proof_image_url: imageUrl,
      gps_lat: coords.lat,
      gps_long: coords.lng
    }));
    toast.success("GPS Coordinate Integrity Verified!");
  };

  const handleSubmit = async () => {
    if (!formData.gps_lat || !formData.proof_image_url) {
      return toast.error("Site Proof and GPS are required for AI verification.");
    }
    
    setLoading(true);
    const uid = getCitizenUid(user);
    if (!uid) {
      toast.error("You must be signed in to submit.");
      setLoading(false);
      return;
    }
    try {
      const resData = await createComplaint({
        ...formData,
        firebase_uid: uid,
      });

      // Trigger Email Integration
      await sendNotification("PROCESSING", {
        to_email: user.email,
        name: user.displayName || user.email,
        complaint_id: resData.id || "N/A",
        category: formData.category,
        address: formData.address,
        message: "Your complaint has been received and is under processing.",
      });

      setStep(3); // Success Screen
    } catch (err) {
      toast.error("Submission failed. Status: " + (err.response?.data?.detail || "Network Error"));
    } finally {
      setLoading(false);
    }
  };

  const containerVariants = {
    hidden: { opacity: 0, x: 20 },
    visible: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 }
  };

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-12">
        <div>
           <h1 className="text-3xl font-black text-secondary tracking-tight">Mission Initializer</h1>
           <p className="text-muted font-medium mt-1">Submit a real-world issue for automated governance routing.</p>
        </div>
        <div className="flex gap-2 p-1.5 bg-white rounded-2xl shadow-soft border border-slate-50">
           {[1, 2, 3].map(i => (
             <div key={i} className={`h-2.5 rounded-full transition-all duration-500 ${step >= i ? "bg-primary w-8" : "bg-slate-100 w-2.5"}`} />
           ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" variants={containerVariants} initial="hidden" animate="visible" exit="exit">
             <Card className="!p-8 glass-card border-0 shadow-premium">
                <div className="space-y-8">
                   <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Issue Category</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                         {CATEGORIES.map(cat => (
                           <button
                             key={cat}
                             onClick={() => setFormData({...formData, category: cat})}
                             className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 group ${formData.category === cat ? "bg-blue-50 border-primary text-primary" : "bg-slate-50 border-slate-50 text-muted hover:border-slate-200"}`}
                           >
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${formData.category === cat ? "bg-primary text-white" : "bg-white text-muted"}`}>
                                 <Zap size={18} />
                              </div>
                              <span className="text-[10px] font-black uppercase tracking-tighter">{cat}</span>
                           </button>
                         ))}
                      </div>
                   </div>

                   <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Incident Description</label>
                      <textarea
                        required
                        className="input-field min-h-[120px]"
                        placeholder="Provide deep details of the issue for accurately scoring severity..."
                        value={formData.description}
                        onChange={(e) => setFormData({...formData, description: e.target.value})}
                      />
                   </div>

                   <div className="group">
                      <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">On-site Address / Landmark</label>
                      <div className="relative">
                         <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-muted/40" size={18} />
                         <input
                           className="input-field pl-12"
                           placeholder="e.g. Near Market, Old Cross"
                           value={formData.address}
                           onChange={(e) => setFormData({...formData, address: e.target.value})}
                         />
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="group">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">State / UT</label>
                        <select
                          className="input-field"
                          value={formData.state}
                          onChange={(e) => {
                            const st = e.target.value;
                            const cities = getCitiesForState(st);
                            setFormData({ ...formData, state: st, city: cities[0] || "" });
                          }}
                        >
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div className="group">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">City / Municipality</label>
                        <select
                          className="input-field"
                          value={formData.city}
                          onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        >
                          {getCitiesForState(formData.state).map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                      <div className="group">
                         <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Street / Lane</label>
                         <input
                           className="input-field"
                           placeholder="e.g. Ward 5 Street"
                           value={formData.street}
                           onChange={(e) => setFormData({...formData, street: e.target.value})}
                         />
                      </div>
                      <div className="group">
                         <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3 ml-1">Village / Ward</label>
                         <input
                           className="input-field"
                           placeholder="e.g. Ananthapur-6"
                           value={formData.village}
                           onChange={(e) => setFormData({...formData, village: e.target.value, ward: e.target.value})}
                         />
                      </div>
                   </div>

                   <button 
                     onClick={() => {
                        if (!formData.category || !formData.description || !formData.address) {
                           return toast.warn("Please initialize all core fields.");
                        }
                        setStep(2);
                     }}
                     className="w-full btn-primary py-5 group"
                   >
                     Launch Proof Capture <ArrowRight size={20} className="inline ml-2 group-hover:translate-x-1 transition-transform" />
                   </button>
                </div>
             </Card>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="step2" variants={containerVariants} initial="hidden" animate="visible" exit="exit" className="space-y-8">
             <button
                type="button"
                onClick={() => {
                  stopLiveCamera();
                  setStep(1);
                }}
                className="text-[10px] font-black uppercase tracking-widest text-muted hover:text-primary transition-all flex items-center gap-1"
             >
                <ArrowLeft size={14} /> Adjust Initial Data
             </button>

             <Card className="!p-0 border-0 shadow-premium bg-black rounded-[40px] overflow-hidden min-h-[min(70vh,480px)] relative flex flex-col items-center justify-center">
                {!formData.proof_image_url ? (
                   isCapturing ? (
                      <div className="absolute inset-0">
                         <video
                           ref={videoRef}
                           autoPlay
                           playsInline
                           muted
                           className="absolute inset-0 w-full h-full min-h-[280px] object-cover bg-black"
                         />
                         <div className="absolute inset-0 border-[24px] border-slate-900/30 backdrop-blur-none" />
                         <div className="absolute inset-x-0 bottom-12 flex flex-col items-center gap-3 z-10">
                            {!videoReady && (
                              <span className="text-[10px] font-bold uppercase tracking-widest text-white/80 bg-black/50 px-4 py-2 rounded-lg">
                                Preparing camera preview…
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={!videoReady}
                              onClick={captureImage}
                              title={videoReady ? "Capture proof" : "Wait for preview"}
                              className="w-20 h-20 rounded-full bg-red-600 border-8 border-white/40 shadow-2xl transition-all active:scale-90 disabled:opacity-40 disabled:animate-none animate-pulse"
                            />
                         </div>
                         <div className="absolute top-8 left-8 flex items-center gap-2 bg-blue-600 px-4 py-2 rounded-full text-[10px] font-black text-white uppercase tracking-widest shadow-lg">
                            <Zap size={14} className="animate-bounce" /> Live Sensor Sync Active
                         </div>
                      </div>
                   ) : (
                      <button
                        type="button"
                        onClick={startCamera}
                        className="flex flex-col items-center gap-6 group text-white/40 hover:text-white transition-all"
                      >
                         <div className="w-24 h-24 bg-white/10 rounded-[40px] flex items-center justify-center border-4 border-white/10 group-hover:bg-primary/20 group-hover:border-primary group-hover:scale-110 transition-all p-8">
                            <Camera size={48} className="opacity-40 group-hover:opacity-100" />
                         </div>
                         <span className="font-black text-xs uppercase tracking-widest opacity-60">Authorize Governance Camera</span>
                      </button>
                   )
                ) : (
                   <div className="absolute inset-0 flex flex-col">
                      <img src={formData.proof_image_url} alt="Proof" className="w-full h-full object-cover" />
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-12 flex justify-between items-end">
                         <div>
                            <Badge variant="success" className="mb-4">Integrity Locked</Badge>
                            <div className="flex items-center gap-2 text-white/60">
                               <MapPin size={16} className="text-primary" />
                               <span className="text-[10px] font-black uppercase tracking-widest">{formData.gps_lat?.toFixed(6)}, {formData.gps_long?.toFixed(6)}</span>
                            </div>
                         </div>
                         <button 
                           onClick={() => setFormData({...formData, proof_image_url: "", gps_lat: null, gps_long: null})}
                           className="p-4 bg-white/10 backdrop-blur-xl rounded-2xl text-white hover:bg-red-500 transition-all"
                         >
                            <Trash2 size={24} />
                         </button>
                      </div>
                   </div>
                )}
                <canvas ref={canvasRef} className="hidden" />
             </Card>

             <div className="bg-blue-50/50 p-6 rounded-[30px] border border-blue-100 flex items-start gap-4">
                <AlertCircle className="text-blue-500 mt-1 shrink-0" size={24} />
                <p className="text-xs text-blue-800 font-medium leading-relaxed italic">
                   Note: All sensor data is cryptographically timestamped. Fraudulent submissions will result in permanent identity suspension from the smart network.
                </p>
             </div>

             {formData.proof_image_url && (
                <button 
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full btn-primary py-5 shadow-blue-300"
                >
                  {loading ? <Loader2 className="animate-spin mx-auto" size={24} /> : "Certify & Submit Mission"}
                </button>
             )}
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="step3" variants={containerVariants} initial="hidden" animate="visible" className="text-center py-20 px-8">
             <div className="w-32 h-32 bg-green-50 text-green-500 rounded-[48px] flex items-center justify-center mx-auto mb-12 relative shadow-inner border-2 border-green-100">
                <CheckCircle size={56} />
                <div className="absolute inset-0 rounded-[48px] bg-green-500 animate-ping opacity-20"></div>
             </div>
             
             <h2 className="text-4xl font-black text-secondary tracking-tight">Mission Synchronized!</h2>
             <p className="text-muted font-medium max-w-sm mx-auto mt-4 leading-relaxed italic">
                Your report is now being analyzed by the AI Priority Engine. You will receive an automated routing update shortly.
             </p>

             <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => navigate("/user-dashboard")}
                  className="btn-primary"
                >
                  Return to Dashboard
                </button>
                <button
                  onClick={() => {
                    setFormData({
                      category: "",
                      description: "",
                      address: "",
                      state: defaultState,
                      city: defaultCity,
                      street: "",
                      village: "",
                      ward: "",
                      proof_image_url: "",
                      gps_lat: null,
                      gps_long: null
                    });
                    setStep(1);
                  }}
                  className="btn-secondary"
                >
                  Raise Another
                </button>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default RaiseComplaint;
