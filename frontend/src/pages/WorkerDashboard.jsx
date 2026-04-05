import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { 
  ClipboardList, 
  MapPin, 
  CheckCircle, 
  AlertCircle, 
  Camera, 
  Clock, 
  Loader2,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  ArrowRight
} from "lucide-react";
import { Card, StatsCard, Badge } from "../components/UI";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { getCurrentLocation } from "../utils/geolocation";
import { waitForVideoReady } from "../utils/cameraCapture";

const WorkerDashboard = () => {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeMissions, setActiveMissions] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("");

  const [solvingId, setSolvingId] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [stream, setStream] = useState(null);
  const [solvedData, setSolvedData] = useState({ image: "", lat: null, long: null, note: "" });
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    fetchWorkerData();
  }, [user]);

  useEffect(() => {
    if (!stream || !isCapturing || !solvingId) return;
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
        /* ok */
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
  }, [stream, isCapturing, solvingId]);

  const fetchWorkerData = async () => {
    if (!user) return;
    try {
      const res = await api.get("/workers/tasks");
      setComplaints(res.data);
      
      const active = res.data.filter(c => ['ASSIGNED_TO_WORKER', 'REOPENED'].includes(c.status)).length;
      const completed = res.data.filter(c => ['WORKER_COMPLETED', 'RESOLVED', 'CLOSED'].includes(c.status)).length;
      setActiveMissions(active);
      setCompletedToday(completed); 
    } catch (err) {
      toast.error("Failed to fetch worker missions.");
    } finally {
      setLoading(false);
    }
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
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      setIsCapturing(true);
      setStream(mediaStream);
    } catch (err) {
      toast.error("Camera access denied.");
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

    context.drawImage(video, 0, 0);

    let coords;
    try {
      coords = await getCurrentLocation();
    } catch (err) {
      toast.error("Failed to secure GPS lock.");
      return;
    }

    const timestamp = new Date().toLocaleString();

    context.fillStyle = "rgba(0, 0, 0, 0.5)";
    context.fillRect(0, videoHeight - 120, videoWidth, 120);

    context.fillStyle = "white";
    context.font = "bold 20px Arial";
    context.fillText(`SOLVED GPS: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`, 30, videoHeight - 80);
    context.fillText(`TIME: ${timestamp}`, 30, videoHeight - 50);
    context.font = "italic 16px Arial";
    context.fillText(`AUTHORITY UNIT: ${user?.name} | WARD: ${user?.ward}`, 30, videoHeight - 20);

    const imageUrl = canvasRef.current.toDataURL("image/jpeg", 0.9);

    stream?.getTracks().forEach((track) => track.stop());
    setIsCapturing(false);
    setStream(null);
    setVideoReady(false);

    setSolvedData((prev) => ({
      ...prev,
      image: imageUrl,
      lat: coords.lat,
      long: coords.lng
    }));
    toast.success("Resolution GPS Locked!");
  };

  const handleSolveSubmit = async () => {
    if (!solvedData.image || !solvedData.lat) {
      return toast.error("Live GPS proof is mandatory for resolution.");
    }

    try {
      await api.put(`/workers/upload-proof/${solvingId}`, {
        status: "WORKER_COMPLETED",
        worker_proof_image_url: solvedData.image,
        worker_gps_lat: solvedData.lat,
        worker_gps_long: solvedData.long,
        worker_note: solvedData.note
      });

      toast.success("Mission solved! Uploaded for Admin Audit.");
      setSolvingId(null);
      setSolvedData({ image: "", lat: null, long: null, note: "" });
      fetchWorkerData();
    } catch (err) {
      toast.error("Submission failed: " + (err.response?.data?.detail || "Network Error"));
    }
  };

  const getSlaCountdown = (deadline) => {
    if (!deadline) return "No SLA";
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) return "OVERDUE";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
  };

  const filteredComplaints = complaints.filter((c) => {
    const byPriority = priorityFilter === "all" || (c.priority_level || "").toLowerCase() === priorityFilter;
    const byStatus = statusFilter === "all" || (c.status || "").toLowerCase() === statusFilter;
    const searchable = `${c.state || ""} ${c.city || ""} ${c.ward || ""} ${c.address || ""}`.toLowerCase();
    const byLocation = !locationFilter.trim() || searchable.includes(locationFilter.toLowerCase());
    return byPriority && byStatus && byLocation;
  });

  const overdueComplaints = complaints.filter((c) => c.sla_deadline && new Date(c.sla_deadline).getTime() < Date.now() && !["RESOLVED", "CLOSED"].includes(c.status));

  return (
    <div className="space-y-12 max-w-6xl mx-auto pb-20">
      {/* Header & Stats */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div>
           <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-white rounded-2xl shadow-soft flex items-center justify-center text-primary border border-slate-50 font-black text-xl">W</div>
              <div>
                 <h1 className="text-3xl font-black text-secondary tracking-tight">Worker Terminal</h1>
                 <p className="text-[10px] text-muted font-bold tracking-widest uppercase mt-0.5">Field Authority Identity</p>
              </div>
           </div>
           <p className="text-muted font-medium ml-1">Assigned governance missions for <span className="text-secondary font-black underline decoration-primary decoration-4 underline-offset-4">{user?.ward}, {user?.city}</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
         <StatsCard 
           title="Active Missions" 
           value={activeMissions} 
           icon={AlertTriangle} 
           variant={activeMissions > 5 ? "danger" : "warning"}
           trendLabel="Priority tasks in queue"
         />
         <StatsCard 
           title="Missions Completed" 
           value={completedToday} 
           icon={CheckCircle2} 
           variant="success"
           trend={15}
           trendLabel="Efficiency increase vs yesterday"
         />
      </div>

      {overdueComplaints.length > 0 && (
        <Card className="border-red-100 bg-red-50/50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="text-sm font-black text-red-700 uppercase tracking-widest">Escalation Alerts</h4>
              <p className="text-xs text-red-600 font-bold mt-1">{overdueComplaints.length} complaint(s) crossed SLA deadline.</p>
            </div>
            <AlertTriangle className="text-red-500" />
          </div>
        </Card>
      )}

      {/* Mission Queue */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-2">
           <h3 className="text-[10px] font-black tracking-[0.2em] uppercase text-muted">Field Mission Queue</h3>
           <div className="flex items-center gap-2 text-[10px] font-bold text-success uppercase tracking-widest bg-green-50 px-3 py-1 rounded-full border border-green-100">
              <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse"></div>
              Live Server Connection
           </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select className="input-field" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
            <option value="all">All Priority</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="assigned_to_worker">Assigned</option>
            <option value="reopened">Reopened</option>
            <option value="worker_completed">Worker Completed</option>
          </select>
          <input
            className="input-field"
            placeholder="Filter by state/city/ward/address"
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
          />
        </div>

        <AnimatePresence mode="popLayout text-center">
        {loading ? (
           <div className="space-y-4">
              {[1, 2].map(i => <div key={i} className="h-64 bg-slate-100 rounded-3xl animate-pulse" />)}
           </div>
        ) : filteredComplaints.length === 0 ? (
           <Card className="py-24 text-center flex flex-col items-center gap-6">
              <div className="p-8 bg-slate-50 border border-slate-100 rounded-[40px] text-slate-200">
                 <ClipboardList size={64} />
              </div>
              <div>
                 <h4 className="text-xl font-black text-secondary tracking-tight">Zero Pending Missions</h4>
                 <p className="text-xs text-muted font-medium mt-2">All governance tasks in your area are currently synchronized.</p>
              </div>
           </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {filteredComplaints.map((c, idx) => (
              <motion.div
                key={c._id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
              >
               <Card className={`relative overflow-hidden group transition-all hover:shadow-premium ${c.status === 'REOPENED' ? 'bg-red-50/10 border-red-100' : ''}`}>
                   {/* Priority Header */}
                   <div className="absolute top-0 right-0 p-6 flex flex-col items-end gap-2">
                      <Badge 
                        variant={c.priority_level === 'Critical' ? 'danger' : c.priority_level === 'High' ? 'warning' : 'primary'}
                      >
                         {c.priority_level} Priority
                      </Badge>
                      <div className="flex items-center gap-1.5 text-[9px] font-black text-muted uppercase tracking-widest">
                         <Clock size={12} /> {new Date(c.created_at).toLocaleDateString()}
                      </div>
                      <Badge variant={getSlaCountdown(c.sla_deadline) === "OVERDUE" ? "danger" : "primary"}>
                        SLA: {getSlaCountdown(c.sla_deadline)}
                      </Badge>
                   </div>

                   <div className="space-y-6">
                      <div className="flex gap-4">
                         <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center text-primary border border-slate-100 shrink-0 shadow-sm transition-all group-hover:bg-primary group-hover:text-white">
                            <Navigation size={24} />
                         </div>
                         <div className="pt-1">
                            <h4 className="text-xl font-black text-secondary tracking-tight">{c.category} Mission</h4>
                            <p className="flex items-center gap-1.5 text-[10px] text-muted font-bold uppercase tracking-widest mt-1">
                               <MapPin size={14} className="text-primary" /> {c.address}
                            </p>
                         </div>
                      </div>

                      <div className="bg-slate-50/50 p-6 rounded-[30px] border border-slate-50">
                         <p className="text-xs text-secondary/70 font-medium italic leading-relaxed">"{c.description}"</p>
                      </div>

                      {/* Site Image & Actions */}
                      <div className="flex items-end justify-between">
                         <div className="flex -space-x-3">
                            <div className="w-14 h-14 rounded-2xl border-4 border-white shadow-lg overflow-hidden transform group-hover:-rotate-3 transition-transform">
                               <img src={c.proof_image_url} alt="Proof" className="w-full h-full object-cover" />
                            </div>
                         </div>
                         
                         {['ASSIGNED_TO_WORKER', 'REOPENED'].includes(c.status) ? (
                            <button 
                              onClick={() => setSolvingId(c._id)}
                              className="btn-primary !py-3 !px-6 !rounded-xl !text-[10px] shadow-blue-100"
                            >
                               Initialize Solve Mission
                            </button>
                         ) : (
                            <div className="flex items-center gap-2 text-[10px] font-black text-success uppercase tracking-widest">
                               <CheckCircle size={16}/> Resolution Staged
                            </div>
                         )}
                      </div>

                      {c.status === 'REOPENED' && (
                         <div className="mt-4 p-4 bg-red-600 text-white rounded-2xl shadow-lg relative overflow-hidden">
                            <AlertCircle className="absolute -top-2 -right-2 w-20 h-20 opacity-10" />
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-1">Admin Rejection Note</p>
                            <p className="text-xs font-bold italic leading-relaxed">"{c.admin_rejection_reason}"</p>
                         </div>
                      )}
                   </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
        </AnimatePresence>
      </div>

      {/* Solving Overlay */}
      <AnimatePresence>
      {solvingId && (
         <div className="fixed inset-0 bg-secondary/80 backdrop-blur-2xl z-50 flex items-center justify-center p-6">
            <motion.div 
               initial={{ opacity: 0, y: 100 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 100 }}
               className="w-full max-w-2xl bg-white rounded-[48px] shadow-premium overflow-hidden"
            >
               <div className="p-10 space-y-10">
                  <div className="flex justify-between items-start">
                     <div>
                        <h2 className="text-3xl font-black text-secondary tracking-tight">Resolution terminal</h2>
                        <p className="text-[10px] text-muted font-bold tracking-[0.2em] uppercase mt-2">Mission Integrity Verification</p>
                     </div>
                     <button
                       type="button"
                       onClick={() => {
                         stream?.getTracks().forEach((t) => t.stop());
                         setStream(null);
                         setVideoReady(false);
                         setIsCapturing(false);
                         setSolvingId(null);
                       }}
                       className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-all"
                     >
                        <X size={24} />
                     </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <div className="space-y-6">
                        <div className="aspect-square bg-slate-50 rounded-[40px] border-4 border-dashed border-slate-100 overflow-hidden relative flex flex-col items-center justify-center group">
                           {solvedData.image ? (
                              <>
                                 <img src={solvedData.image} alt="Solved" className="w-full h-full object-cover" />
                                 <div className="absolute inset-x-0 bottom-6 px-6">
                                    <div className="bg-green-500/90 text-white p-3 rounded-2xl backdrop-blur-md flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                                       <span className="flex items-center gap-1.5"><CheckCircle size={14}/> GPS Fixed</span>
                                       <span>{solvedData.lat?.toFixed(4)}, {solvedData.long?.toFixed(4)}</span>
                                    </div>
                                 </div>
                                 <button 
                                   onClick={() => setSolvedData({...solvedData, image: "", lat: null, long: null})}
                                   className="absolute top-6 right-6 w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center text-white hover:bg-red-500 transition-all"
                                 >
                                    <Camera size={20} />
                                 </button>
                              </>
                           ) : isCapturing ? (
                              <>
                                 <video
                                   ref={videoRef}
                                   autoPlay
                                   playsInline
                                   muted
                                   className="absolute inset-0 w-full h-full object-cover bg-black"
                                 />
                                 {!videoReady && (
                                    <span className="absolute top-4 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-widest text-white bg-black/60 px-3 py-1.5 rounded-lg z-10">
                                       Preparing preview…
                                    </span>
                                 )}
                                 <button
                                   type="button"
                                   disabled={!videoReady}
                                   onClick={captureImage}
                                   className="absolute bottom-6 w-16 h-16 rounded-full bg-red-600 border-4 border-white shadow-2xl animate-pulse active:scale-90 transition-all disabled:opacity-40 disabled:animate-none z-10"
                                 />
                              </>
                           ) : (
                              <button 
                                onClick={startCamera}
                                className="flex flex-col items-center gap-4 text-slate-300 hover:text-primary transition-all group"
                              >
                                 <div className="p-8 bg-white rounded-3xl shadow-soft group-hover:scale-110 transition-transform">
                                    <Camera size={40} />
                                 </div>
                                 <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Authorize Resolution Proof</span>
                              </button>
                           )}
                           <canvas ref={canvasRef} className="hidden" />
                        </div>
                     </div>

                     <div className="space-y-8 py-2">
                        <div>
                           <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-3">Service Notes</label>
                           <textarea
                             className="input-field min-h-[160px]"
                             placeholder="Describe the technical resolution for the admin audit..."
                             value={solvedData.note}
                             onChange={(e) => setSolvedData({...solvedData, note: e.target.value})}
                           />
                        </div>

                        <div className="flex flex-col gap-4">
                           <div className="flex items-center gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
                              <CheckCircle size={18} className="text-primary shrink-0" />
                              <p className="text-[10px] text-blue-900 font-bold uppercase tracking-widest italic leading-relaxed">
                                 Resolution metadata will be hashed into the governance ledger.
                              </p>
                           </div>
                           
                           <button 
                             onClick={handleSolveSubmit}
                             className="w-full btn-primary !py-5"
                           >
                              Certify Resolution <ArrowRight size={20} className="inline ml-2" />
                           </button>
                        </div>
                     </div>
                  </div>
               </div>
            </motion.div>
         </div>
      )}
      </AnimatePresence>
    </div>
  );
};

const X = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
);

export default WorkerDashboard;
