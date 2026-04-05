import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../utils/api";
import { 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  ArrowRight,
  PlusCircle,
  MessageSquare
} from "lucide-react";
import { Card, StatsCard, Badge } from "../components/UI";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { Link, useLocation } from "react-router-dom";
import { fetchUserComplaints, getCitizenUid } from "../services/complaintService";

const StatusTimeline = ({ status }) => {
  const steps = ["Submitted", "Verified", "Assigned", "Field Solve", "Final Audit"];
  const getStatusIndex = (s) => {
    if (s === 'PENDING_ADMIN_VERIFY') return 0;
    if (s === 'VERIFIED') return 1;
    if (s === 'ASSIGNED_TO_WORKER') return 2;
    if (s === 'WORKER_COMPLETED') return 3;
    if (s === 'RESOLVED' || s === 'CLOSED') return 4;
    if (s === 'REOPENED') return 1;
    return -1;
  };
  const currentIndex = getStatusIndex(status);

  return (
    <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2 no-scrollbar">
      {steps.map((step, idx) => (
        <div key={step} className="flex items-center gap-2 shrink-0">
          <div className={`w-2.5 h-2.5 rounded-full transition-all duration-500 ${idx <= currentIndex ? "bg-primary shadow-lg shadow-blue-200" : "bg-slate-100"}`} />
          <span className={`text-[9px] font-black uppercase tracking-widest ${idx <= currentIndex ? "text-secondary" : "text-slate-300"}`}>
            {step}
          </span>
          {idx < steps.length - 1 && <div className="w-4 h-px bg-slate-100" />}
        </div>
      ))}
    </div>
  );
};

