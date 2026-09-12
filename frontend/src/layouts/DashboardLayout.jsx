import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  PlusCircle,
  ClipboardList,
  ShieldCheck,
  LogOut,
  Menu,
  Bell,
  User,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  clearAllNotifications,
  deleteNotification,
} from "../services/notificationService";

const SidebarItem = ({ icon: Icon, label, path, active, onClick }) => (
  <Link
    to={path}
    onClick={onClick}
    className={`group flex items-center gap-3 rounded-lg border-l-4 px-3 sm:px-4 py-2.5 sm:py-3 transition-all cursor-pointer ${active
      ? "border-blue-600 bg-blue-50 text-blue-900 shadow-sm"
      : "border-transparent text-slate-700 hover:bg-green-50 hover:text-green-800 active:bg-green-100"
      }`}
  >
    <Icon size={18} className={active ? "text-blue-700" : "text-pink-600 opacity-90 group-hover:text-green-700 flex-shrink-0"} />
    <span className="font-semibold text-xs uppercase tracking-wide text-black truncate">{label}</span>
  </Link>
);

const DashboardLayout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navItems = {
    public: [
      { icon: LayoutDashboard, label: "My Dashboard", path: "/user-dashboard" },
      { icon: PlusCircle, label: "Raise Complaint", path: "/raise-complaint" },
    ],
    worker: [
      { icon: ClipboardList, label: "Worker Dashboard", path: "/worker/dashboard" },
    ],
    admin: [
      { icon: ShieldCheck, label: "Admin Dashboard", path: "/admin/dashboard" },
    ]
  };

  const roleNavItems = navItems[user?.role] || [];
  const notificationUserId = useMemo(
    () => (user?.role === "worker" ? user?.worker_uid || user?.uid : user?.uid || user?.firebase_uid),
    [user]
  );

  useEffect(() => {
    let mounted = true;
    const loadNotifications = async () => {
      if (!notificationUserId) return;
      try {
        const data = await fetchNotifications(notificationUserId);
        if (!mounted) return;
        setNotifications(data.items || []);
        setUnreadCount(data.unread || 0);
      } catch {
        // keep dashboard usable even if notifications fail
      }
    };
    loadNotifications();
    const id = setInterval(loadNotifications, 30000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [notificationUserId]);

  const handleNotificationClick = async (item) => {
    if (!item?.read && item?._id) {
      await markNotificationRead(item._id);
      setNotifications((prev) => prev.map((n) => (n._id === item._id ? { ...n, read: true } : n)));
      setUnreadCount((x) => Math.max(0, x - 1));
    }
  };

  const handleDismissNotification = async (e, notifId) => {
    e.stopPropagation();
    try {
      await deleteNotification(notifId);
      setNotifications((prev) => prev.filter((n) => n._id !== notifId));
      setUnreadCount((x) => Math.max(0, x - 1));
    } catch {
      // silently handle
    }
  };

  const handleClearAll = async () => {
    if (!notificationUserId) return;
    try {
      await clearAllNotifications(notificationUserId);
      setNotifications([]);
      setUnreadCount(0);
    } catch {
      // silently handle
    }
  };

  return (
    <div className="dashboard-app flex h-screen overflow-hidden bg-white">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-slate-200 bg-white sm:w-64 md:w-72 lg:static lg:translate-x-0 ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          } transition-transform duration-300`}
      >
        {/* Logo — fixed top */}
        <div className="shrink-0 border-b border-slate-200 p-3 sm:p-4">
          <Link to="/" className="flex items-center gap-2 sm:gap-3 px-1 group cursor-pointer">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 border border-slate-200 p-1 shadow-sm transition-transform group-hover:scale-105">
              <img src="/logo-icon.png" alt="Smart Public Complaint" className="h-full w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[9px] font-bold uppercase tracking-wider text-emerald-600">Portal</p>
              <h1 className="truncate text-xs sm:text-sm font-black text-slate-900 leading-tight">Smart Public Complaint</h1>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                setIsSidebarOpen(false);
              }}
              className="rounded-lg border border-slate-200 p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
              aria-label="Close navigation"
            >
              ✕
            </button>
          </Link>
        </div>

        {/* Nav — scrollable middle only */}
        <nav className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 space-y-1 no-scrollbar">
          {roleNavItems.map((item) => (
            <SidebarItem
              key={item.path}
              {...item}
              active={location.pathname === item.path}
              onClick={() => setIsSidebarOpen(false)}
            />
          ))}
        </nav>

        {/* Logout — fixed bottom, never scrolls */}
        <div className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-bold uppercase tracking-widest text-red-700 transition-colors hover:bg-red-50"
          >
            <LogOut size={18} className="shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
        {/* Top Navbar */}
        <header className="sticky top-0 z-30 flex h-14 sm:h-16 md:h-[4.25rem] items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-4 md:px-6 lg:px-10 gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setIsSidebarOpen(true)}
              className="rounded-lg p-1.5 sm:p-2 text-blue-800 transition-all hover:bg-blue-50 active:bg-blue-100 cursor-pointer lg:hidden flex-shrink-0"
            >
              <Menu size={20} />
            </button>
            <div className="hidden lg:block min-w-0">
              <h2 className="text-base sm:text-lg font-bold capitalize tracking-tight text-blue-900 truncate">{user?.role} Portal</h2>
              <p className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-wide text-green-700 truncate">Official complaint management</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 ml-auto">
            <button
              type="button"
              onClick={() => setShowNotifications((v) => !v)}
              className="relative rounded-lg border border-pink-200 bg-pink-50 p-1.5 sm:p-2.5 text-pink-700 transition-all hover:bg-pink-100 active:bg-pink-200 cursor-pointer flex-shrink-0"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-red-600 px-1 text-[8px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            <div className="mx-0.5 sm:mx-1 h-8 sm:h-10 w-px bg-slate-200"></div>
            <div className="group flex cursor-pointer items-center gap-2 sm:gap-3 pl-0.5 sm:pl-2">
              <div className="hidden text-right sm:block min-w-0">
                <p className="text-xs font-black leading-none text-black truncate">{user?.name || "User"}</p>
                <p className="mt-1 text-[8px] font-bold uppercase tracking-widest text-green-700 truncate">Verified</p>
              </div>
              <div className="flex h-8 sm:h-10 w-8 sm:w-10 items-center justify-center overflow-hidden rounded-lg border border-blue-200 bg-blue-50 text-blue-800 shadow-sm transition-all group-hover:border-blue-400 group-hover:bg-blue-100 flex-shrink-0">
                {user?.photoURL ? <img src={user.photoURL} alt="Avatar" className="h-full w-full object-cover" /> : <User size={18} />}
              </div>
            </div>
          </div>
        </header>
        <AnimatePresence>
          {showNotifications && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="absolute right-2 sm:right-4 top-16 sm:top-20 z-40 w-[320px] sm:w-[340px] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl sm:rounded-2xl border border-slate-200 bg-white shadow-xl md:right-6 lg:right-10"
            >
              <div className="flex items-center justify-between border-b border-slate-200 p-3 sm:p-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-blue-900">Notifications</h4>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await markAllNotificationsRead(notificationUserId);
                      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
                      setUnreadCount(0);
                    }}
                    className="text-[10px] font-bold uppercase tracking-widest text-blue-700 hover:underline cursor-pointer"
                  >
                    Mark read
                  </button>
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="text-[10px] font-bold uppercase tracking-widest text-red-600 hover:underline cursor-pointer flex items-center gap-0.5"
                    >
                      <Trash2 size={11} /> Clear
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="p-4 sm:p-6 text-center text-xs font-medium text-slate-500">No active notifications.</div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item._id}
                      onClick={() => handleNotificationClick(item)}
                      className={`group relative flex items-start justify-between p-3 sm:p-4 text-left transition-all cursor-pointer ${item.read ? "bg-white hover:bg-slate-50" : "bg-blue-50/70 hover:bg-blue-100/60"}`}
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="text-xs font-semibold leading-relaxed text-slate-800 line-clamp-2">{item.message}</p>
                        <p className="mt-1 text-[10px] text-slate-400">
                          {item.timestamp ? new Date(item.timestamp).toLocaleString() : ""}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDismissNotification(e, item._id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600 p-1 rounded transition-opacity"
                        title="Dismiss"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Content */}
        <main className="min-h-0 flex-1 overflow-y-auto bg-white p-3 sm:p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
