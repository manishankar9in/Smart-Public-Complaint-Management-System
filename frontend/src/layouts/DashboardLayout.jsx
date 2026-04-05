import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, 
  PlusCircle, 
  ClipboardList, 
  ShieldCheck, 
  LogOut, 
  Menu, 
  X,
  Bell,
  User,
  Settings
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";

const SidebarItem = ({ icon: Icon, label, path, active, onClick }) => (
  <Link
    to={path}
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all group border-l-4 ${
      active
        ? "bg-white/10 text-white border-accent shadow-inner"
        : "border-transparent text-slate-300 hover:bg-white/5 hover:text-white"
    }`}
  >
    <Icon size={20} className={active ? "text-white" : "opacity-80 group-hover:opacity-100"} />
    <span className="font-semibold text-xs uppercase tracking-wide">{label}</span>
  </Link>
);

const DashboardLayout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
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
      { icon: ClipboardList, label: "Mission Terminal", path: "/worker-dashboard" },
    ],
    admin: [
      { icon: ShieldCheck, label: "Admin Oversight", path: "/admin-dashboard" },
    ]
  };

  const roleNavItems = navItems[user?.role] || [];

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-sidebar/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 w-72 bg-sidebar z-50 transform transition-transform duration-500 lg:translate-x-0 lg:static lg:inset-0 ${
          isSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center gap-3 mb-10 px-2 pb-6 border-b border-white/10">
             <div className="w-11 h-11 bg-white/10 rounded-lg flex items-center justify-center text-white font-bold text-lg border border-white/20">भा</div>
             <div>
               <p className="text-[9px] uppercase tracking-[0.2em] text-slate-400 font-semibold">Digital India</p>
               <h1 className="text-white font-bold text-base leading-tight tracking-tight">Complaint Portal</h1>
               <p className="text-[10px] text-slate-400 mt-0.5">Public grievance redressal</p>
             </div>
          </div>

          <nav className="flex-1 space-y-2">
            {roleNavItems.map((item) => (
              <SidebarItem
                key={item.path}
                {...item}
                active={location.pathname === item.path}
                onClick={() => setIsSidebarOpen(false)}
              />
            ))}
          </nav>

          <div className="mt-auto space-y-2 border-t border-white/5 pt-6">
             <button
               onClick={handleLogout}
               className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-red-400 hover:bg-red-500/10 transition-all font-bold text-xs uppercase tracking-widest"
             >
               <LogOut size={20} />
               <span>Sign Out</span>
             </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Navbar */}
        <header className="h-[4.5rem] bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-12 sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 text-muted hover:text-primary transition-colors"
            >
              <Menu size={24} />
            </button>
            <div className="hidden lg:block">
               <h2 className="text-secondary font-bold text-lg tracking-tight capitalize">{user?.role} portal</h2>
               <p className="text-[10px] text-muted font-semibold tracking-wide uppercase">Official dashboard — Government of India style interface</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button type="button" className="p-2.5 bg-slate-100 text-muted rounded-lg hover:text-primary hover:bg-slate-200 transition-all relative">
              <Bell size={20} />
              <span className="absolute top-2 right-2 w-2 h-2 bg-danger rounded-full border-2 border-white"></span>
            </button>
            <div className="h-10 w-px bg-slate-100 mx-2"></div>
            <div className="flex items-center gap-3 pl-2 group cursor-pointer">
               <div className="text-right hidden sm:block">
                  <p className="text-xs font-black text-secondary leading-none">{user?.name || "Governance User"}</p>
                  <p className="text-[9px] text-muted font-bold uppercase tracking-widest mt-1 opacity-60">Verified Identity</p>
               </div>
               <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center text-muted group-hover:bg-primary group-hover:text-white transition-all overflow-hidden border border-slate-200 shadow-sm">
                  {user?.photoURL ? <img src={user.photoURL} alt="Avatar" /> : <User size={20} />}
               </div>
            </div>
          </div>
        </header>

        {/* Dynamic Content */}
        <main className="flex-1 overflow-y-auto p-6 lg:p-12">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
