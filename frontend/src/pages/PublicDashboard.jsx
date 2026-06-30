import React, { useState, useEffect, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { Link } from "react-router-dom";
import { TrendingUp, AlertCircle, CheckCircle, Activity, PlusCircle, Clock, Star } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { fetchUserComplaints, getCitizenUid } from "../services/complaintService";
import { getStatusColor } from "../data/categoryMapping";

const PENDING = ["PENDING_ADMIN_VERIFY", "VERIFIED", "SUBMITTED"];
const IN_PROGRESS = ["ASSIGNED_TO_WORKER", "IN_PROGRESS", "WORKER_COMPLETED", "REOPENED"];

export default function PublicDashboard() {
  const { user } = useAuth();
  const [complaints, setComplaints] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, resolved: 0, inProgress: 0 });
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackSolved, setFeedbackSolved] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchComplaints = async () => {
    try {
      const uid = getCitizenUid(user);
      if (!uid) return setComplaints([]);
      const sorted = await fetchUserComplaints(uid);
      sorted.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setComplaints(sorted);
      setStats({
        total: sorted.length,
        pending: sorted.filter((c) => PENDING.includes(c.status)).length,
        resolved: sorted.filter((c) => c.status === "RESOLVED").length,
        inProgress: sorted.filter((c) => IN_PROGRESS.includes(c.status)).length,
      });
    } catch {
      toast.error("Failed to fetch complaints.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchComplaints();
  }, [user]);

  const openFeedback = (complaintId) => {
    setSelectedFeedback(complaintId);
    setFeedbackText("");
    setFeedbackRating(5);
    setFeedbackSolved(true);
  };

  const submitFeedback = async () => {
    if (!feedbackText.trim()) return toast.warn("Enter feedback comment.");
    try {
      await api.post("/feedback/complaint", {
        complaint_id: selectedFeedback,
        rating: feedbackRating,
        solved: feedbackSolved,
        comment: feedbackText.trim(),
      });
      toast.success(feedbackSolved ? "Thank you! Your feedback has been recorded." : "Issue reported to admin for review.");
      setSelectedFeedback(null);
      setFeedbackText("");
      fetchComplaints();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Failed to submit feedback.");
    }
  };

  if (loading) {
    return (
      <div className="page-shell theme-public flex min-h-[40vh] items-center justify-center p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const statCards = [
    { label: "Total", value: stats.total, icon: TrendingUp, color: "text-blue-700" },
    { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-700" },
    { label: "In Progress", value: stats.inProgress, icon: Activity, color: "text-purple-700" },
    { label: "Resolved", value: stats.resolved, icon: CheckCircle, color: "text-green-700" },
  ];

  return (
    <Fragment>
      <div className="page-shell theme-public p-3 sm:p-4">
        <div className="page-container space-y-4 pb-12">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-black text-black sm:text-2xl">
                Hello, {user?.name?.split(" ")[0] || "Citizen"}
              </h1>
              <p className="text-xs text-slate-600">Track your complaints in real time</p>
            </div>
            <Link to="/raise-complaint" className="btn-primary w-full cursor-pointer py-2 text-sm sm:w-auto">
              <PlusCircle size={16} /> Raise Complaint
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {statCards.map((s) => (
              <div key={s.label} className="surface-card flex items-center gap-3 p-3">
                <s.icon size={20} className={s.color} />
                <div>
                  <p className="text-lg font-black text-black">{s.value}</p>
                  <p className="text-[10px] font-bold uppercase text-slate-500">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          <h2 className="text-sm font-black uppercase tracking-widest text-black">Your Complaints</h2>

          {complaints.length === 0 ? (
            <div className="surface-card p-6 text-center">
              <AlertCircle className="mx-auto mb-2 text-blue-600" size={32} />
              <p className="text-sm font-bold text-black">No complaints yet</p>
              <Link to="/raise-complaint" className="btn-primary mt-3 inline-flex cursor-pointer px-4 py-2 text-xs">
                Raise your first complaint
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {complaints.map((c) => (
                <div key={c._id} className="surface-card p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-black text-black">{c.category}</h3>
                      <p className="line-clamp-2 text-xs text-slate-600">{c.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-800">
                          {c.priority_level}
                        </span>
                        <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${getStatusColor(c.status)}`}>
                          {String(c.status || "").replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {new Date(c.created_at).toLocaleDateString()} · {c.city || c.village || "—"}
                        </span>
                      </div>
                      {c.admin_response_message && ["RESOLVED", "REOPENED"].includes(c.status) && (
                        <p className={
                          `mt-2 rounded border p-2 text-xs ${c.status === "REOPENED" ? "border-red-200 bg-red-50 text-red-900" : "border-green-200 bg-green-50 text-green-900"}`
                        }>
                          Admin: {c.admin_response_message}
                        </p>
                      )}
                      {c.feedback && (
                        <p className="mt-2 rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-900">
                          Your feedback: {c.feedback.rating}/5 stars — {c.feedback.solved ? "Issue resolved" : "Reported to admin"}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Link to={`/complaint/${c._id}`} className="btn-secondary cursor-pointer px-3 py-1.5 text-[10px]">
                        Track
                      </Link>
                      {(c.status === "WORKER_COMPLETED" || c.status === "RESOLVED") && !c.feedback && (
                        <button
                          type="button"
                          onClick={() => openFeedback(c._id)}
                          className="btn-secondary cursor-pointer px-3 py-1.5 text-[10px]"
                        >
                          Feedback
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedFeedback && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="w-full max-w-md rounded-xl border bg-white p-4 shadow-xl">
              <h3 className="mb-1 font-black text-black">Rate Your Experience</h3>
              <p className="mb-3 text-xs text-slate-500">Was your complaint resolved satisfactorily?</p>

              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setFeedbackSolved(true)}
                  className={`flex-1 cursor-pointer rounded-lg border py-2 text-xs font-bold transition-all ${
                    feedbackSolved ? "border-green-500 bg-green-50 text-green-800" : "border-slate-200 text-slate-600"
                  }`}
                >
                  ✓ Issue Solved
                </button>
                <button
                  type="button"
                  onClick={() => setFeedbackSolved(false)}
                  className={`flex-1 cursor-pointer rounded-lg border py-2 text-xs font-bold transition-all ${
                    !feedbackSolved ? "border-red-500 bg-red-50 text-red-800" : "border-slate-200 text-slate-600"
                  }`}
                >
                  ✗ Still an Issue
                </button>
              </div>

              <p className="mb-2 text-[10px] font-bold uppercase text-slate-500">Rating</p>
              <div className="mb-3 flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setFeedbackRating(n)} className="cursor-pointer p-0.5">
                    <Star size={22} className={n <= feedbackRating ? "fill-amber-500 text-amber-500" : "text-slate-300"} />
                  </button>
                ))}
              </div>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={3}
                className="input-field w-full text-sm"
                placeholder={feedbackSolved ? "Share what went well or suggestions..." : "Describe the remaining issue — admin will review..."}
              />
              {!feedbackSolved && (
                <p className="mt-2 rounded border border-amber-200 bg-amber-50 p-2 text-[10px] text-amber-800">
                  Your report will be sent to the admin team for review and improvement.
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => setSelectedFeedback(null)} className="btn-secondary flex-1 cursor-pointer py-2 text-xs">
                  Cancel
                </button>
                <button type="button" onClick={submitFeedback} className="btn-primary flex-1 cursor-pointer py-2 text-xs">
                  Submit
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </Fragment>
  );
}
