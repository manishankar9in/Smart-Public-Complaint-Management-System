/** Citizen-facing complaint categories */
export const COMPLAINT_CATEGORIES = [
  "Electricity Issue",
  "Water Supply Problem",
  "Road Damage / Potholes",
  "Street Light Problem",
  "Drainage / Cleaning",
  "Garbage / Sanitation",
  "Pension / Welfare",
  "Public Store / Ration",
  "Hospital / Health Emergency",
  "Women Safety Issue",
  "Public Transport Issue",
  "Noise Pollution",
  "Other",
];

const CATEGORY_TO_DUTY = {
  "electricity issue": "Electricity",
  "water supply problem": "Water",
  "road damage / potholes": "Road",
  "garbage / sanitation": "Panchayat",
  "street light problem": "Electricity",
  "drainage / cleaning": "Water",
  "drainage issue": "Water",
  "hospital / health emergency": "Hospital",
  "ration / food supply": "Ration",
  "public store / ration": "Ration",
  "pension / welfare": "Panchayat",
  "public transport issue": "Road",
  "women safety issue": "Women Safety",
  "noise pollution": "Panchayat",
  other: "Other",
};

export function categoryToDuty(category) {
  const c = String(category || "Other").trim().toLowerCase();
  if (CATEGORY_TO_DUTY[c]) return CATEGORY_TO_DUTY[c];
  for (const [key, duty] of Object.entries(CATEGORY_TO_DUTY)) {
    if (c.includes(key.split(" ")[0]) || c.includes(duty.toLowerCase())) return duty;
  }
  return "Other";
}

export function dutyMatchesCategory(duty, category) {
  const d = String(duty || "Other").trim().toLowerCase();
  const c = String(category || "Other").trim().toLowerCase();
  
  if (d === c) return true;
  if (d.includes(c) || c.includes(d)) return true;
  
  const target = String(categoryToDuty(category)).toLowerCase();
  if (d === target) return true;
  if (d === "panchayat" && ["other", "ration", "road"].includes(target)) return true;
  if (d === "other" && target === "other") return true;
  return false;
}

export function workerLocationMatches(complaint, worker) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const ws = norm(worker?.state);
  const wc = norm(worker?.city);
  const ww = norm(worker?.ward);
  const cs = norm(complaint?.state);
  const cc = norm(complaint?.city);
  const cv = norm(complaint?.village);
  const ca = norm(complaint?.address);
  const loc = `${cs} ${cc} ${cv} ${ca}`;

  if (ws && cs && ws !== "general") {
    if (ws === cs && wc === cc) return true;
    if (ws === cs && cc && wc && wc !== cc) {
      if (ww && (cv.includes(ww) || ca.includes(ww) || ww === cv)) return true;
      return false;
    }
    return ws === cs;
  }

  if (!ws || ws === "general") {
    const area = wc || ww;
    if (!area) return true;
    return loc.includes(area) || area.includes(cc) || area.includes(cv) || cc.includes(area);
  }
  return true;
}

export function workerMatchesComplaint(worker, complaint) {
  return (
    dutyMatchesCategory(worker?.duty_position, complaint?.category) &&
    workerLocationMatches(complaint, worker)
  );
}

/** Statuses shown in admin processing queue (resolved history hidden) */
export const ADMIN_PROCESSING_STATUSES = [
  "PENDING_ADMIN_VERIFY",
  "VERIFIED",
  "ASSIGNED_TO_WORKER",
  "IN_PROGRESS",
  "WORKER_COMPLETED",
  "REOPENED",
];

export const RESOLVED_STATUSES = ["RESOLVED", "CLOSED"];

export function isResolvedComplaint(complaint) {
  return RESOLVED_STATUSES.includes(String(complaint?.status || "").toUpperCase());
}

export function isAdminProcessingComplaint(complaint) {
  return !isResolvedComplaint(complaint);
}

/** Map backend status to workflow progress index (0–5) */
export const WORKFLOW_STEPS = [
  "PENDING_ADMIN_VERIFY",
  "VERIFIED",
  "ASSIGNED_TO_WORKER",
  "IN_PROGRESS",
  "WORKER_COMPLETED",
  "RESOLVED",
];

export function getProgressPercentage(status) {
  const idx = WORKFLOW_STEPS.indexOf(status);
  return idx >= 0 ? ((idx + 1) / WORKFLOW_STEPS.length) * 100 : 10;
}

export function getStatusColor(status) {
  const map = {
    PENDING_ADMIN_VERIFY: "bg-blue-100 border-blue-300 text-blue-900",
    VERIFIED: "bg-indigo-100 border-indigo-300 text-indigo-900",
    ASSIGNED_TO_WORKER: "bg-amber-100 border-amber-300 text-amber-900",
    IN_PROGRESS: "bg-purple-100 border-purple-300 text-purple-900",
    WORKER_COMPLETED: "bg-cyan-100 border-cyan-300 text-cyan-900",
    RESOLVED: "bg-green-100 border-green-300 text-green-900",
    REOPENED: "bg-red-100 border-red-300 text-red-900",
  };
  return map[status] || "bg-slate-100 border-slate-300 text-slate-900";
}
