import { useEffect, useState, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle, XCircle, Loader2, Mail } from "lucide-react";
import { api } from "../utils/api";

const VerifyCitizenEmail = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState("loading"); // "loading" | "success" | "error" | "no-token"
  const [message, setMessage] = useState("");
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    if (!token) {
      setStatus("no-token");
      setMessage("No verification token found in the link. Please use the link sent to your email.");
      return;
    }

    const verify = async () => {
      try {
        const res = await api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`);
        setStatus("success");
        setMessage(res.data?.message || "Your email has been successfully verified! You can now sign in to your account.");
      } catch (err) {
        const detail = err?.response?.data?.detail || err?.message || "Verification failed.";
        setStatus("error");
        setMessage(detail.includes("expired") ? "This verification link has expired. Please register again to get a new link." : "This verification link is invalid or has already been used.");
      }
    };

    verify();
  }, [token]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "20px",
          padding: "48px 40px",
          maxWidth: "460px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 25px 50px rgba(0,0,0,0.4)",
        }}
      >
        {/* Logo */}
        <div style={{ fontSize: "28px", fontWeight: "900", color: "#fff", marginBottom: "8px" }}>
          🏛️ SmartGov
        </div>
        <p style={{ color: "#94a3b8", fontSize: "13px", marginBottom: "36px" }}>
          Smart Public Complaint Priority &amp; Response System
        </p>

        {/* Status Icon */}
        {status === "loading" && (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            style={{ display: "inline-block", marginBottom: "24px" }}
          >
            <Loader2 size={52} color="#16a34a" />
          </motion.div>
        )}
        {status === "success" && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{ marginBottom: "24px" }}
          >
            <CheckCircle size={64} color="#22c55e" />
          </motion.div>
        )}
        {(status === "error" || status === "no-token") && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            style={{ marginBottom: "24px" }}
          >
            <XCircle size={64} color="#ef4444" />
          </motion.div>
        )}

        {/* Title */}
        <h1
          style={{
            fontSize: "24px",
            fontWeight: "800",
            color: status === "success" ? "#22c55e" : status === "loading" ? "#94a3b8" : "#ef4444",
            margin: "0 0 12px",
          }}
        >
          {status === "loading" && "Verifying Your Email…"}
          {status === "success" && "✅ Email Verified!"}
          {(status === "error" || status === "no-token") && "❌ Verification Failed"}
        </h1>

        {/* Message */}
        <p style={{ color: "#cbd5e1", fontSize: "15px", lineHeight: "1.7", margin: "0 0 32px" }}>
          {status === "loading" ? "Please wait while we verify your email address…" : message}
        </p>

        {/* Action Button */}
        {status === "success" && (
          <Link
            to="/login?role=public&verified=1"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "linear-gradient(135deg, #16a34a, #15803d)",
              color: "#fff",
              padding: "14px 32px",
              borderRadius: "12px",
              textDecoration: "none",
              fontWeight: "700",
              fontSize: "15px",
              boxShadow: "0 4px 15px rgba(22,163,74,0.4)",
            }}
          >
            Sign In to Your Account →
          </Link>
        )}
        {(status === "error" || status === "no-token") && (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", alignItems: "center" }}>
            <Link
              to="/register?role=public"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(99,102,241,0.2)",
                color: "#a5b4fc",
                padding: "12px 28px",
                borderRadius: "10px",
                textDecoration: "none",
                fontWeight: "600",
                fontSize: "14px",
                border: "1px solid rgba(99,102,241,0.3)",
              }}
            >
              <Mail size={16} />
              Register Again
            </Link>
            <Link
              to="/login?role=public"
              style={{ color: "#64748b", fontSize: "13px", textDecoration: "underline" }}
            >
              Back to Login
            </Link>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default VerifyCitizenEmail;
