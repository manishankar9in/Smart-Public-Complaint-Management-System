import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { ClipboardList, MapPin, CheckCircle, AlertCircle, Loader2, Clock, Navigation } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import GPSCamera from "../components/GPSCamera";
import { getStatusColor } from "../data/categoryMapping";

const WorkerDashboard = () => {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [solvingId, setSolvingId] = useState(null);
  const [proof, setProof] = useState({ image: "", lat: null, lng: null, note: "" });
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = async () => {
    if (!user) return;
    try {
      const res = await api.get("/workers/tasks");
      const list = (res.data || []).sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
      setComplaints(list);
    } catch {
      toast.error("Failed to load assigned tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [user]);

  const markInProgress = async (id) => {
    try {
      await api.put(`/workers/mark-in-progress/${id}`);
      toast.success("Marked in progress.");
      fetchTasks();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Update failed.");
    }
  };

  const submitProof = async () => {
    if (!proof.image || !proof.lat) return toast.error("GPS photo proof is required.");
    setSubmitting(true);
    try {
      await api.put(`/workers/upload-proof/${solvingId}`, {
        status: "WORKER_COMPLETED",
        worker_proof_image_url: proof.image,
        worker_gps_lat: proof.lat,
        worker_gps_long: proof.lng,
        worker_note: proof.note,
      });
      toast.success("Proof sent to admin for verification.");
      setSolvingId(null);
      setProof({ image: "", lat: null, lng: null, note: "" });
      fetchTasks();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const active = complaints.filter((c) => ["ASSIGNED_TO_WORKER", "IN_PROGRESS", "REOPENED"].includes(c.status));
  const inProgress = complaints.filter((c) => c.status === "IN_PROGRESS");

  return (
    <div className="page-shell theme-public p-3 sm:p-4">
      <div className="page-container space-y-4 pb-12">
        <div className="surface-card p-3">
          <h1 className="text-xl font-black text-black">Worker Dashboard</h1>
          <p className="text-xs text-slate-600">
            {user?.name} · {user?.duty_position} · {user?.city || user?.ward || "Area not set"}
          </p>
          <p className="mt-1 text-[10px] text-slate-500">{user?.email}</p>
          {typeof user?.complaints_solved === "number" && (
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-800">
              <CheckCircle size={12} /> {user.complaints_solved} complaint{user.complaints_solved !== 1 ? "s" : ""} solved
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="surface-card p-3 text-center">
            <p className="text-2xl font-black text-amber-700">{active.length}</p>
            <p className="text-[10px] font-bold uppercase text-slate-500">Active Tasks</p>
          </div>
          <div className="surface-card p-3 text-center">
            <p className="text-2xl font-black text-cyan-700">{inProgress.length}</p>
            <p className="text-[10px] font-bold uppercase text-slate-500">In Progress</p>
          </div>
        </div>

        <h2 className="text-sm font-black uppercase tracking-widest text-black">Assigned Complaints</h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-primary" size={28} />
          </div>
        ) : complaints.length === 0 ? (
          <div className="surface-card p-6 text-center text-sm text-slate-500">
            <ClipboardList className="mx-auto mb-2" size={32} />
            No complaints assigned yet. Admin will route tasks to your category & location.
          </div>
        ) : (
          <div className="space-y-2">
            {complaints.map((c) => (
              <div key={c._id} className="surface-card p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-black">{c.category}</p>
                    <p className="line-clamp-2 text-xs text-slate-600">{c.description}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                      <span className={`rounded border px-1.5 py-0.5 font-bold ${getStatusColor(c.status)}`}>
                        {String(c.status).replace(/_/g, " ")}
                      </span>
                      <span className="text-red-700 font-bold">{c.priority_level}</span>
                      <span className="flex items-center gap-0.5 text-slate-500">
                        <MapPin size={10} /> {c.village || c.city}, {c.state}
                      </span>
                      <span className="flex items-center gap-0.5 text-slate-500">
                        <Clock size={10} /> {new Date(c.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {c.status === "REOPENED" && c.admin_rejection_reason && (
                      <p className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                        Admin note: {c.admin_rejection_reason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    {c.gps_lat && (
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${c.gps_lat},${c.gps_long}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-primary cursor-pointer px-2 py-1 text-[10px] flex items-center gap-1"
                      >
                        <Navigation size={12} /> Navigate
                      </a>
                    )}
                    {c.status === "ASSIGNED_TO_WORKER" && (
                      <button type="button" onClick={() => markInProgress(c._id)} className="btn-secondary cursor-pointer px-2 py-1 text-[10px]">
                        Start
                      </button>
                    )}
                    {["ASSIGNED_TO_WORKER", "IN_PROGRESS", "REOPENED"].includes(c.status) && (
                      <button
                        type="button"
                        onClick={() => {
                          setSolvingId(c._id);
                          setProof({ image: "", lat: null, lng: null, note: "" });
                        }}
                        className="btn-primary cursor-pointer px-2 py-1 text-[10px]"
                      >
                        Upload Proof
                      </button>
                    )}
                    {c.status === "WORKER_COMPLETED" && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-700">
                        <CheckCircle size={12} /> Awaiting admin
                      </span>
                    )}
                  </div>
                </div>
                {c.proof_image_url && (
                  <img src={c.proof_image_url} alt="Citizen proof" className="mt-2 h-20 w-20 rounded border object-cover" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {solvingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border bg-white p-4 shadow-xl">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-black text-black">Submit Resolution Proof</h3>
                <button
                  type="button"
                  onClick={() => setSolvingId(null)}
                  className="cursor-pointer text-slate-500 hover:text-black"
                >
                  ✕
                </button>
              </div>
              <GPSCamera
                label="GPS photo after fixing the issue"
                onCapture={({ image, coords }) => {
                  if (!coords) return;
                  setProof((p) => ({ ...p, image, lat: coords.lat, lng: coords.lng }));
                }}
              />
              <textarea
                value={proof.note}
                onChange={(e) => setProof({ ...proof, note: e.target.value })}
                rows={2}
                className="input-field mt-3 w-full text-sm"
                placeholder="What did you fix? (optional note)"
              />
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setSolvingId(null)} className="btn-secondary flex-1 cursor-pointer py-2 text-xs">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || !proof.image}
                  onClick={submitProof}
                  className="btn-primary flex-1 cursor-pointer py-2 text-xs disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="mx-auto animate-spin" size={16} /> : "Send to Admin"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WorkerDashboard;
