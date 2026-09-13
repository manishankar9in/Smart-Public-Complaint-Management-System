import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { api } from "../utils/api";
import { fetchAdminComplaints } from "../services/complaintService";
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  ArrowRight,
  TrendingUp,
  Activity,
  Layers,
  ChevronDown,
  ExternalLink,
  MapPin,
  X,
  RefreshCcw,
  Trash2,
  MoreVertical,
  Users,
  UserCheck,
  MessageSquare,
  Star,
  Loader2,
} from "lucide-react";
import { Card, StatsCard, Badge } from "../components/UI";
import PriorityBadge from "../components/PriorityBadge";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { dutyMatchesCategory, workerMatchesComplaint, ADMIN_PROCESSING_STATUSES, isAdminProcessingComplaint } from "../data/categoryMapping";
import { sendNotification } from "../services/emailService";
import { INDIAN_STATES_WITH_DISTRICTS, getDistrictsForState, getAllStates } from "../data/indianStatesDistricts";
// Removed react-leaflet map usage per UI update (maps replaced with links/lists)

const AdminDashboard = () => {
  const [complaints, setComplaints] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [adminResponseToWorker, setAdminResponseToWorker] = useState("");
  const [adminResponseToCitizen, setAdminResponseToCitizen] = useState("");
  const [adminResponseImageUrl, setAdminResponseImageUrl] = useState("");
  const [slaConfig, setSlaConfig] = useState({ Critical: 2, High: 6, Medium: 24, Low: 72 });
  const [departments, setDepartments] = useState([]);
  const [newDepartment, setNewDepartment] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [addressFilter, setAddressFilter] = useState("");
  const [activeSection, setActiveSection] = useState("dashboard");
  const [feedbackList, setFeedbackList] = useState([]);
  const dashboardRef = useRef(null);
  const workersRef = useRef(null);
  const complaintsRef = useRef(null);
  const feedbackRef = useRef(null);

  // Workers Directory State
  const [workerSearch, setWorkerSearch] = useState("");
  const [workerStateFilter, setWorkerStateFilter] = useState("all");
  const [workerCityFilter, setWorkerCityFilter] = useState("all");

  // Worker Assignment Modal Search State
  const [modalWorkerSearch, setModalWorkerSearch] = useState("");
  const [modalWorkerState, setModalWorkerState] = useState("");
  const [modalWorkerCity, setModalWorkerCity] = useState("");
  const [filterByCategoryOnly, setFilterByCategoryOnly] = useState(true);

  // Eligible workers & audit result fetched from backend for the selected complaint
  const [eligibleWorkers, setEligibleWorkers] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [assignmentAudit, setAssignmentAudit] = useState(null);

  useEffect(() => {
    fetchComplaints();
    fetchWorkers();
    fetchAdminConfig();
    fetchFeedback();
  }, []);

  const fetchFeedback = async () => {
    try {
      const res = await api.get("/admin/feedback");
      setFeedbackList(res.data || []);
    } catch {
      setFeedbackList([]);
    }
  };

  const markFeedbackReviewed = async (feedbackId) => {
    try {
      await api.put(`/admin/feedback/${feedbackId}/review`, { admin_note: "Reviewed by admin" });
      toast.success("Feedback marked as reviewed.");
      fetchFeedback();
    } catch {
      toast.error("Failed to update feedback.");
    }
  };

  const fetchWorkers = async () => {
    try {
      const res = await api.get("/admin/workers");
      setWorkers(res.data || []);
    } catch (err) {
      console.error("Workers fetch error:", err?.response?.data || err);
      toast.error("Failed to load workers.");
      setWorkers([]);
    }
  };

  const fetchComplaints = async () => {
    try {
      const list = await fetchAdminComplaints();
      setComplaints(list);
    } catch (err) {
      console.error("Admin complaints fetch error:", err?.response?.data || err);
      toast.error("Failed to load complaints.");
      setComplaints([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchAdminConfig = async () => {
    try {
      const [slaRes, deptRes] = await Promise.all([
        api.get(`/admin/sla-config`),
        api.get(`/admin/departments`)
      ]);
      setSlaConfig(slaRes.data || { Critical: 2, High: 6, Medium: 24, Low: 72 });
      setDepartments(deptRes.data || []);
    } catch (err) {
      // keep dashboard usable even if config endpoints fail
    }
  };

  const saveSlaConfig = async () => {
    try {
      await api.put(`/admin/sla-config`, slaConfig);
      toast.success("SLA configuration updated.");
    } catch {
      toast.error("Failed to update SLA config.");
    }
  };

  const addDepartment = async () => {
    if (!newDepartment.trim()) return;
    try {
      await api.post(`/admin/departments`, { name: newDepartment.trim() });
      setNewDepartment("");
      fetchAdminConfig();
      toast.success("Department created.");
    } catch {
      toast.error("Failed to create department.");
    }
  };

  const handleAdminResponsePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setAdminResponseImageUrl("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setAdminResponseImageUrl(String(reader.result || ""));
    reader.onerror = () => setAdminResponseImageUrl("");
    reader.readAsDataURL(file);
  };

  const activeComplaints = useMemo(
    () => complaints.filter(isAdminProcessingComplaint),
    [complaints]
  );

  const stats = useMemo(() => ({
    inQueue: activeComplaints.length,
    pending: activeComplaints.filter((c) => c.status === "PENDING_ADMIN_VERIFY").length,
    inField: activeComplaints.filter((c) => ["ASSIGNED_TO_WORKER", "IN_PROGRESS"].includes(c.status)).length,
    awaitingAudit: activeComplaints.filter((c) => c.status === "WORKER_COMPLETED").length,
    critical: activeComplaints.filter((c) => c.priority_level === "Critical").length,
    reopened: activeComplaints.filter((c) => c.status === "REOPENED").length,
    resolved: complaints.filter((c) => c.status === "RESOLVED").length,
    totalWorkers: workers.length,
    activeWorkers: workers.filter((w) => (w.active_tasks || 0) > 0).length,
  }), [activeComplaints, complaints, workers]);

  const stateOptions = useMemo(() => getAllStates(), []);

  const workerSummary = useMemo(() => ({
    total: workers.length,
    withGps: workers.filter((w) => (w.latitude || w.gps_lat) && (w.longitude || w.gps_long)).length,
    busy: workers.filter((w) => Number(w.active_tasks || 0) > 0).length,
  }), [workers]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((worker) => {
      const searchText = `${worker.name} ${worker.email} ${worker.state} ${worker.city} ${worker.ward} ${worker.street} ${worker.department || ""}`.toLowerCase();
      const matchesSearch = !workerSearch || searchText.includes(workerSearch.toLowerCase());
      const matchesState = workerStateFilter === "all" || String(worker.state || "").toLowerCase() === workerStateFilter.toLowerCase();
      const matchesCity = workerCityFilter === "all" || String(worker.city || "").toLowerCase() === workerCityFilter.toLowerCase();
      return matchesSearch && matchesState && matchesCity;
    });
  }, [workers, workerSearch, workerStateFilter, workerCityFilter]);

  const handleSectionScroll = (section) => {
    const refs = {
      dashboard: dashboardRef,
      workers: workersRef,
      complaints: complaintsRef,
      feedback: feedbackRef,
    };
    const target = refs[section]?.current;
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setActiveSection(section);
  };

  const cityOptions = useMemo(() => {
    const set = new Set(
      activeComplaints.map((c) => (c.city || "").trim()).filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeComplaints]);
  const categoryOptions = useMemo(() => {
    const set = new Set(activeComplaints.map((c) => (c.category || "").trim()).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeComplaints]);

  const statusMatchesFilter = (c, statusFilter) => {
    const st = String(c.status || "").toUpperCase();
    if (statusFilter === "all") return true;
    if (statusFilter === "VERIFIED") {
      return st === "VERIFIED";
    }
    return st === String(statusFilter).toUpperCase();
  };

  const handleAssignWorker = async (complaintId, workerId) => {
    try {
      await api.put(`/admin/assign-worker/${complaintId}`, { worker_uid: workerId });
      toast.success("Worker assigned successfully.");
      setShowAssignmentModal(false);
      setSelectedComplaint(null);
      setSelectedWorker(null);
      setAssignmentAudit(null);
      fetchComplaints();
    } catch (err) {
      toast.error("Assignment failed: " + (err.response?.data?.detail || err.message || "Network error"));
    }
  };

  const openAssignmentModal = async (complaint) => {
    setSelectedComplaint(complaint);
    setModalWorkerSearch("");
    setModalWorkerState("");
    setModalWorkerCity("");
    setFilterByCategoryOnly(true);
    setSelectedWorker(null);
    setEligibleWorkers([]);
    setAssignmentAudit(null);
    setShowAssignmentModal(true);
    
    // Fetch strict automated audit result from backend (State -> District -> Dept -> Avail -> GPS Distance)
    setEligibleLoading(true);
    try {
      const res = await api.get(`/admin/eligible-workers/${complaint._id}`);
      const data = res.data;
      setAssignmentAudit(data);
      const list = data?.eligible_workers || [];
      setEligibleWorkers(list);
      if (data?.nearest_worker) {
        setSelectedWorker(data.nearest_worker);
      } else if (list.length > 0) {
        setSelectedWorker(list[0]);
      }
    } catch (err) {
      console.warn("Failed to audit eligible workers:", err);
      toast.warn("Could not audit eligible workers for this complaint.");
      setAssignmentAudit(null);
      setEligibleWorkers([]);
    } finally {
      setEligibleLoading(false);
    }
  };

  const getWorkersForComplaint = (complaint) => {
    if (!complaint) return [];
    return workers
      .filter((worker) => workerMatchesComplaint(worker, complaint))
      .sort((a, b) => (a.active_tasks || 0) - (b.active_tasks || 0));
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const getNearestWorkers = (complaint, maxDistance = 10) => {
    if (!complaint || !complaint.gps_lat || !complaint.gps_long) return [];
    return workers
      .filter(worker => (worker.latitude || worker.gps_lat) && (worker.longitude || worker.gps_long))
      .map(worker => ({
        ...worker,
        distance: calculateDistance(
          complaint.gps_lat, complaint.gps_long,
          worker.latitude || worker.gps_lat,
          worker.longitude || worker.gps_long
        )
      }))
      .filter(worker => worker.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
  };

  const handleVerify = async (id) => {
    try {
      // Only verify + AI score — do NOT auto-assign.
      // Admin must open the assignment modal and pick ONE eligible worker.
      const res = await api.put(`/admin/verify/${id}`, { status: "VERIFIED" });
      toast.success(
        `Complaint verified. Priority: ${res.data?.priority || "Scored"}. ` +
        "Please assign an eligible worker via 'Assign Worker'."
      );
      fetchComplaints();
    } catch (err) {
      toast.error(
        "Verification failed: " + (err.response?.data?.detail || err.response?.data || err.message || "Network Error")
      );
    }
  };

  // handleAssignOnly retained for any legacy call-sites, now simply opens the modal
  const handleAssignOnly = (id) => {
    const c = complaints.find((comp) => comp._id === id);
    if (c) openAssignmentModal(c);
  };

  const openAuditModal = (c) => {
    setSelectedAudit(c);
    setAdminResponseToWorker(c.admin_rejection_reason || c.admin_note || "");
    setAdminResponseToCitizen(c.admin_response_message || "");
    setAdminResponseImageUrl("");
  };

  const handleAuditSolution = async (id, approve) => {
    try {
      if (!adminResponseToWorker.trim()) {
        return toast.error("Please enter admin response for worker.");
      }

      if (approve) {
        if (!adminResponseToCitizen.trim()) {
          return toast.error("Please enter the resolution message for the citizen.");
        }
        if (!adminResponseImageUrl) {
          return toast.error("Please upload the resolution photo for the citizen response.");
        }
      } else {
        if (!adminResponseToCitizen.trim()) {
          return toast.error("Please enter the message for the citizen when reopening.");
        }
      }

       // 1) Update complaint status in backend first
       await api.put(`/admin/verify-solution/${id}?approve=${approve}`, {
          admin_note: adminResponseToWorker || "Integrity audit complete.",
          admin_response_message: adminResponseToCitizen || "Integrity audit complete.",
          admin_response_image_url: adminResponseImageUrl || null
       });
       
       const c = complaints.find(comp => comp._id === id);
       // 2) Email notification (non-blocking)
       if (approve) {
         try {
           await sendNotification("PROBLEM_SOLVED", {
             to_email: c?.citizen_email || c?.email || "citizen@authority.in",
             name: c?.citizen_name || "Citizen",
             complaint_id: id,
             category: c?.category,
             address: c?.address,
             message: adminResponseToCitizen || "Your complaint has been resolved by the municipal authority.",
             photo_url: adminResponseImageUrl || c?.worker_proof_image_url
           });
         } catch (emailErr) {
           console.warn("EmailJS notification failed:", emailErr);
           toast.warn("Mission updated, but email notification failed.");
         }
       } else {
         try {
           await sendNotification("REOPENED", {
             to_email: c?.citizen_email || c?.email || "citizen@authority.in",
             name: c?.citizen_name || "Citizen",
             complaint_id: id,
             category: c?.category,
             address: c?.address,
             message: adminResponseToCitizen || "Your complaint has been reopened for further review."
           });
         } catch (emailErr) {
           console.warn("EmailJS notification failed:", emailErr);
           toast.warn("Mission reopened, but email notification failed.");
         }
       }

      toast.success(approve ? "Complaint resolved and removed from processing queue." : "Complaint reopened for processing.");
       setSelectedAudit(null);
       setAdminResponseToWorker("");
       setAdminResponseToCitizen("");
       setAdminResponseImageUrl("");
       if (approve) {
         setComplaints((prev) => prev.filter((comp) => comp._id !== id));
       } else {
         fetchComplaints();
       }
    } catch (err) {
       toast.error(
         "Audit protocol failed: " +
           (err.response?.data?.detail || err.response?.data || err.message || "Network Error")
       );
    }
  };

  const filteredComplaints = activeComplaints.filter((c) => {
    if (!statusMatchesFilter(c, filter)) return false;
    const q = searchQuery.toLowerCase().trim();
    const searchable = `${c.category} ${c.address} ${c.village} ${c.street} ${c.city || ""} ${c.state || ""}`.toLowerCase();
    const matchesSearch = !q || searchable.includes(q);
    const stateOk = stateFilter === "all" || String(c.state || "").toLowerCase() === stateFilter.toLowerCase();
    const regionOk =
      regionFilter === "all" ||
      String(c.city || "").toLowerCase() === regionFilter.toLowerCase();
    const categoryOk = categoryFilter === "all" || String(c.category || "").toLowerCase() === categoryFilter.toLowerCase();
    const priorityOk = priorityFilter === "all" || String(c.priority_level || "").toLowerCase() === priorityFilter.toLowerCase();
    const addressOk = !addressFilter || searchable.includes(addressFilter.toLowerCase());
    return matchesSearch && stateOk && regionOk && categoryOk && priorityOk && addressOk;
  });

  const sortedFilteredComplaints = useMemo(() => {
    const priorityWeight = {
      "critical": 4,
      "high": 3,
      "medium": 2,
      "low": 1
    };
    return [...filteredComplaints].sort((a, b) => {
      const weightA = priorityWeight[String(a.priority_level || "").toLowerCase()] || 0;
      const weightB = priorityWeight[String(b.priority_level || "").toLowerCase()] || 0;
      if (weightB !== weightA) {
        return weightB - weightA;
      }
      const scoreA = Number(a.priority_score || 0);
      const scoreB = Number(b.priority_score || 0);
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return String(b._id).localeCompare(String(a._id));
    });
  }, [filteredComplaints]);

  // Workers Directory Filtered List
  const filteredWorkersList = useMemo(() => {
    return workers.filter((w) => {
      const q = workerSearch.toLowerCase().trim();
      const nameMatch = !q || 
        String(w.name || "").toLowerCase().includes(q) || 
        String(w.email || "").toLowerCase().includes(q) ||
        String(w.phone || "").toLowerCase().includes(q) ||
        String(w.department || "").toLowerCase().includes(q);
      const stateMatch = workerStateFilter === "all" || String(w.state || "").toLowerCase() === workerStateFilter.toLowerCase();
      const cityMatch = workerCityFilter === "all" || String(w.city || "").toLowerCase() === workerCityFilter.toLowerCase();
      return nameMatch && stateMatch && cityMatch;
    });
  }, [workers, workerSearch, workerStateFilter, workerCityFilter]);

  const handleWorkerStateChange = (stateVal) => {
    setWorkerStateFilter(stateVal);
    setWorkerCityFilter("all");
  };

  const workerStates = useMemo(() => {
    return getAllStates();
  }, []);

  const workerCities = useMemo(() => {
    if (workerStateFilter === "all") return [];
    return getDistrictsForState(workerStateFilter);
  }, [workerStateFilter]);

  // Modal Filtered Workers — uses eligibleWorkers from backend (already filtered by dept+location+availability)
  const modalFilteredWorkers = useMemo(() => {
    if (!selectedComplaint) return [];
    const norm = (s) => String(s || "").trim().toLowerCase();
    return eligibleWorkers.filter((w) => {
      // Additional client-side state/city filters if admin wants to narrow down
      if (modalWorkerState && norm(w.state) !== norm(modalWorkerState)) return false;
      if (modalWorkerCity && norm(w.city) !== norm(modalWorkerCity)) return false;
      const q = modalWorkerSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        norm(w.name).includes(q) ||
        norm(w.email).includes(q) ||
        norm(w.department).includes(q)
      );
    });
  }, [eligibleWorkers, selectedComplaint, modalWorkerSearch, modalWorkerState, modalWorkerCity]);

  const recommendedWorkers = useMemo(() => {
    // Show top 3 eligible workers (already sorted by fewest active tasks from backend)
    return eligibleWorkers.slice(0, 3);
  }, [eligibleWorkers]);

  const exportAuditCsv = () => {
    const rows = filteredComplaints;
    const header = ["id", "category", "city", "status", "priority", "worker_uid", "address"];
    const lines = [
      header.join(","),
      ...rows.map((c) =>
        [
          c._id,
          `"${String(c.category || "").replace(/"/g, '""')}"`,
          `"${String(c.city || "").replace(/"/g, '""')}"`,
          c.status,
          c.priority_level || "",
          c.worker_uid || "",
          `"${String(c.address || "").replace(/"/g, '""')}"`,
        ].join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `complaint-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded.");
  };

  return (
    <div className="page-shell theme-admin w-full p-3 sm:p-4">
      <div className="page-container space-y-4 pb-12">
        {/* Admin Header */}
        <div className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-black text-black sm:text-2xl">Admin Dashboard</h1>
            <p className="text-xs text-slate-600">Complaints · Workers · Verify resolutions</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setLoading(true); fetchComplaints(); fetchWorkers(); fetchFeedback(); }}
              className="btn-secondary cursor-pointer px-3 py-2 text-xs"
            >
              <RefreshCcw size={14} /> Refresh
            </button>
            <button type="button" onClick={exportAuditCsv} className="btn-primary cursor-pointer px-3 py-2 text-xs">
              Export CSV
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
            {[
              { key: 'dashboard', label: 'Overview' },
              { key: 'workers', label: 'Workers' },
              { key: 'complaints', label: 'Processing Queue' },
              { key: 'feedback', label: 'Citizen Feedback' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleSectionScroll(item.key)}
                className={`cursor-pointer rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wide transition-all ${
                  activeSection === item.key
                    ? 'bg-blue-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
        </div>

        {/* KPI Section — active processing only */}
        <div ref={dashboardRef} className="grid grid-cols-2 gap-2 lg:grid-cols-6">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
            <Layers size={22} className="mx-auto mb-1 text-blue-700" />
            <p className="text-xl font-black text-blue-900">{stats.inQueue}</p>
            <p className="text-[10px] font-bold uppercase text-blue-800">In Queue</p>
          </div>
          <div className="rounded-xl border border-pink-200 bg-pink-50 p-3 text-center">
            <Clock size={22} className="mx-auto mb-1 text-pink-700" />
            <p className="text-xl font-black text-pink-900">{stats.pending}</p>
            <p className="text-[10px] font-bold uppercase text-pink-800">Pending</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
            <Activity size={22} className="mx-auto mb-1 text-amber-700" />
            <p className="text-xl font-black text-amber-900">{stats.inField}</p>
            <p className="text-[10px] font-bold uppercase text-amber-800">In Field</p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-center">
            <CheckCircle size={22} className="mx-auto mb-1 text-green-800" />
            <p className="text-xl font-black text-green-900">{stats.awaitingAudit}</p>
            <p className="text-[10px] font-bold uppercase text-green-800">Needs Audit</p>
          </div>
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-center">
            <Users size={22} className="mx-auto mb-1 text-purple-700" />
            <p className="text-xl font-black text-purple-900">{stats.totalWorkers}</p>
            <p className="text-[10px] font-bold uppercase text-purple-800">Workers</p>
          </div>
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-center">
            <UserCheck size={22} className="mx-auto mb-1 text-cyan-700" />
            <p className="text-xl font-black text-cyan-900">{stats.activeWorkers}</p>
            <p className="text-[10px] font-bold uppercase text-cyan-800">Active</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { key: "all", label: "All Active", count: stats.inQueue, color: "border-slate-200 bg-white" },
            { key: "PENDING_ADMIN_VERIFY", label: "Pending Verify", count: stats.pending, color: "border-pink-200 bg-pink-50" },
            { key: "VERIFIED", label: "Verified", count: activeComplaints.filter((c) => c.status === "VERIFIED").length, color: "border-indigo-200 bg-indigo-50" },
            { key: "ASSIGNED_TO_WORKER", label: "Assigned", count: activeComplaints.filter((c) => c.status === "ASSIGNED_TO_WORKER").length, color: "border-blue-200 bg-blue-50" },
            { key: "WORKER_COMPLETED", label: "Needs Audit", count: stats.awaitingAudit, color: "border-green-200 bg-green-50" },
            { key: "REOPENED", label: "Reopened", count: stats.reopened, color: "border-red-200 bg-red-50" },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setFilter(item.key)}
              className={`cursor-pointer rounded-lg border p-2 text-left transition-all ${
                filter === item.key ? "ring-2 ring-blue-600" : ""
              } ${item.color}`}
            >
              <p className="text-lg font-black text-black">{item.count}</p>
              <p className="text-[9px] font-bold uppercase text-slate-700">{item.label}</p>
            </button>
          ))}
        </div>


        {/* Field Workers Directory Section */}
        <div ref={workersRef} className="rounded-[32px] bg-white border border-slate-100 p-8 shadow-sm">
          <div className="mb-8 flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h3 className="text-2xl font-black text-black">Field Workers Directory</h3>
              <p className="text-xs font-bold text-pink-700 uppercase tracking-widest mt-1">Directory of Registered Response Staff</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              {/* Search */}
              <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs">
                <Search size={16} className="text-slate-500 mr-2" />
                <input
                  type="text"
                  placeholder="Search workers name, duty..."
                  className="bg-transparent text-xs font-medium tracking-wide text-black outline-none placeholder:text-slate-400 w-48"
                  value={workerSearch}
                  onChange={(e) => setWorkerSearch(e.target.value)}
                />
              </div>
              {/* State Filter */}
              <select
                value={workerStateFilter}
                onChange={(e) => handleWorkerStateChange(e.target.value)}
                className="input-field rounded-2xl px-4 py-2 text-xs w-40"
              >
                <option value="all">All States</option>
                {workerStates.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
              {/* City/District Filter */}
              <select
                value={workerCityFilter}
                onChange={(e) => setWorkerCityFilter(e.target.value)}
                className="input-field rounded-2xl px-4 py-2 text-xs w-40"
                disabled={workerStateFilter === "all"}
              >
                <option value="all">All Cities</option>
                {workerStateFilter !== "all" && workerCities.map((ct) => (
                  <option key={ct} value={ct}>{ct}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs font-black uppercase tracking-widest">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left p-4 font-black text-slate-700">Worker</th>
                  <th className="text-left p-4 font-black text-slate-700">Duty / Department</th>
                  <th className="text-left p-4 font-black text-slate-700">Location Area</th>
                  <th className="text-left p-4 font-black text-slate-700">Contact</th>
                  <th className="text-center p-4 font-black text-slate-700">Active Tasks</th>
                  <th className="text-center p-4 font-black text-slate-700">Solved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredWorkersList.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-8 py-16 text-center text-slate-400">
                      No registered workers match the search filters.
                    </td>
                  </tr>
                ) : (
                  filteredWorkersList.map((worker) => (
                    <tr key={worker.worker_uid || worker._id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-800 text-sm font-black">
                            {String(worker.name || "W").charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-xs font-black text-black">{worker.name}</p>
                            <p className="text-[9px] text-slate-500 lowercase mt-0.5">{worker.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="inline-block rounded-lg bg-pink-50 border border-pink-100 px-2 py-1 text-[9px] font-bold text-pink-700">
                          {worker.department || "General Force"}
                        </span>
                      </td>
                      <td className="p-4">
                        <p className="text-[10px] font-bold text-black">{worker.state || "—"}</p>
                        <p className="text-[10px] font-bold text-black">{worker.city || "—"}</p>
                        <p className="text-[9px] text-slate-500">{worker.ward || worker.street || "—"}</p>
                      </td>
                      <td className="p-4 text-[10px] font-bold text-black">
                        {worker.phone || "—"}
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-black ${
                          worker.active_tasks > 3 ? 'bg-red-100 text-red-800' :
                          worker.active_tasks > 0 ? 'bg-amber-100 text-amber-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {worker.active_tasks || 0}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-flex items-center justify-center rounded-full bg-green-100 px-2.5 py-1 text-xs font-black text-green-800">
                          {worker.solved_count || 0}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Citizen Feedback Section */}
        <div ref={feedbackRef} className="rounded-[32px] border border-slate-100 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-xl font-black text-black sm:text-2xl">Citizen Feedback</h3>
              <p className="text-[10px] font-bold uppercase tracking-widest text-pink-700">
                Reviews &amp; unresolved issue reports from citizens
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black text-amber-800">
              <MessageSquare size={12} />
              {feedbackList.filter((f) => !f.admin_reviewed).length} need review
            </span>
          </div>

          {feedbackList.filter((f) => !f.admin_reviewed).length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No citizen feedback yet.</p>
          ) : (
            <div className="space-y-3">
              {feedbackList.filter((fb) => !fb.admin_reviewed).map((fb) => (
                <div
                  key={fb._id}
                  className={`rounded-xl border p-4 ${
                    !fb.solved && !fb.admin_reviewed
                      ? "border-red-200 bg-red-50/50"
                      : fb.admin_reviewed
                      ? "border-slate-200 bg-slate-50"
                      : "border-green-200 bg-green-50/30"
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${
                          fb.solved ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}>
                          {fb.solved ? "Resolved" : "Issue Reported"}
                        </span>
                        <span className="flex items-center gap-0.5 text-amber-600">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} size={12} className={n <= (fb.rating || 0) ? "fill-amber-500" : "text-slate-300"} />
                          ))}
                        </span>
                        {fb.admin_reviewed && (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800">Reviewed</span>
                        )}
                      </div>
                      <p className="text-sm text-black">{fb.comment || "No comment provided."}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
                        <span>Complaint: {fb.complaint_category || "—"}</span>
                        <span>{fb.complaint_city || "—"}, {fb.complaint_state || "—"}</span>
                        {fb.worker_name && <span>Worker: {fb.worker_name}</span>}
                        {fb.timestamp && <span>{new Date(fb.timestamp).toLocaleString()}</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {fb.complaint_id && (
                        <Link to={`/complaint/${fb.complaint_id}`} className="btn-secondary cursor-pointer px-3 py-1.5 text-[10px]">
                          View
                        </Link>
                      )}
                      {!fb.admin_reviewed && (
                        <button
                          type="button"
                          onClick={() => markFeedbackReviewed(fb._id)}
                          className="btn-primary cursor-pointer px-3 py-1.5 text-[10px]"
                        >
                          Mark Reviewed
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Processing Queue */}
        <div ref={complaintsRef} className="surface-card overflow-hidden !p-0">
          <div className="border-b border-slate-200 bg-blue-50 p-3 sm:p-4">
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-black uppercase text-blue-900">Active Processing Queue</h3>
                <p className="text-[10px] text-slate-600">Resolved complaints auto-removed · Urgent = Critical/High priority</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                <Search size={14} className="shrink-0 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full bg-transparent text-xs outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <select className="input-field min-h-[36px] cursor-pointer text-xs" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
                <option value="all">All States</option>
                {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="input-field min-h-[36px] cursor-pointer text-xs" value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
                <option value="all">All Cities</option>
                {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input-field min-h-[36px] cursor-pointer text-xs" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="all">All Priority</option>
                <option value="critical">Critical (Urgent)</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>

            <div className="mt-2 flex flex-wrap gap-1">
              {["all", ...ADMIN_PROCESSING_STATUSES].map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFilter(status)}
                  className={`cursor-pointer rounded-md px-2 py-1 text-[9px] font-bold uppercase ${
                    filter === status ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {status === "all" ? "All" : status.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-bold uppercase text-slate-600">
                  <th className="p-3">ID</th>
                  <th className="p-3">Category</th>
                  <th className="p-3">Location</th>
                  <th className="p-3">Priority</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Worker</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedFilteredComplaints.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-sm text-slate-500">
                      No active complaints. Resolved issues are cleared automatically.
                    </td>
                  </tr>
                ) : (
                  sortedFilteredComplaints.map((c) => (
                    <tr key={c._id} className="hover:bg-blue-50/50">
                      <td className="p-3 font-mono text-[10px] font-bold">#{String(c._id).slice(-6).toUpperCase()}</td>
                      <td className="p-3">
                        <p className="font-semibold text-black">{c.category}</p>
                        {c.custom_department && (
                          <p className="text-[10px] text-indigo-700 font-medium truncate max-w-[160px]">Custom: {c.custom_department}</p>
                        )}
                        {c.department && c.category === "Other" && (
                          <p className="text-[9px] text-green-800 font-bold uppercase">→ {c.department}</p>
                        )}
                        {c.sla_deadline && new Date(c.sla_deadline) < new Date() && (
                          <span className="mt-0.5 inline-block rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-800">URGENT · SLA Overdue</span>
                        )}
                      </td>
                      <td className="p-3 max-w-[180px]">
                        <p className="truncate font-medium text-slate-800">{c.address || "—"}</p>
                        <p className="truncate text-[10px] text-slate-500">{[c.village, c.city, c.state].filter(Boolean).join(", ")}</p>
                      </td>
                      <td className="p-3">
                        {c.priority_level ? <PriorityBadge priority={c.priority_level} /> : "—"}
                      </td>
                      <td className="p-3">
                        <Badge variant={c.status === "REOPENED" ? "danger" : c.status === "WORKER_COMPLETED" ? "success" : "primary"}>
                          {String(c.status).replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="p-3 text-[10px]">
                        {c.worker_uid ? `Unit #${String(c.worker_uid).slice(-4).toUpperCase()}` : <span className="italic text-slate-400">Unassigned</span>}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap justify-end gap-1">
                          {c.status === "PENDING_ADMIN_VERIFY" && (
                            <button type="button" onClick={() => handleVerify(c._id)} className="btn-primary cursor-pointer !px-2 !py-1 text-[9px]">Verify</button>
                          )}
                          {c.status === "VERIFIED" && (
                            <button type="button" onClick={() => openAssignmentModal(c)} className="btn-primary cursor-pointer !px-2 !py-1 text-[9px]">Audit / Assign</button>
                          )}
                          {(c.status === "REOPENED" || c.status === "ESCALATED") && (
                            <button type="button" onClick={() => openAssignmentModal(c)} className="btn-primary cursor-pointer !px-2 !py-1 text-[9px]">Audit / Reassign</button>
                          )}
                          {c.status === "WORKER_COMPLETED" && (
                            <button type="button" onClick={() => openAuditModal(c)} className="btn-primary cursor-pointer !px-2 !py-1 text-[9px]">Audit Resolution</button>
                          )}
                          <Link to={`/complaint/${c._id}`} className="btn-secondary cursor-pointer !px-2 !py-1 text-[9px]">View</Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      {/* Comparison Audit Modal */}
      <AnimatePresence>
      {selectedAudit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
           <motion.div 
             initial={{ scale: 0.95, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             exit={{ scale: 0.95, opacity: 0 }}
             className="w-full max-w-5xl overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-premium"
           >
              <div className="flex max-h-[85vh] min-h-[520px] flex-col overflow-y-auto lg:h-[600px] lg:flex-row">
                 {/* Visual Evidence Section */}
                 <div className="relative w-full bg-slate-50 lg:w-1/2">
                    <div className="h-full flex flex-col">
                       {/* Top - Citizen Proof */}
                       <div className="flex-1 relative group">
                          {selectedAudit.proof_image_url ? (
                          <img src={selectedAudit.proof_image_url} alt="Original" className="w-full h-full object-cover opacity-80" />
                          ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[10px] font-bold uppercase text-red-700">No citizen image</div>
                          )}
                          <div className="absolute top-8 left-8">
                             <Badge variant="primary" className="!border-blue-300 !bg-blue-100 !px-4 !py-2 !text-blue-900 shadow-md">Original Citizen Intake</Badge>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center bg-white/85 opacity-0 transition-opacity group-hover:opacity-100">
                             <p className="text-[10px] font-black uppercase tracking-widest text-black">Site condition during submission</p>
                          </div>
                       </div>
                       
                       {/* Bottom - Worker Proof */}
                       <div className="flex-1 relative group border-t border-white/10">
                          {selectedAudit.worker_proof_image_url ? (
                          <img
                            src={selectedAudit.worker_proof_image_url}
                            alt="Resolved"
                            className="w-full h-full object-cover"
                          />
                          ) : (
                          <div className="flex h-full w-full items-center justify-center bg-slate-100 text-[10px] font-bold uppercase text-green-800">No worker proof yet</div>
                          )}
                          <div className="absolute top-8 left-8">
                             <Badge variant="success" className="!border-green-300 !bg-green-100 !px-4 !py-2 !text-green-900 shadow-md">Field Resolution Proof</Badge>
                          </div>
                          <div className="absolute inset-x-0 bottom-8 px-8 flex justify-between items-end">
                             <div className="rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-md backdrop-blur-sm">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-black">Sensor Authenticity</p>
                                <div className="mt-1 flex items-center gap-3 text-[10px] font-bold text-green-800">
                                   <span className="flex items-center gap-1.5"><CheckCircle size={14} className="text-success"/> GPS Locked</span>
                                   <span>
                                     {selectedAudit.worker_gps_lat?.toFixed(4)}, {selectedAudit.worker_gps_long?.toFixed(4)}
                                   </span>
                                </div>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>

                 {/* Audit Control Section */}
                 <div className="flex w-full flex-col p-6 sm:p-8 lg:w-1/2 lg:p-12">
                    <div className="flex justify-between items-start mb-10">
                       <div>
                          <h2 className="text-3xl font-black text-secondary tracking-tight">Final Resolution Review</h2>
                          <p className="text-[10px] text-muted font-bold tracking-[0.2em] uppercase mt-2">Administrative Verification</p>
                       </div>
                       <button
                         onClick={() => {
                           setSelectedAudit(null);
                           setAdminResponseToWorker("");
                           setAdminResponseToCitizen("");
                           setAdminResponseImageUrl("");
                         }}
                         className="w-12 h-12 rounded-2xl bg-slate-50 text-muted flex items-center justify-center hover:bg-red-50 hover:text-danger transition-all"
                       >
                          <X size={24} />
                       </button>
                    </div>

                    <div className="flex-1 space-y-8 overflow-y-auto pr-4 no-scrollbar">
                       <Card className="!p-6 bg-slate-50/50 border-0 shadow-inner">
                          <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-3">Case Details</p>
                          <div className="space-y-2 text-[10px] font-bold uppercase tracking-widest text-secondary/70">
                            <p>Citizen: {selectedAudit.citizen_name || "Citizen"} ({selectedAudit.citizen_email || "email unavailable"})</p>
                            <p>Worker UID: {selectedAudit.worker_uid || "Not assigned"}</p>
                            <p>Location: {selectedAudit.state || "-"}, {selectedAudit.city || "-"}, {selectedAudit.ward || "-"}</p>
                          </div>
                        </Card>

                        <Card className="!p-6 bg-slate-50/50 border-0 shadow-inner">
                          <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-2">Worker Resolution Note</p>
                          <p className="text-xs font-bold italic leading-relaxed text-secondary/70">
                             "{selectedAudit.worker_note || "No notes provided by unit."}"
                          </p>
                       </Card>

                       <div className="space-y-4">
                          <label className="block text-[10px] font-black uppercase tracking-widest text-muted ml-1">Admin Response To Worker</label>
                          <textarea 
                            className="input-field min-h-[120px]"
                            placeholder="Write instructions/remarks for worker (used when reopening)."
                            value={adminResponseToWorker}
                            onChange={(e) => setAdminResponseToWorker(e.target.value)}
                          />

                          <label className="block text-[10px] font-black uppercase tracking-widest text-muted ml-1">Admin Response To Citizen</label>
                          <textarea
                            className="input-field min-h-[100px]"
                            placeholder="Write final response message for citizen."
                            value={adminResponseToCitizen}
                            onChange={(e) => setAdminResponseToCitizen(e.target.value)}
                          />

                          <div className="space-y-3">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-muted ml-1">
                              Resolution Photo (Citizen Response)
                            </label>
                            <input
                              type="file"
                              accept="image/*"
                              className="w-full text-[10px] text-muted"
                              onChange={handleAdminResponsePhotoChange}
                            />
                            {adminResponseImageUrl && (
                              <img
                                src={adminResponseImageUrl}
                                alt="Admin response preview"
                                className="w-full max-h-48 object-cover rounded-2xl border border-slate-100"
                              />
                            )}
                          </div>
                       </div>

                       <div className="bg-amber-50 rounded-2xl p-4 flex gap-3 border border-amber-100">
                           <AlertCircle className="text-warning mt-0.5 flex-shrink-0" size={18} />
                           <div className="space-y-1">
                             <p className="text-[10px] text-amber-800 font-bold uppercase tracking-widest leading-relaxed italic">
                                Warning: Confirming closure will mark this complaint as RESOLVED.
                             </p>
                             <p className="text-[10px] text-slate-600 leading-relaxed">
                                Worker proof image will be automatically sent to the citizen as resolution evidence. Upload a photo above to override it.
                             </p>
                             <p className="text-[10px] text-slate-600 leading-relaxed">
                                All notifications for this complaint will be cleared from all dashboards upon resolution.
                             </p>
                           </div>
                       </div>
                    </div>

                     <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <button 
                          onClick={() => handleAuditSolution(selectedAudit._id, false)}
                          className="btn-secondary !bg-red-50 !text-danger !border-red-100 hover:!bg-red-100 transition-all shadow-sm"
                        >
                           Reject and Reopen
                        </button>
                        <button 
                          onClick={() => handleAuditSolution(selectedAudit._id, true)}
                          className="btn-primary !bg-success shadow-green-100"
                        >
                           Verify Resolution
                        </button>
                     </div>
                 </div>
              </div>
           </motion.div>
        </div>
      )}
      </AnimatePresence>

      {/* Worker Assignment & Automated Audit Modal */}
      <AnimatePresence>
      {showAssignmentModal && selectedComplaint && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 sm:p-6 backdrop-blur-sm">
            <motion.div 
               initial={{ opacity: 0, scale: 0.96, y: 30 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.96, y: 30 }}
               className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white shadow-2xl"
            >
               <div className="p-6 sm:p-10 space-y-6">
                  {/* Modal Header */}
                  <div className="flex justify-between items-start border-b border-slate-100 pb-5">
                     <div>
                        <div className="flex items-center gap-2">
                           <ShieldCheck className="text-blue-600" size={24} />
                           <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-black">
                              Complaint Assignment &amp; Audit
                           </h2>
                        </div>
                        <p className="text-[11px] font-bold tracking-widest uppercase text-slate-500 mt-1">
                           Strict Routing: State → District → Department → Availability → Nearest GPS Distance
                        </p>
                     </div>
                     <button
                       type="button"
                       onClick={() => {
                         setShowAssignmentModal(false);
                         setSelectedComplaint(null);
                         setSelectedWorker(null);
                         setAssignmentAudit(null);
                       }}
                       className="w-10 h-10 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-red-50 hover:text-red-500 transition-all"
                     >
                        <X size={20} />
                     </button>
                  </div>

                  {/* Body Content Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                     
                     {/* Left: Complaint Details Card (5 cols) */}
                     <div className="lg:col-span-5 space-y-4">
                        <div className="p-5 bg-slate-50 rounded-3xl border border-slate-200/70 space-y-4">
                           <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Complaint Intake</span>
                              <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                                 #{String(selectedComplaint._id).slice(-6).toUpperCase()}
                              </span>
                           </div>

                           <div className="space-y-3 text-xs">
                              <div>
                                 <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category &amp; Department</p>
                                 <p className="font-black text-slate-900 mt-0.5 text-sm">{selectedComplaint.category}</p>
                                 <p className="text-[11px] font-semibold text-green-700 mt-0.5">
                                    Target Dept: {selectedComplaint.department || "Municipal Operations"}
                                 </p>
                                 {selectedComplaint.custom_department && (
                                    <p className="text-[10px] font-medium text-indigo-600">
                                       Custom Spec: {selectedComplaint.custom_department}
                                    </p>
                                 )}
                              </div>

                              <div className="border-t border-slate-200 pt-2.5">
                                 <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jurisdiction / Location</p>
                                 <p className="font-bold text-slate-800 mt-0.5">{selectedComplaint.address || "Address not provided"}</p>
                                 <div className="flex flex-wrap gap-2 mt-2">
                                    <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700">
                                       District: <strong className="text-black">{selectedComplaint.city || selectedComplaint.district || "—"}</strong>
                                    </span>
                                    <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-700">
                                       State: <strong className="text-black">{selectedComplaint.state || "—"}</strong>
                                    </span>
                                 </div>
                              </div>

                              <div className="border-t border-slate-200 pt-2.5">
                                 <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Complaint GPS Coordinates</p>
                                 {selectedComplaint.gps_lat && selectedComplaint.gps_long ? (
                                    <div className="mt-1 flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 p-2 text-[11px] font-mono text-green-900 font-bold">
                                       <MapPin size={14} className="text-green-600 shrink-0" />
                                       <span>{Number(selectedComplaint.gps_lat).toFixed(6)}, {Number(selectedComplaint.gps_long).toFixed(6)}</span>
                                    </div>
                                 ) : (
                                    <div className="mt-1 flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 p-2 text-[10px] text-amber-900 font-medium">
                                       <AlertCircle size={14} className="text-amber-600 shrink-0" />
                                       <span>Missing GPS Coordinates</span>
                                    </div>
                                 )}
                              </div>

                              <div className="border-t border-slate-200 pt-2.5">
                                 <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Priority &amp; Severity</p>
                                 <div className="mt-1 flex items-center gap-2">
                                    <PriorityBadge priority={selectedComplaint.priority_level || "Medium"} />
                                    <span className="text-[10px] font-bold uppercase text-slate-500">
                                       Status: {selectedComplaint.status?.replace(/_/g, " ")}
                                    </span>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* Right: Automated Audit Verification & Eligible Worker Selection (7 cols) */}
                     <div className="lg:col-span-7 space-y-4">
                        
                        {/* Audit Status Bar */}
                        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                           <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                 <Activity size={18} className="text-blue-600" />
                                 <h4 className="text-xs font-black uppercase tracking-wider text-slate-800">
                                    Automated Assignment Audit Result
                                 </h4>
                              </div>
                              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                                 eligibleLoading
                                    ? 'bg-amber-100 text-amber-800'
                                    : assignmentAudit?.audit_passed
                                    ? 'bg-green-100 text-green-900'
                                    : 'bg-red-100 text-red-900'
                              }`}>
                                 {eligibleLoading ? 'Auditing…' : assignmentAudit?.audit_passed ? 'Audit Passed' : 'Audit Failed'}
                              </span>
                           </div>

                           {/* Audit Loading */}
                           {eligibleLoading && (
                              <div className="py-8 text-center space-y-2">
                                 <Loader2 size={28} className="mx-auto animate-spin text-blue-600" />
                                 <p className="text-xs font-bold text-slate-600">
                                    Auditing State → District → Department → Availability → GPS Distance…
                                 </p>
                              </div>
                           )}

                           {/* Audit Success: Nearest Eligible Worker Found */}
                           {!eligibleLoading && assignmentAudit?.audit_passed && selectedWorker && (
                              <div className="space-y-4 pt-1">
                                 <div className="rounded-2xl border-2 border-green-500 bg-green-50/40 p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                       <span className="inline-flex items-center gap-1 rounded-full bg-green-600 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm">
                                          <CheckCircle size={12} /> Eligible Worker Found (Nearest)
                                       </span>
                                       <span className="text-xs font-black text-green-900 bg-green-200/80 px-2.5 py-1 rounded-lg">
                                          {selectedWorker.distance_km !== undefined ? `${selectedWorker.distance_km} km away` : 'Nearby'}
                                       </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                                       <div>
                                          <p className="text-[10px] font-bold uppercase text-slate-500">Worker Name</p>
                                          <p className="text-sm font-black text-slate-900">{selectedWorker.name}</p>
                                          <p className="text-[10px] text-slate-500">{selectedWorker.email}</p>
                                       </div>
                                       <div>
                                          <p className="text-[10px] font-bold uppercase text-slate-500">Department</p>
                                          <span className="inline-block rounded bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-bold text-indigo-700 mt-0.5">
                                             {selectedWorker.department || "Public Works"}
                                          </span>
                                       </div>
                                       <div>
                                          <p className="text-[10px] font-bold uppercase text-slate-500">State &amp; District</p>
                                          <p className="font-bold text-slate-800">
                                             {selectedWorker.district || selectedWorker.city}, {selectedWorker.state}
                                          </p>
                                       </div>
                                       <div>
                                          <p className="text-[10px] font-bold uppercase text-slate-500">Availability &amp; Workload</p>
                                          <p className="font-bold text-green-700">
                                             Available · {selectedWorker.active_tasks || 0} active task(s)
                                          </p>
                                       </div>
                                    </div>

                                    {/* GPS Coordinates Comparison */}
                                    <div className="rounded-xl bg-white border border-green-200 p-2.5 text-[10px] font-mono grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-700">
                                       <div>
                                          <span className="font-bold text-slate-500">Worker GPS: </span>
                                          {selectedWorker.latitude ? `${Number(selectedWorker.latitude).toFixed(4)}, ${Number(selectedWorker.longitude).toFixed(4)}` : "—"}
                                       </div>
                                       <div>
                                          <span className="font-bold text-slate-500">Complaint GPS: </span>
                                          {selectedComplaint.gps_lat ? `${Number(selectedComplaint.gps_lat).toFixed(4)}, ${Number(selectedComplaint.gps_long).toFixed(4)}` : "—"}
                                       </div>
                                    </div>
                                 </div>

                                 {/* If multiple eligible workers in the same district, show alternative candidates */}
                                 {eligibleWorkers.length > 1 && (
                                    <div className="space-y-2">
                                       <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                          Other Verified Workers in Same District ({eligibleWorkers.length})
                                       </p>
                                       <div className="grid gap-2 max-h-36 overflow-y-auto pr-1">
                                          {eligibleWorkers.map((w) => (
                                             <button
                                                key={w.worker_uid || w._id}
                                                type="button"
                                                onClick={() => setSelectedWorker(w)}
                                                className={`flex items-center justify-between rounded-xl border p-2.5 text-left text-xs transition-all ${
                                                   selectedWorker?.worker_uid === (w.worker_uid || w._id)
                                                      ? "border-blue-600 bg-blue-50/70 ring-1 ring-blue-600"
                                                      : "border-slate-200 bg-white hover:border-slate-300"
                                                }`}
                                             >
                                                <div>
                                                   <span className="font-bold text-slate-900">{w.name}</span>
                                                   <span className="text-[10px] text-slate-500 ml-2">({w.department})</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                   <span className="text-[10px] font-bold text-slate-600">{w.distance_km} km</span>
                                                   <span className="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">
                                                      Tasks: {w.active_tasks || 0}
                                                   </span>
                                                </div>
                                             </button>
                                          ))}
                                       </div>
                                    </div>
                                 )}
                              </div>
                           )}

                           {/* Audit Failure: No eligible worker */}
                           {!eligibleLoading && (!assignmentAudit?.audit_passed || eligibleWorkers.length === 0) && (
                              <div className="rounded-2xl border border-red-200 bg-red-50/70 p-5 space-y-3">
                                 <div className="flex items-center gap-2 text-red-900 font-bold">
                                    <AlertCircle className="text-red-600 shrink-0" size={20} />
                                    <span>No eligible worker found for this complaint.</span>
                                 </div>
                                 
                                 <p className="text-xs text-red-800">
                                    The complaint cannot be assigned because one or more mandatory conditions failed:
                                 </p>

                                 <ul className="space-y-1.5 text-xs text-red-700 pl-5 list-disc">
                                    {(assignmentAudit?.failure_reasons || [
                                       "No worker in the same district and state",
                                       "No matching department worker available",
                                       "Missing complaint or worker GPS coordinates"
                                    ]).map((reason, idx) => (
                                       <li key={idx} className="font-medium">{reason}</li>
                                    ))}
                                 </ul>

                                 <p className="text-[11px] text-slate-600 pt-1 italic">
                                    Assignments across different districts or unrelated departments are strictly prevented to eliminate wrong routing.
                                 </p>
                              </div>
                           )}
                        </div>
                     </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 border-t border-slate-100 pt-5">
                     <button 
                       type="button"
                       onClick={() => {
                         setShowAssignmentModal(false);
                         setSelectedComplaint(null);
                         setSelectedWorker(null);
                         setAssignmentAudit(null);
                       }}
                       className="btn-secondary px-6 py-2.5 text-xs font-bold"
                     >
                        Cancel
                     </button>
                     <button 
                       type="button"
                       onClick={() => selectedWorker && handleAssignWorker(selectedComplaint._id, selectedWorker.worker_uid || selectedWorker._id)}
                       disabled={!selectedWorker || !assignmentAudit?.audit_passed || eligibleLoading}
                       className={`btn-primary px-8 py-2.5 text-xs font-black uppercase tracking-wider ${
                          !selectedWorker || !assignmentAudit?.audit_passed
                             ? 'opacity-50 cursor-not-allowed !bg-slate-400'
                             : '!bg-green-600 hover:!bg-green-700 shadow-lg shadow-green-600/20'
                       }`}
                     >
                        {eligibleLoading 
                           ? 'Auditing Worker Rules…' 
                           : selectedWorker 
                           ? `Confirm Assignment to ${selectedWorker.name}` 
                           : 'Assignment Blocked (No Eligible Worker)'}
                     </button>
                  </div>
               </div>
            </motion.div>
         </div>
      )}
      </AnimatePresence>
      </div>
    </div>
  );
};

export default AdminDashboard;
