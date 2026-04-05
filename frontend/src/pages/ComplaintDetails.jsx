import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../utils/api";
import { Card, Badge } from "../components/UI";
import { useAuth } from "../context/AuthContext";

const steps = ["NEW", "ASSIGNED", "IN_PROGRESS", "ESCALATED", "RESOLVED", "CLOSED"];

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
    const current = complaint.workflow_status || "NEW";
    return steps.indexOf(current);
  }, [complaint]);

  if (loading) return <div className="p-8">Loading complaint details...</div>;
  if (!complaint) return <div className="p-8">Complaint not found.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black">Complaint #{complaint._id?.slice(-6)?.toUpperCase()}</h1>
        <Link to={user?.role === "worker" ? "/worker-dashboard" : "/user-dashboard"} className="btn-secondary">
          Back
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap gap-3 mb-4">
          <Badge variant="primary">{complaint.category}</Badge>
          <Badge variant={complaint.priority_level === "Critical" ? "danger" : complaint.priority_level === "High" ? "warning" : "primary"}>
            {complaint.priority_level} Priority
          </Badge>
          <Badge>{complaint.status}</Badge>
        </div>
        <p className="text-sm text-muted">{complaint.description}</p>
      </Card>

      <Card>
        <h3 className="font-black mb-4">AI Analysis Results</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><p className="text-muted">Severity</p><p className="font-bold">{complaint.ai_analysis?.severity ?? "-"}</p></div>
          <div><p className="text-muted">Urgency</p><p className="font-bold">{complaint.ai_analysis?.urgency ?? "-"}</p></div>
          <div><p className="text-muted">Impact</p><p className="font-bold">{complaint.ai_analysis?.impact ?? "-"}</p></div>
          <div><p className="text-muted">Delay Risk</p><p className="font-bold">{complaint.ai_analysis?.delay_risk ?? "-"}</p></div>
        </div>
      </Card>

      <Card>
        <h3 className="font-black mb-4">Workflow Timeline</h3>
        <div className="flex items-center gap-2 overflow-x-auto">
          {steps.map((step, idx) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-full ${idx <= activeStep ? "bg-primary" : "bg-slate-200"}`} />
              <span className={`text-xs font-bold ${idx <= activeStep ? "text-secondary" : "text-muted"}`}>{step}</span>
              {idx < steps.length - 1 && <div className="w-4 h-px bg-slate-200" />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default ComplaintDetails;
