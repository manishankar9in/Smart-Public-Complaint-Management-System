import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../utils/api";
import { Card, Badge } from "../components/UI";
import { useAuth } from "../context/AuthContext";
// Maps removed: replaced with Google Maps links and static location display

const STATUS_TO_STEP = {
  PENDING_ADMIN_VERIFY: 0,
  VERIFIED: 0,
  ASSIGNED_TO_WORKER: 1,
  IN_PROGRESS: 2,
  WORKER_COMPLETED: 3,
  REOPENED: 2,
  RESOLVED: 4,
};

const steps = ["Submitted", "Assigned", "In Progress", "Worker Done", "Resolved"];

const ComplaintDetails = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const [complaint, setComplaint] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/complaints/${id}`);
        setComplaint(res.data);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const activeStep = useMemo(() => {
    if (!complaint) return -1;
    const status = complaint.status || "";
    if (STATUS_TO_STEP[status] !== undefined) return STATUS_TO_STEP[status];
    const wf = complaint.workflow_status || "NEW";
    const wfMap = { NEW: 0, ASSIGNED: 1, IN_PROGRESS: 2, ESCALATED: 2, RESOLVED: 4, CLOSED: 4 };
    return wfMap[wf] ?? 0;
  }, [complaint]);

  if (loading) return <div className="p-8 text-sm text-muted font-medium">Loading complaint details...</div>;
  if (!complaint) return <div className="p-8 text-sm text-muted font-medium">Complaint not found.</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 md:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl md:text-3xl font-black text-secondary">Complaint #{complaint._id?.slice(-6)?.toUpperCase()}</h1>
        <Link to={user?.role === "worker" ? "/worker-dashboard" : user?.role === "admin" ? "/admin-dashboard" : "/user-dashboard"} className="btn-secondary">
          Back to Dashboard
        </Link>
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap gap-3 mb-4">
          <Badge variant="primary">{complaint.category}</Badge>
          <Badge variant={complaint.priority_level === "Critical" ? "danger" : complaint.priority_level === "High" ? "warning" : "primary"}>
            {complaint.priority_level} Priority
          </Badge>
          <Badge>{complaint.status}</Badge>
        </div>
        <p className="leading-relaxed text-green-900">{complaint.description}</p>
      </Card>

      {complaint.admin_response_message && (
        <Card>
          <h3 className="mb-2 font-black text-secondary">Admin Message</h3>
          <p className="text-sm leading-relaxed text-slate-700">{complaint.admin_response_message}</p>
        </Card>
      )}

      {complaint.admin_rejection_reason && (
        <Card>
          <h3 className="mb-2 font-black text-secondary">Admin Instruction</h3>
          <p className="text-sm leading-relaxed text-slate-700">{complaint.admin_rejection_reason}</p>
        </Card>
      )}

      {complaint.admin_response_image_url && (
        <Card>
          <h3 className="mb-2 font-black text-secondary">Admin Response Image</h3>
          <img src={complaint.admin_response_image_url} alt="Admin response proof" className="w-full rounded-2xl border border-slate-200 object-cover" />
        </Card>
      )}

      <Card>
        <h3 className="mb-4 font-black text-blue-900">AI Analysis</h3>
        <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2 md:grid-cols-4">
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="text-blue-800">Severity</p><p className="font-bold text-black">{complaint.ai_analysis?.severity ?? "-"}</p></div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-3"><p className="text-green-800">Urgency</p><p className="font-bold text-black">{complaint.ai_analysis?.urgency ?? "-"}</p></div>
          <div className="rounded-xl border border-pink-200 bg-pink-50 p-3"><p className="text-pink-800">Impact</p><p className="font-bold text-black">{complaint.ai_analysis?.impact ?? "-"}</p></div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-3"><p className="text-red-800">Delay Risk</p><p className="font-bold text-black">{complaint.ai_analysis?.delay_risk ?? "-"}</p></div>
        </div>
      </Card>

      <Card>
        <h3 className="mb-4 font-black text-black">Progress Timeline</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {steps.map((step, idx) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`h-2.5 w-2.5 rounded-full ${idx <= activeStep ? "bg-blue-600" : "bg-slate-400"}`} />
              <span className={`text-xs font-bold ${idx <= activeStep ? "text-black" : "text-green-700"}`}>{step}</span>
              {idx < steps.length - 1 && <div className="h-px w-4 bg-slate-300" />}
            </div>
          ))}
        </div>
      </Card>

      {Number.isFinite(complaint.gps_lat) && Number.isFinite(complaint.gps_long) && (
        <Card>
          <div className="flex items-center justify-between mb-4 gap-3">
            <h3 className="font-black text-secondary">Complaint Location</h3>
            <a
              href={`https://www.google.com/maps?q=${complaint.gps_lat},${complaint.gps_long}`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary !py-2 !px-4 !text-[10px]"
            >
              Open in Google Maps
            </a>
          </div>
          <div className="h-80 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center p-6">
            <div className="text-center">
              <p className="text-sm font-black">GPS Coordinates</p>
              <p className="text-xs mt-2">{Number(complaint.gps_lat).toFixed(6)}, {Number(complaint.gps_long).toFixed(6)}</p>
              <p className="text-[10px] text-muted mt-3">{complaint.address}</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ComplaintDetails;
