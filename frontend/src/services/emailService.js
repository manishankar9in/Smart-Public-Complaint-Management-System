import { api } from "../utils/api";

const FRIENDLY_MESSAGES = {
  PROCESSING: "Your complaint has been received and is under processing.",
  WORKER_VERIFYING: "A field worker has been assigned and is verifying your issue on site.",
  PROBLEM_SOLVED: "Your complaint has been resolved by the authority. See the message below for details.",
  ASSIGNED: "A field worker has been assigned and is verifying your issue on site.",
  RESOLVED: "Your complaint has been resolved by the authority.",
  SUBMITTED: "Your complaint has been received and is under processing.",
  SOLVED: "Your complaint has been resolved by the authority.",
  REOPENED: "Your complaint has been reopened for further review.",
};

/**
 * Send transactional email notifications through the backend using Brevo SMTP.
 * @param {string} type - PROCESSING | WORKER_VERIFYING | PROBLEM_SOLVED | ASSIGNED | RESOLVED | REOPENED | SUBMITTED | SOLVED
 * @param {object} params - { to_email, name, complaint_id, category, priority, address, message }
 */
export const sendNotification = async (type, params) => {
  if (!params?.to_email) {
    return { success: false, message: "No recipient email provided." };
  }

  const normalizedType =
    type === "ASSIGNED" ? "WORKER_VERIFYING" :
    type === "RESOLVED" || type === "SOLVED" ? "PROBLEM_SOLVED" :
    type === "SUBMITTED" ? "PROCESSING" :
    type;

  const bodyText =
    params.message ||
    FRIENDLY_MESSAGES[normalizedType] ||
    FRIENDLY_MESSAGES[type] ||
    `Your complaint regarding ${params.category || "your issue"} has been updated.`;

  try {
    const res = await api.post("/notifications/send-email", {
      to_email: params.to_email,
      name: params.name || "Citizen",
      complaint_id: params.complaint_id || "N/A",
      category: params.category || "General Complaint",
      status: normalizedType,
      message: bodyText,
    });
    return res.data;
  } catch (error) {
    console.error(`Brevo SMTP Notification [${normalizedType}] error:`, error?.response?.data || error.message);
    return { success: false, error };
  }
};

/**
 * Trigger worker password reset email via backend Brevo SMTP.
 * @param {string} email 
 * @param {string} [resetLink] 
 */
export const sendWorkerResetEmail = async (email, resetLink = "") => {
  try {
    const res = await api.post("/worker-auth/forgot-password", { email });
    return res.data;
  } catch (error) {
    console.error("Worker password reset error:", error?.response?.data || error.message);
    throw error;
  }
};
