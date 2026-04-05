import { useState, useEffect, useMemo } from "react";
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
  MoreVertical
} from "lucide-react";
import { Card, StatsCard, Badge } from "../components/UI";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import { sendNotification } from "../services/emailService";
import { Bar } from 'react-chartjs-2';
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title as ChartTitle, 
  Tooltip as ChartTooltip, 
  Legend 
} from 'chart.js';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, ChartTitle, ChartTooltip, Legend);

const AdminDashboard = () => {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [regionFilter, setRegionFilter] = useState("all");
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [adminResponseToWorker, setAdminResponseToWorker] = useState("");
  const [adminResponseToCitizen, setAdminResponseToCitizen] = useState("");
  const [adminResponseImageUrl, setAdminResponseImageUrl] = useState("");
  const [slaConfig, setSlaConfig] = useState({ Critical: 2, High: 6, Medium: 24, Low: 72 });
  const [departments, setDepartments] = useState([]);
  const [newDepartment, setNewDepartment] = useState("");

  useEffect(() => {
    fetchComplaints();
    fetchAdminConfig();
  }, []);

  const fetchComplaints = async () => {
    try {
      const list = await fetchAdminComplaints();
      if (import.meta.env.DEV) {
        console.log("Admin fetched complaints:", list?.length, list);
      }
      setComplaints(list);
    } catch (err) {
      console.error("Admin complaints fetch error:", err?.response?.data || err);
      toast.error("Failed to sync governance queue.");
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

  const stats = {
    total: complaints.length,
    pending: complaints.filter(c => c.status === 'PENDING_ADMIN_VERIFY').length,
    high: complaints.filter(c => c.priority_level === 'High').length,
    critical: complaints.filter(c => c.priority_level === 'Critical' && c.status !== 'RESOLVED').length,
    resolved: complaints.filter(c => c.status === 'RESOLVED').length,
  };

  const cityOptions = useMemo(() => {
    const set = new Set(
      complaints.map((c) => (c.city || "").trim()).filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [complaints]);

  const statusMatchesFilter = (c, statusFilter) => {
    const st = String(c.status || "").toUpperCase();
    if (statusFilter === "all") return true;
    if (statusFilter === "VERIFIED") {
      return st === "VERIFIED";
    }
    return st === String(statusFilter).toUpperCase();
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
        toast.warn("Mission routed successfully, but email notification failed.");
      }

      toast.success("Governance Mission Synchronized & Field unit Assigned.");
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
      toast.success("Mission assigned to field worker.");
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

       toast.success(approve ? "Mission RESOLVED." : "Audit failed. Mission REOPENED.");
       setSelectedAudit(null);
       setAdminResponseToWorker("");
       setAdminResponseToCitizen("");
       setAdminResponseImageUrl("");
       fetchComplaints();
    } catch (err) {
       toast.error(
         "Audit protocol failed: " +
           (err.response?.data?.detail || err.response?.data || err.message || "Network Error")
       );
    }
  };

  const filteredComplaints = complaints.filter((c) => {
    if (!statusMatchesFilter(c, filter)) return false;
    const q = searchQuery.toLowerCase().trim();
    const searchable = `${c.category} ${c.address} ${c.village} ${c.street} ${c.city || ""} ${c.state || ""}`.toLowerCase();
    const matchesSearch = !q || searchable.includes(q);
    const regionOk =
      regionFilter === "all" ||
      String(c.city || "").toLowerCase() === regionFilter.toLowerCase();
    return matchesSearch && regionOk;
  });

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
    a.download = `mission-queue-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded.");
  };

  return (
    <div className="space-y-12 max-w-7xl mx-auto pb-20">
      {/* Admin Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
        <div>
           <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 bg-secondary rounded-2xl shadow-premium flex items-center justify-center text-white border border-white/10 font-black text-2xl">A</div>
              <div>
                 <h1 className="text-3xl font-black text-secondary tracking-tight">Oversight Command</h1>
                 <p className="text-[10px] text-muted font-bold tracking-[0.2em] uppercase mt-0.5">Central Governance Authority</p>
              </div>
           </div>
           <p className="text-muted font-medium ml-1">Real-time municipal audit for <span className="text-primary font-black">Hyderabad Mainnet Territory</span></p>
        </div>
        <div className="flex gap-4">
           <button
             type="button"
             onClick={() => {
               setLoading(true);
               fetchComplaints();
             }}
             className="p-4 bg-white rounded-2xl border border-slate-100 text-muted hover:text-primary hover:rotate-180 transition-all duration-700"
           >
              <RefreshCcw size={20} />
           </button>
           <button
             type="button"
             onClick={exportAuditCsv}
             className="btn-primary !bg-secondary !shadow-slate-200"
           >
             Generate Audit Report
           </button>
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
         <StatsCard title="Total Queue" value={stats.total} icon={Layers} variant="primary" />
         <StatsCard title="Pending Audit" value={stats.pending} icon={Clock} variant="warning" />
         <StatsCard title="Critical Alert" value={stats.critical} icon={AlertCircle} variant="danger" trend={-5} />
         <StatsCard title="Resolution Efficiency" value={`${Math.round((stats.resolved/stats.total)*100 || 0)}%`} icon={CheckCircle} variant="success" trend={8} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">SLA Configuration (Hours)</h4>
          <div className="grid grid-cols-2 gap-3">
            {Object.keys(slaConfig).map((key) => (
              <div key={key}>
                <label className="block text-[10px] font-black uppercase tracking-widest text-muted mb-2">{key}</label>
                <input
                  type="number"
                  min="1"
                  className="input-field"
                  value={slaConfig[key]}
                  onChange={(e) => setSlaConfig({ ...slaConfig, [key]: Number(e.target.value || 1) })}
                />
              </div>
            ))}
          </div>
          <button onClick={saveSlaConfig} className="btn-primary mt-4">Save SLA</button>
        </Card>

        <Card>
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-4">Department Management</h4>
          <div className="flex gap-2 mb-4">
            <input
              className="input-field"
              placeholder="Department name"
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
            />
            <button onClick={addDepartment} className="btn-primary">Add</button>
          </div>
          <div className="space-y-2 max-h-40 overflow-auto">
            {departments.map((d) => (
              <div key={d._id} className="text-xs font-bold text-secondary bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl">
                {d.name}
              </div>
            ))}
            {departments.length === 0 && <p className="text-xs text-muted">No departments configured yet.</p>}
          </div>
        </Card>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 gap-8">
        <Card className="!p-0 border-0 shadow-soft overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
               <Card className="!p-8 min-h-[350px] flex flex-col justify-center">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-muted mb-8">Priority Distribution Audit</h4>
                  <div className="h-[280px] w-full">
                    <Bar 
                      data={{
                      labels: ['Critical', 'High', 'Medium', 'Low'],
                        datasets: [{
                          label: 'Mission Count',
                          data: [
                            complaints.filter(c => c.priority_level === 'Critical').length,
                          complaints.filter(c => c.priority_level === 'High').length,
                            complaints.filter(c => c.priority_level === 'Medium').length,
                            complaints.filter(c => c.priority_level === 'Low').length,
                          ],
                          backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'],
                          borderRadius: 12,
                        }]
                      }}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } }
                      }}
                    />
                  </div>
               </Card>
               <Card className="!p-0 overflow-hidden relative shadow-premium border-0">
                  <div className="absolute top-6 left-6 z-[10] bg-white/90 backdrop-blur px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl border border-slate-100 flex items-center gap-2">
                     <div className="w-1.5 h-1.5 bg-primary rounded-full animate-ping"></div>
                     Live Geospatial Integrity Sync
                  </div>
                  <div className="w-full h-[350px] md:h-[420px]">
                     <MapContainer
                       center={[14.6819, 77.6006]}
                       zoom={13}
                       className="h-full w-full"
                       zoomControl={false}
                       scrollWheelZoom={false}
                       dragging={true}
                       touchZoom={false}
                       doubleClickZoom={false}
                     >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        {complaints
                          .filter(c => Number.isFinite(c.gps_lat) && Number.isFinite(c.gps_long))
                          .map(c => (
                          <Marker key={c._id} position={[c.gps_lat, c.gps_long]}>
                            <Popup>
                               <div className="p-2">
                                  <p className="font-black text-secondary tracking-tight">{c.category}</p>
                                  <p className="text-[10px] font-bold text-muted uppercase mt-1">{c.address}</p>
                               </div>
                            </Popup>
                          </Marker>
                        ))}
                     </MapContainer>
                  </div>
               </Card>
            </div>

            <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex flex-col gap-6">
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-wrap">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-secondary shrink-0">
                    Mission Verification Queue
                  </h3>
                  <div className="flex items-center bg-white border border-slate-100 rounded-xl px-4 py-2 group min-w-[200px]">
                    <Search size={16} className="text-muted/40 group-focus-within:text-primary transition-colors shrink-0" />
                    <input
                      type="text"
                      placeholder="Search address, city, category…"
                      className="bg-transparent text-[10px] font-bold tracking-wide px-3 outline-none flex-1 min-w-0 normal-case"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Filter size={14} className="text-muted" />
                    <select
                      className="input-field !py-2 !text-[10px] font-bold uppercase tracking-wide max-w-[200px]"
                      value={regionFilter}
                      onChange={(e) => setRegionFilter(e.target.value)}
                    >
                      <option value="all">All cities</option>
                      {cityOptions.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {[
                  "all",
                  "PENDING_ADMIN_VERIFY",
                  "VERIFIED",
                  "ASSIGNED_TO_WORKER",
                  "WORKER_COMPLETED",
                  "RESOLVED",
                  "REOPENED",
                ].map((status) => (
                  <button
                    type="button"
                    key={status}
                    onClick={() => setFilter(status)}
                    className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-[0.12em] transition-all whitespace-nowrap ${
                      filter === status
                        ? "bg-primary text-white shadow-lg"
                        : "bg-white text-muted border border-slate-100 hover:bg-slate-50"
                    }`}
                  >
                    {status === "all" ? "All" : status.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </div>

           <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                 <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-muted/60 border-b border-slate-50">
                       <th className="px-8 py-6">ID & Category</th>
                       <th className="px-8 py-6">Incident Location</th>
                       <th className="px-8 py-6">Status & Priority</th>
                       <th className="px-8 py-6">Assigned Resource</th>
                       <th className="px-8 py-6 text-right">Audit Action</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-50">
                    {filteredComplaints.length === 0 ? (
                       <tr>
                          <td colSpan="5" className="px-8 py-20 text-center">
                             <div className="flex flex-col items-center gap-4 opacity-30">
                                <Activity size={64} />
                                <p className="text-[10px] font-black uppercase tracking-widest">No matching mission protocols found.</p>
                             </div>
                          </td>
                       </tr>
                    ) : filteredComplaints.map((c, idx) => (
                       <motion.tr
                         key={c._id}
                         initial={{ opacity: 0, x: -10 }}
                         animate={{ opacity: 1, x: 0 }}
                         transition={{ delay: Math.min(idx * 0.02, 0.4) }}
                         className="hover:bg-slate-50/80 transition-colors group"
                       >
                          <td className="px-8 py-6">
                             <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                   <Layers size={18} />
                                </div>
                                <div>
                                   <p className="text-[10px] font-black text-secondary tracking-tight">#{c._id.slice(-6).toUpperCase()}</p>
                                   <p className="text-[11px] font-bold text-muted uppercase mt-0.5">{c.category}</p>
                                </div>
                             </div>
                          </td>
                          <td className="px-8 py-6">
                             <div className="flex items-center gap-2">
                                <MapPin size={14} className="text-muted/40" />
                                <p className="text-[11px] font-bold text-secondary uppercase tracking-tight">{c.address}</p>
                             </div>
                             <p className="text-[8px] font-black text-muted/60 uppercase mt-1 tracking-widest truncate max-w-[200px]">
                               {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                             </p>
                             <p className="text-[8px] font-bold text-muted/50 mt-0.5 truncate max-w-[200px]">
                               GPS:{" "}
                               {c.gps_lat != null && c.gps_long != null
                                 ? `${Number(c.gps_lat).toFixed(4)}, ${Number(c.gps_long).toFixed(4)}`
                                 : "—"}
                             </p>
                          </td>
                          <td className="px-8 py-6">
                             <div className="flex flex-col gap-2">
                                <Badge 
                                  variant={
                                    c.status === 'PENDING_ADMIN_VERIFY' ? 'warning' :
                                    c.status === 'VERIFIED' ? 'primary' :
                                    c.status === 'ASSIGNED_TO_WORKER' ? 'primary' :
                                    c.status === 'WORKER_COMPLETED' ? 'success' :
                                    c.status === 'REOPENED' ? 'danger' : 
                                    c.status === 'RESOLVED' ? 'success' : 'default'
                                  }
                                >
                                   {c.status.replace(/_/g, ' ')}
                                </Badge>
                                {c.priority_level && c.priority_level !== "Pending" && (
                                   <div className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded border inline-block w-fit ${
                                      c.priority_level === 'Critical' ? 'bg-red-50 text-red-600 border-red-100' :
                                      c.priority_level === 'High' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                                      'bg-blue-50 text-blue-600 border-blue-100'
                                   }`}>
                                      {c.priority_level} Priority
                                   </div>
                                )}
                             </div>
                          </td>
                          <td className="px-8 py-6">
                             {c.worker_uid ? (
                                <div className="flex items-center gap-2">
                                   <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-muted font-bold text-[10px]">W</div>
                                   <div>
                                      <p className="text-[10px] font-black text-secondary uppercase">Unit #{c.worker_uid.slice(-4).toUpperCase()}</p>
                                      <p className="text-[8px] text-muted font-bold uppercase tracking-widest">{c.department || "General Force"}</p>
                                   </div>
                                </div>
                             ) : (
                                <span className="text-[10px] font-black text-muted/30 uppercase italic">Unassigned</span>
                             )}
                          </td>
                           <td className="px-8 py-6 text-right">
                              <div className="flex flex-wrap justify-end gap-2 items-center">
                                {c.status === "PENDING_ADMIN_VERIFY" && (
                                  <button
                                    type="button"
                                    onClick={() => handleVerify(c._id)}
                                    className="btn-primary !p-3 !text-[9px] !rounded-xl !shadow-blue-100 hover:scale-105"
                                  >
                                    Verify &amp; route
                                  </button>
                                )}
                                {c.status === "VERIFIED" && (
                                  <button
                                    type="button"
                                    onClick={() => handleAssignOnly(c._id)}
                                    className="btn-primary !p-3 !text-[9px] !rounded-xl !shadow-blue-100 hover:scale-105"
                                  >
                                    Assign worker
                                  </button>
                                )}
                                {(c.status === "REOPENED" || c.status === "ESCALATED") && (
                                  <button
                                    type="button"
                                    onClick={() => handleVerify(c._id)}
                                    className="btn-primary !p-3 !text-[9px] !rounded-xl !shadow-amber-100 !bg-warning hover:scale-105"
                                  >
                                    Re-verify &amp; route
                                  </button>
                                )}
                                {c.status === "WORKER_COMPLETED" && (
                                  <button
                                    type="button"
                                    onClick={() => openAuditModal(c)}
                                    className="btn-primary !bg-success !p-3 !text-[9px] !rounded-xl !shadow-green-100 hover:scale-105"
                                  >
                                    Audit work
                                  </button>
                                )}
                                {c.status === "ASSIGNED_TO_WORKER" && (
                                  <span className="text-[9px] font-bold text-muted uppercase tracking-wide">
                                    Awaiting field proof
                                  </span>
                                )}
                                {(c.status === "RESOLVED" || c.status === "CLOSED") && (
                                  <span className="text-[9px] font-bold text-success uppercase tracking-wide">
                                    Closed
                                  </span>
                                )}
                                <Link
                                  to={`/complaint/${c._id}`}
                                  className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-primary hover:underline px-2 py-1.5 rounded-lg border border-primary/20 hover:bg-primary/5"
                                >
                                  View
                                  <ExternalLink size={12} />
                                </Link>
                              </div>
                           </td>
                       </motion.tr>
                    ))}
                 </tbody>
              </table>
           </div>
        </Card>
      </div>

      {/* Comparison Audit Modal */}
      <AnimatePresence>
      {selectedAudit && (
        <div className="fixed inset-0 bg-secondary/80 backdrop-blur-2xl flex items-center justify-center p-6 z-[60]">
           <motion.div 
             initial={{ scale: 0.95, opacity: 0 }}
             animate={{ scale: 1, opacity: 1 }}
             exit={{ scale: 0.95, opacity: 0 }}
             className="w-full max-w-5xl bg-white rounded-[48px] shadow-premium overflow-hidden"
           >
              <div className="flex h-[600px]">
                 {/* Visual Evidence Section */}
                 <div className="w-1/2 bg-slate-900 relative">
                    <div className="h-full flex flex-col">
                       {/* Top - Citizen Proof */}
                       <div className="flex-1 relative group">
                          {selectedAudit.proof_image_url ? (
                          <img src={selectedAudit.proof_image_url} alt="Original" className="w-full h-full object-cover opacity-80" />
                          ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-white/50 text-[10px] font-bold uppercase">No citizen image</div>
                          )}
                          <div className="absolute top-8 left-8">
                             <Badge variant="primary" className="!bg-blue-600/80 !backdrop-blur !text-white !border-0 !px-4 !py-2 shadow-xl">Original Citizen Intake</Badge>
                          </div>
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                             <p className="text-[10px] font-black text-white uppercase tracking-widest">Site condition during submission</p>
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
                          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-white/50 text-[10px] font-bold uppercase">No worker proof yet</div>
                          )}
                          <div className="absolute top-8 left-8">
                             <Badge variant="success" className="!bg-green-600/80 !backdrop-blur !text-white !border-0 !px-4 !py-2 shadow-xl">Field Resolution Proof</Badge>
                          </div>
                          <div className="absolute inset-x-0 bottom-8 px-8 flex justify-between items-end">
                             <div className="bg-black/40 backdrop-blur-md p-3 rounded-2xl border border-white/10">
                                <p className="text-[9px] font-black text-white uppercase tracking-[0.2em]">Sensor Authenticity</p>
                                <div className="flex items-center gap-3 text-[10px] text-white/60 font-bold mt-1">
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
                 <div className="w-1/2 p-12 flex flex-col">
                    <div className="flex justify-between items-start mb-10">
                       <div>
                          <h2 className="text-3xl font-black text-secondary tracking-tight">Final Resolution Audit</h2>
                          <p className="text-[10px] text-muted font-bold tracking-[0.2em] uppercase mt-2">Administrative Verification Protocol</p>
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
                             Warning: Confirming closure will permanently hash this mission as 'RESOLVED'.
                          </p>
                       </div>
                    </div>

                     <div className="mt-10 grid grid-cols-2 gap-4">
                        <button 
                          onClick={() => handleAuditSolution(selectedAudit._id, false)}
                          className="btn-secondary !bg-red-50 !text-danger !border-red-100 hover:!bg-red-100 transition-all shadow-sm"
                        >
                           Fail Audit & Reopen
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
    </div>
  );
};

export default AdminDashboard;
