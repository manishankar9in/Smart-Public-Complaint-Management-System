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
} from "lucide-react";
import { Card, StatsCard, Badge } from "../components/UI";
import PriorityBadge from "../components/PriorityBadge";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { dutyMatchesCategory, workerMatchesComplaint, ADMIN_PROCESSING_STATUSES, isAdminProcessingComplaint } from "../data/categoryMapping";
import { sendNotification } from "../services/emailService";
import { Bar } from 'react-chartjs-2';
import { INDIAN_STATES_WITH_DISTRICTS, getDistrictsForState, getAllStates } from "../data/indianStatesDistricts";
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title as ChartTitle, 
  Tooltip as ChartTooltip, 
  Legend 
} from 'chart.js';
// Removed react-leaflet map usage per UI update (maps replaced with links/lists)

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTitle, ChartTooltip, Legend);

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
  }), [activeComplaints]);

  const stateOptions = useMemo(() => getAllStates(), []);

  const workerSummary = useMemo(() => ({
    total: workers.length,
    withGps: workers.filter((w) => w.gps_lat && w.gps_long).length,
    busy: workers.filter((w) => Number(w.active_tasks || 0) > 0).length,
  }), [workers]);

  const filteredWorkers = useMemo(() => {
    return workers.filter((worker) => {
      const searchText = `${worker.name} ${worker.email} ${worker.state} ${worker.city} ${worker.ward} ${worker.street}`.toLowerCase();
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
      fetchComplaints();
    } catch (err) {
      toast.error("Assignment failed: " + (err.response?.data?.detail || err.message || "Network error"));
    }
  };

  const openAssignmentModal = (complaint) => {
    setSelectedComplaint(complaint);
    setModalWorkerSearch("");
    setModalWorkerState(complaint.state || "");
    setModalWorkerCity(complaint.city || "");
    setFilterByCategoryOnly(true);
    setSelectedWorker(null);
    setShowAssignmentModal(true);
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
      .filter(worker => worker.gps_lat && worker.gps_long)
      .map(worker => ({
        ...worker,
        distance: calculateDistance(
          complaint.gps_lat, complaint.gps_long,
          worker.gps_lat, worker.gps_long
        )
      }))
      .filter(worker => worker.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);
  };

  const handleVerify = async (id) => {
    try {
      // 1. Initial Verification & AI Scoring
      await api.put(`/admin/verify/${id}`, { status: "VERIFIED" });
      
      // 2. Intelligent Auto-Assignment
      await api.put(`/admin/assign-worker/${id}`);
      
      const c = complaints.find(comp => comp._id === id);
      // 3. Notify Citizen of Assignment (do not block admin action if EmailJS fails)
      try {
        await sendNotification("WORKER_VERIFYING", {
          to_email: c?.citizen_email || c?.email || "citizen@authority.in",
          name: c?.citizen_name || "Citizen",
          complaint_id: id,
          category: c?.category,
          address: c?.address,
          message: "A field worker has been assigned and is verifying your issue on site.",
        });
      } catch (emailErr) {
        console.warn("EmailJS notification failed:", emailErr);
        toast.warn("Complaint routed, but email notification failed.");
      }

      toast.success("Complaint verified and assigned to worker.");
      fetchComplaints();
    } catch (err) {
      toast.error(
        "Verification protocol failed: " + (err.response?.data?.detail || err.response?.data || err.message || "Network Error")
      );
    }
  };

  const handleAssignOnly = async (id) => {
    try {
      await api.put(`/admin/assign-worker/${id}`);
      const c = complaints.find((comp) => comp._id === id);
      await sendNotification("WORKER_VERIFYING", {
        to_email: c?.citizen_email || c?.email || "citizen@authority.in",
        name: c?.citizen_name || "Citizen",
        complaint_id: id,
        category: c?.category,
        address: c?.address,
        message: "A field worker has been assigned and is verifying your issue on site.",
      });
      toast.success("Worker assigned successfully.");
      fetchComplaints();
    } catch (err) {
      toast.error(
        "Assign failed: " + (err.response?.data?.detail || err.message || "Network error")
      );
    }
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
        String(w.duty_position || "").toLowerCase().includes(q);
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

  // Modal Filtered Workers
  const modalFilteredWorkers = useMemo(() => {
    if (!selectedComplaint) return [];
    const norm = (s) => String(s || "").trim().toLowerCase();
    return workers.filter((w) => {
      // Category filter
      if (filterByCategoryOnly && !dutyMatchesCategory(w.duty_position, selectedComplaint.category)) {
        return false;
      }
      // Location filter
      if (modalWorkerState && norm(w.state) !== norm(modalWorkerState)) return false;
      if (modalWorkerCity && norm(w.city) !== norm(modalWorkerCity)) return false;
      
      const q = modalWorkerSearch.toLowerCase().trim();
      if (!q) return true;
      return (
        norm(w.name).includes(q) ||
        norm(w.email).includes(q) ||
        norm(w.duty_position).includes(q)
      );
    });
  }, [workers, selectedComplaint, modalWorkerSearch, modalWorkerState, modalWorkerCity, filterByCategoryOnly]);

  const recommendedWorkers = useMemo(() => {
    return getWorkersForComplaint(selectedComplaint);
  }, [selectedComplaint, workers]);

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
        <div ref={dashboardRef} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
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
                          {worker.duty_position || worker.department || "General Force"}
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
                            <button type="button" onClick={() => openAssignmentModal(c)} className="btn-primary cursor-pointer !px-2 !py-1 text-[9px]">Assign Worker</button>
                          )}
                          {(c.status === "REOPENED" || c.status === "ESCALATED") && (
                            <button type="button" onClick={() => handleVerify(c._id)} className="btn-primary cursor-pointer !px-2 !py-1 text-[9px]">Re-verify</button>
                          )}
                          {c.status === "WORKER_COMPLETED" && (
                            <button type="button" onClick={() => openAuditModal(c)} className="btn-primary cursor-pointer !px-2 !py-1 text-[9px]">Audit</button>
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
                          <AlertCircle className="text-warning mt-0.5" size={18} />
                          <p className="text-[10px] text-amber-800 font-bold uppercase tracking-widest leading-relaxed italic">
                             Warning: Confirming closure will mark this complaint as RESOLVED.
                          </p>
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

      {/* Worker Assignment Modal */}
      <AnimatePresence>
      {showAssignmentModal && selectedComplaint && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur-sm">
            <motion.div 
               initial={{ opacity: 0, y: 100 }}
               animate={{ opacity: 1, y: 0 }}
               exit={{ opacity: 0, y: 100 }}
               className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-slate-200 bg-white shadow-premium"
            >
               <div className="p-10 space-y-8">
                  <div className="flex justify-between items-start">
                     <div>
                        <h2 className="text-3xl font-black tracking-tight text-black">Assign Worker</h2>


                        <p className="text-[10px] text-muted font-bold tracking-[0.2em] uppercase mt-2">
                           {selectedComplaint.category} - {selectedComplaint.address}
                        </p>
                     </div>
                     <button
                       type="button"
                       onClick={() => {
                         setShowAssignmentModal(false);
                         setSelectedComplaint(null);
                         setSelectedWorker(null);
                       }}
                       className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center hover:bg-red-100 transition-all"
                     >
                        <X size={24} />
                     </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                     {/* Complaint Details */}
                     <div className="space-y-6">
                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                           <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">Complaint Details</h4>
                           <div className="space-y-3">
                              <div className="flex justify-between">
                                 <span className="text-[10px] text-muted font-bold uppercase">Category:</span>
                                 <span className="text-[10px] font-black text-secondary">{selectedComplaint.category}</span>
                              </div>
                              <div className="flex justify-between">
                                 <span className="text-[10px] text-muted font-bold uppercase">Priority:</span>
                                 <span className={`text-[10px] font-black uppercase px-2 py-1 rounded ${
                                    selectedComplaint.priority_level === 'Critical' ? 'bg-red-50 text-red-600' :
                                    selectedComplaint.priority_level === 'High' ? 'bg-amber-50 text-amber-600' :
                                    'bg-blue-50 text-blue-600'
                                 }`}>{selectedComplaint.priority_level}</span>
                              </div>
                              <div className="flex justify-between">
                                 <span className="text-[10px] text-muted font-bold uppercase">Location:</span>
                                 <span className="text-[10px] font-black text-secondary text-right">{selectedComplaint.address}</span>
                              </div>
                              {selectedComplaint.gps_lat && selectedComplaint.gps_long && (
                                <div className="pt-2">
                                  <div className="h-48 rounded-2xl overflow-hidden border border-slate-200 p-4 flex items-center justify-center">
                                    <div className="text-center">
                                      <p className="text-[10px] font-black">GPS: {Number(selectedComplaint.gps_lat).toFixed(4)}, {Number(selectedComplaint.gps_long).toFixed(4)}</p>
                                      <a href={`https://www.google.com/maps?q=${selectedComplaint.gps_lat},${selectedComplaint.gps_long}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[10px] text-blue-600 underline">Open in Google Maps</a>
                                    </div>
                                  </div>
                                </div>
                              )}
                           </div>
                        </div>
                     </div>

                    {/* Worker Selection - Search and Filter */}
                    <div className="space-y-4">
                      <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-2">Select Worker</h4>

                      <div className="rounded-3xl border border-slate-100 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted">Recommended Workers</p>
                            <p className="text-[9px] text-slate-500">Matches category + location</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-[9px] font-black uppercase tracking-[0.2em] text-slate-700">
                            {recommendedWorkers.length} found
                          </span>
                        </div>
                        {recommendedWorkers.length === 0 ? (
                          <p className="mt-3 text-[10px] text-slate-500">No nearby workers available for the complaint location. Use the search filters below.</p>
                        ) : (
                          <div className="mt-4 grid gap-3">
                            {recommendedWorkers.slice(0, 3).map((worker) => (
                              <button
                                key={worker.worker_uid}
                                type="button"
                                onClick={() => setSelectedWorker(worker)}
                                className={`w-full rounded-2xl border px-4 py-3 text-left transition-all ${
                                  selectedWorker?.worker_uid === worker.worker_uid
                                    ? 'border-blue-600 bg-blue-50'
                                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-[10px] font-black text-black">{worker.name}</p>
                                    <p className="text-[9px] text-slate-500">{worker.duty_position || worker.department || 'General Force'}</p>
                                  </div>
                                  <p className="text-[9px] uppercase text-slate-600">Tasks: {worker.active_tasks || 0}</p>
                                </div>
                                <p className="mt-2 text-[8px] uppercase tracking-[0.16em] text-slate-500">{worker.city}, {worker.state}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-black uppercase text-muted mb-1 block">Filter State</label>
                          <select
                            value={modalWorkerState}
                            onChange={(e) => {
                              setModalWorkerState(e.target.value);
                              setModalWorkerCity("");
                            }}
                            className="input-field w-full rounded-2xl px-4 py-2 text-xs"
                          >
                            <option value="">All States</option>
                            {getAllStates().map((state) => (
                              <option key={state} value={state}>{state}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-black uppercase text-muted mb-1 block">Filter City/District</label>
                          <select
                            value={modalWorkerCity}
                            onChange={(e) => setModalWorkerCity(e.target.value)}
                            className="input-field w-full rounded-2xl px-4 py-2 text-xs"
                            disabled={!modalWorkerState}
                          >
                            <option value="">All Cities</option>
                            {modalWorkerState && getDistrictsForState(modalWorkerState).map((city) => (
                              <option key={city} value={city}>{city}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 py-1">
                        <input
                          id="filterByCategoryOnly"
                          type="checkbox"
                          checked={filterByCategoryOnly}
                          onChange={(e) => setFilterByCategoryOnly(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label htmlFor="filterByCategoryOnly" className="text-[10px] font-black uppercase text-slate-500 cursor-pointer select-none">
                          Filter by complaint category ({selectedComplaint.category})
                        </label>
                      </div>
                      
                      <div className="relative flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-2">
                        <Search size={16} className="text-slate-500 mr-2" />
                        <input
                          type="text"
                          placeholder="Search workers by name, email, duty..."
                          className="bg-transparent text-xs font-medium tracking-wide text-black outline-none placeholder:text-slate-400 w-full"
                          value={modalWorkerSearch}
                          onChange={(e) => setModalWorkerSearch(e.target.value)}
                        />
                      </div>

                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {modalFilteredWorkers.length === 0 ? (
                          <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100 text-center">
                            <p className="text-[10px] text-muted py-8">No workers match the selected location or search query.</p>
                          </div>
                        ) : (
                          modalFilteredWorkers.map(worker => (
                            <div 
                              key={worker.worker_uid} 
                              className={`p-4 bg-white rounded-2xl border transition-all cursor-pointer ${
                                selectedWorker?.worker_uid === worker.worker_uid 
                                  ? 'border-primary ring-2 ring-primary bg-indigo-50/10' 
                                  : 'border-slate-100 hover:border-primary hover:bg-slate-50/50'
                              }`}
                              onClick={() => setSelectedWorker(worker)}
                            >
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-black text-secondary">{worker.name}</p>
                                    <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-pink-50 text-pink-700 uppercase border border-pink-100">
                                      {worker.duty_position || worker.department || 'General'}
                                    </span>
                                  </div>
                                  <p className="text-[8px] text-blue-600 font-bold uppercase mt-1">
                                    {worker.city}, {worker.state} {worker.ward ? `(Ward: ${worker.ward})` : ''}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="text-[8px] text-muted font-bold uppercase">Active Tasks</p>
                                  <p className="text-lg font-black text-primary">{worker.active_tasks || 0}</p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4">
                     <button 
                       onClick={() => {
                         setShowAssignmentModal(false);
                         setSelectedComplaint(null);
                         setSelectedWorker(null);
                       }}
                       className="btn-secondary"
                     >
                        Cancel
                     </button>
                     <button 
                       onClick={() => selectedWorker && handleAssignWorker(selectedComplaint._id, selectedWorker.worker_uid)}
                       disabled={!selectedWorker}
                       className="btn-primary flex-1"
                     >
                        {selectedWorker ? `Assign to ${selectedWorker.name}` : 'Select a Worker'}
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