const PublicDashboard = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, active: 0, resolved: 0 });

  useEffect(() => {
    fetchComplaints();
  }, [user, location.pathname]);

  const fetchComplaints = async () => {
    const uid = getCitizenUid(user);
    if (!uid) {
      setComplaints([]);
      setStats({ total: 0, active: 0, resolved: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await fetchUserComplaints(uid);
      if (import.meta.env.DEV) {
        console.log("Fetched complaints:", list?.length, list);
      }
      setComplaints(list);

      const total = list.length;
      const active = list.filter((c) =>
        [
          "PENDING_ADMIN_VERIFY",
          "VERIFIED",
          "ASSIGNED_TO_WORKER",
          "WORKER_COMPLETED",
          "REOPENED",
        ].includes(c.status)
      ).length;
      const resolved = list.filter((c) => ["RESOLVED", "CLOSED"].includes(c.status)).length;
      setStats({ total, active, resolved });
    } catch (err) {
      console.error("User complaints fetch error:", err?.response?.data || err);
      toast.error("Failed to fetch complaints.");
      setComplaints([]);
    } finally {
      setLoading(false);
    }
  };

  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [feedbackData, setFeedbackData] = useState({ rating: 5, comment: "", reopen: false });

  const handleFeedbackSubmit = async () => {
    try {
      await api.post(`/feedback/complaint`, {
        complaint_id: selectedFeedback._id,
        rating: feedbackData.rating,
        solved: !feedbackData.reopen, // solved = !reopen
        comment: feedbackData.comment
      });
      toast.success("Governance Audit Synchronized!");
      setSelectedFeedback(null);
      fetchComplaints();
    } catch (err) {
      toast.error("Audit submission failed.");
    }
  };

  return (
    <div className="space-y-12 max-w-6xl mx-auto">
      {/* Header & Stats */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div>
           <motion.h1 
             initial={{ opacity: 0, x: -20 }}
             animate={{ opacity: 1, x: 0 }}
             className="text-4xl font-black text-secondary tracking-tight"
           >
             Welcome back, <span className="text-primary">{user?.name?.split(' ')[0]}</span>
           </motion.h1>
           <p className="text-muted font-medium mt-2">Track your reports and governance missions in real-time.</p>
        </div>
        <Link 
          to="/raise-complaint"
          className="btn-primary inline-flex items-center gap-3 w-fit"
        >
          Raise New Complaint <PlusCircle size={20} />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <StatsCard 
           title="Total Reports" 
           value={stats.total} 
           icon={Clock} 
           trend={12} 
           trendLabel="Growth in reporting activity"
         />
         <StatsCard 
           title="Active Missions" 
           value={stats.active} 
           icon={AlertCircle} 
           variant="warning"
           trendLabel="Current pending cleanup"
         />
         <StatsCard 
           title="Success Rate" 
           value={`${stats.total ? Math.round((stats.resolved / stats.total) * 100) : 0}%`} 
           icon={CheckCircle} 
           variant="success"
           trendLabel="Governance efficiency"
         />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
           <div className="flex items-center justify-between px-2">
              <h3 className="text-lg font-black text-secondary uppercase tracking-widest">Active Report Timeline</h3>
              <Badge variant="primary" className="!bg-blue-500 !text-white !p-2 !rounded-full"><TrendingUp size={14}/></Badge>
           </div>
           
           <AnimatePresence mode="popLayout">
           {loading ? (
             <div className="space-y-4">
                {[1, 2, 3].map(i => <div key={i} className="h-40 bg-slate-100 rounded-3xl animate-pulse" />)}
             </div>
           ) : complaints.length === 0 ? (
             <Card className="text-center py-20 flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-300">
                   <Clock size={32} />
                </div>
                <p className="text-muted font-bold tracking-widest uppercase text-[10px]">No active complaints reported yet.</p>
                <Link to="/raise-complaint" className="text-primary font-black text-xs uppercase hover:underline">Launch first mission</Link>
             </Card>
           ) : (
             complaints.map((c, idx) => (
               <motion.div
                 key={c._id}
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 transition={{ delay: idx * 0.05 }}
               >
                 <Card className={`relative overflow-hidden group transition-all hover:border-primary/20 ${c.status === 'REOPENED' ? 'bg-red-50/10 border-red-100' : ''}`}>
                    <div className="flex flex-col md:flex-row gap-6">
                       <div className="w-full md:w-40 h-28 rounded-2xl overflow-hidden border border-slate-100 relative shadow-inner">
                          <img src={c.proof_image_url} alt="Proof" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                             <p className="text-[8px] text-white font-black uppercase tracking-widest truncate">{c.category}</p>
                          </div>
                       </div>
                       
                       <div className="flex-1 space-y-3">
                          <div className="flex justify-between items-start">
                             <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="text-lg font-black text-secondary tracking-tight">{c.category}</h4>
                                  {c.status === 'REOPENED' && <Badge variant="danger">Escalated</Badge>}
                                </div>
                                <p className="text-[10px] text-muted font-bold uppercase tracking-widest mt-1">{c.address}</p>
                             </div>
                             <div className="text-right">
                                <Badge 
                                  variant={
                                    c.status === 'PENDING_ADMIN_VERIFY' ? 'default' :
                                    c.status === 'VERIFIED' ? 'primary' :
                                    c.status === 'ASSIGNED_TO_WORKER' ? 'warning' :
                                    c.status === 'WORKER_COMPLETED' ? 'success' :
                                    c.status === 'REOPENED' ? 'danger' : 'primary'
                                  }
                                >
                                  {c.status === 'WORKER_COMPLETED' ? 'Worker Resolved Site' : c.status.replace(/_/g, ' ')}
                                </Badge>
                             </div>
                          </div>

                          <p className="text-xs text-secondary/70 font-medium line-clamp-2 leading-relaxed italic">"{c.description}"</p>
                          <div>
                            <Link to={`/complaint/${c._id}`} className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline">
                              View Full Details
                            </Link>
                          </div>
                          
                          <StatusTimeline status={c.status} />

                          {c.status === 'RESOLVED' && (
                             <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                                <div className="flex items-center gap-2">
                                   <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center text-success border border-green-100">
                                      <CheckCircle size={14} />
                                   </div>
                                   <p className="text-[10px] font-black uppercase text-secondary tracking-widest">Worker Proof Ready</p>
                                </div>
                                <button 
                                  onClick={() => setSelectedFeedback(c)}
                                  className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1 hover:gap-2 transition-all"
                                >
                                  Final Audit <ArrowRight size={14} />
                                </button>
                             </div>
                          )}
                       </div>
                    </div>
                 </Card>
               </motion.div>
             ))
           )}
           </AnimatePresence>
        </div>

        {/* Sidebar Mini-panels */}
        <div className="space-y-8">
           <Card className="!p-8 bg-secondary text-white border-0 shadow-premium">
              <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
                 <MessageSquare className="text-primary" size={24} />
              </div>
              <h3 className="text-xl font-black tracking-tight mb-2">Identity Hub</h3>
              <p className="text-xs text-white/60 font-medium leading-relaxed mb-6">Your governance score increases with every verified feedback and resolved mission.</p>
              <div className="space-y-4">
                 <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest">
                    <span className="text-white/40">Trust Integrity</span>
                    <span>94%</span>
                 </div>
                 <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-primary w-[94%]" />
                 </div>
              </div>
           </Card>

           <Card className="!p-0 border-0 bg-white shadow-soft">
              <div className="p-6 border-b border-slate-50">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-secondary">Global Notifications</h3>
              </div>
              <div className="divide-y divide-slate-50">
                 {[1, 2, 3].map(i => (
                   <div key={i} className="p-4 hover:bg-slate-50 transition-colors cursor-pointer flex gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-primary shrink-0"><Clock size={14}/></div>
                      <div>
                         <p className="text-[10px] font-bold text-secondary leading-tight mb-1">Worker assigned to your report in Ward 4.</p>
                         <p className="text-[8px] text-muted font-black uppercase tracking-tighter">24 minutes ago</p>
                      </div>
                   </div>
                 ))}
              </div>
           </Card>
        </div>
      </div>

      {/* Feedback Modal */}
      <AnimatePresence>
      {selectedFeedback && (
        <div className="fixed inset-0 bg-secondary/80 backdrop-blur-xl flex items-center justify-center p-4 z-50">
           <motion.div 
             initial={{ scale: 0.9, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             exit={{ scale: 0.9, opacity: 0 }}
             className="w-full max-w-lg bg-white rounded-[40px] shadow-premium overflow-hidden"
           >
              <div className="aspect-video relative overflow-hidden bg-slate-900">
                 <img
                   src={
                     selectedFeedback.admin_response_image_url ||
                     selectedFeedback.worker_proof_image_url ||
                     selectedFeedback.proof_image_url
                   }
                   alt="Resolved"
                   className="w-full h-full object-cover"
                 />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent p-8 flex items-end">
                    <div>
                       <Badge variant="success" className="mb-2">Admin Resolution</Badge>
                       <p className="text-white font-black text-xl tracking-tight">Mission Resolution Result</p>
                       {selectedFeedback.admin_response_message && (
                         <p className="text-white/70 text-xs font-bold uppercase tracking-widest mt-2">
                           {selectedFeedback.admin_response_message}
                         </p>
                       )}
                    </div>
                 </div>
              </div>
              
              <div className="p-8 space-y-6">
                 <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-4">Satisfaction Integrity Score</label>
                    <div className="flex gap-4">
                       {[1, 2, 3, 4, 5].map(star => (
                         <button 
                           key={star} 
                           onClick={() => setFeedbackData({...feedbackData, rating: star})}
                           className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${feedbackData.rating >= star ? "bg-amber-100 text-warning" : "bg-slate-50 text-slate-300"}`}
                         >
                            <MessageSquare fill={feedbackData.rating >= star ? "currentColor" : "none"} size={20} />
                         </button>
                       ))}
                    </div>
                 </div>

                 <textarea
                   className="input-field min-h-[100px]"
                   placeholder="Any final notes on the governance resolution?"
                   value={feedbackData.comment}
                   onChange={(e) => setFeedbackData({...feedbackData, comment: e.target.value})}
                 />

                 <div className="flex items-center gap-3 p-4 bg-red-50 rounded-2xl border border-red-100">
                    <input 
                      type="checkbox" 
                      id="reopen"
                      checked={feedbackData.reopen}
                      onChange={(e) => setFeedbackData({...feedbackData, reopen: e.target.checked})}
                      className="w-5 h-5 rounded-lg border-red-200 text-red-600 focus:ring-red-500" 
                    />
                    <label htmlFor="reopen" className="text-[10px] font-black text-red-700 uppercase tracking-widest cursor-pointer">Reopen Case (Escalate to Admin)</label>
                 </div>

                 <div className="flex gap-4">
                    <button onClick={() => setSelectedFeedback(null)} className="w-1/3 btn-secondary">Close Audit</button>
                    <button onClick={handleFeedbackSubmit} className="w-2/3 btn-primary">Submit Final Opinion</button>
                 </div>
              </div>
           </motion.div>
        </div>
      )}
      </AnimatePresence>
    </div>
  );
};

export default PublicDashboard;
