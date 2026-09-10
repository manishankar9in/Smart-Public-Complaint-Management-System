import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, role, loading } = useAuth();
  const location = useLocation();

  const getDashboardForRole = (currentRole) => {
    if (currentRole === "admin") return "/admin/dashboard";
    if (currentRole === "worker") return "/worker/dashboard";
    return "/user-dashboard";
  };

  const inferRoleFromPath = (pathname) => {
    if (pathname.startsWith("/admin")) return "admin";
    if (pathname.startsWith("/worker")) return "worker";
    if (pathname.startsWith("/user") || pathname.startsWith("/raise-complaint")) return "public";
    return "";
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!user) {
    const inferredRole = inferRoleFromPath(location.pathname);
    const loginPath = inferredRole ? `/login?role=${inferredRole}` : "/login";
    return <Navigate to={loginPath} replace />;
  }

  // Strictly block unverified users from accessing protected dashboards
  if (user?.authSource === "firebase" && user?.providerData?.some(p => p.providerId === "password") && !user?.emailVerified) {
    return <Navigate to={`/email-verification-pending?email=${encodeURIComponent(user.email || "")}&role=public`} replace />;
  }
  if (user?.authSource === "worker" && user?.email_verified === false) {
    return <Navigate to={`/email-verification-pending?email=${encodeURIComponent(user.email || "")}&role=worker`} replace />;
  }

  const effectiveRole = user?.role || role;
  
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(effectiveRole)) {
    console.warn(`Access denied: User role "${effectiveRole}" not in allowed roles:`, allowedRoles);
    return <Navigate to={getDashboardForRole(effectiveRole)} replace />;
  }

  return children;
};
