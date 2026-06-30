import emailjs from '@emailjs/browser';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

/** Default template (single-template setup) */
const TEMPLATE_DEFAULT = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;

/** Optional: one template per lifecycle stage (EmailJS dashboard) */
const TEMPLATE_BY_TYPE = {
  PROCESSING: import.meta.env.VITE_EMAILJS_TEMPLATE_PROCESSING || TEMPLATE_DEFAULT,
  WORKER_VERIFYING: import.meta.env.VITE_EMAILJS_TEMPLATE_ASSIGNED || import.meta.env.VITE_EMAILJS_TEMPLATE_WORKER_VERIFYING || TEMPLATE_DEFAULT,
  PROBLEM_SOLVED: import.meta.env.VITE_EMAILJS_TEMPLATE_SOLVED || import.meta.env.VITE_EMAILJS_TEMPLATE_PROBLEM_SOLVED || TEMPLATE_DEFAULT,
  REOPENED: import.meta.env.VITE_EMAILJS_TEMPLATE_REOPENED || TEMPLATE_DEFAULT,
};

/** EmailJS rejects huge bodies (413). Strip data URLs and cap string length. */
const MAX_TEMPLATE_STRING_LEN = 4500;

function sanitizeEmailJsParams(raw) {
  const out = {};
  let strippedDataUrl = false;
  for (const [k, v] of Object.entries(raw)) {
    if (v == null) {
      out[k] = v;
      continue;
    }
    if (typeof v === "string") {
      if (v.startsWith("data:")) {
        strippedDataUrl = true;
        out[k] = "";
      } else if (v.length > MAX_TEMPLATE_STRING_LEN) {
        out[k] = `${v.slice(0, MAX_TEMPLATE_STRING_LEN)}…`;
      } else {
        out[k] = v;
      }
      continue;
    }
    out[k] = v;
  }
  if (strippedDataUrl) {
    out.photo_notice =
      "Images are not attached to this email (size limits). Open SmartGov → Complaint details to view photos.";
  }
  return out;
}

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
 * @param {string} type - PROCESSING | WORKER_VERIFYING | PROBLEM_SOLVED | ASSIGNED | RESOLVED | REOPENED | SUBMITTED | SOLVED
 * @param {object} params - { to_email, name, complaint_id, category, priority, address, message, photo_url }
 */
export const sendNotification = async (type, params) => {
  if (!SERVICE_ID || !PUBLIC_KEY) {
    console.warn("EmailJS: set VITE_EMAILJS_SERVICE_ID and VITE_EMAILJS_PUBLIC_KEY in .env.local");
    return;
  }

  const normalizedType =
    type === "ASSIGNED" ? "WORKER_VERIFYING" :
    type === "RESOLVED" || type === "SOLVED" ? "PROBLEM_SOLVED" :
    type === "SUBMITTED" ? "PROCESSING" :
    type;

  const templateId =
    TEMPLATE_BY_TYPE[normalizedType] ||
    TEMPLATE_DEFAULT;

  if (!templateId) {
    console.warn("EmailJS: no template ID configured. Add VITE_EMAILJS_TEMPLATE_ID or stage-specific templates.");
    return;
  }

  const bodyText =
    params.message ||
    FRIENDLY_MESSAGES[normalizedType] ||
    FRIENDLY_MESSAGES[type] ||
    `Your complaint regarding ${params.category || "your issue"} has been updated.`;

  const templateParams = sanitizeEmailJsParams({
    ...params,
    notification_type: normalizedType,
    subject: `Complaint update [${normalizedType}] #${params.complaint_id || "N/A"}`,
    status: normalizedType,
    time: new Date().toLocaleString(),
    message: bodyText,
    email_to: params.to_email,
    to_email: params.to_email,
    reply_to: params.to_email,
  });

  try {
    const response = await emailjs.send(SERVICE_ID, templateId, templateParams, PUBLIC_KEY);
    console.log(`EmailJS [${normalizedType}]:`, response.status, response.text);
    return response;
  } catch (error) {
    console.error(`EmailJS error [${normalizedType}]:`, error);
    throw error;
  }
};

/**
 * Send worker password reset link using EmailJS
 * @param {string} email 
 * @param {string} resetLink 
 */
export const sendWorkerResetEmail = async (email, resetLink) => {
  if (!SERVICE_ID || !PUBLIC_KEY || !TEMPLATE_DEFAULT) {
    console.warn("EmailJS not fully configured");
    throw new Error("EmailJS service credentials missing in environment config.");
  }
  const templateParams = {
    to_email: email,
    email_to: email,
    subject: "SmartGov Worker — Password Reset Request",
    message: `Hello Worker,

We received a request to reset your worker portal password. Click the link below to set a new password:

${resetLink}

This link is valid for 1 hour. If you did not request this, you can safely ignore this email.

— SmartGov Team`,
    time: new Date().toLocaleString(),
  };
  return await emailjs.send(SERVICE_ID, TEMPLATE_DEFAULT, templateParams, PUBLIC_KEY);
};

