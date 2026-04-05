import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { 
  Users, 
  HardHat, 
  ShieldCheck, 
  ArrowRight,
  Zap,
  MapPin,
  Clock
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { Card, Badge } from "../components/UI";

const SmartGovernanceHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const roles = [
    {
      id: "public",
      title: "Public User",
      subtitle: "Submit & Track Issues",
      icon: Users,
      color: "bg-blue-600",
      lightColor: "bg-blue-50",
      textColor: "text-blue-600",
      description: "Raise complaints with live GPS data, track municipal progress, and provide feedback.",
      path: "/login?role=public",
      features: ["GPS Proof Upload", "AI Priority Tracking", "Email Notifications"]
    },
    {
      id: "worker",
      title: "Field Worker",
      subtitle: "Authority Terminal",
      icon: HardHat,
      color: "bg-amber-600",
      lightColor: "bg-amber-50",
      textColor: "text-amber-600",
      description: "Access assigned missions by area, upload solved proof, and sync with local board.",
      path: "/login?role=worker",
      features: ["Task Routing", "Proof Submission", "Area-based Duty"]
    },
    {
      id: "admin",
      title: "Municipal Admin",
      subtitle: "Governance Control",
      icon: ShieldCheck,
      color: "bg-indigo-600",
      lightColor: "bg-indigo-50",
      textColor: "text-indigo-600",
      description: "Audit citizen proof, verify solutions, and manage intelligence prioritization.",
      path: "/login?role=admin",
      features: ["Proof Verification", "Worker Assignment", "Data Analytics"]
    }
  ];

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* National-style accent strip */}
      <div className="flex h-1.5 w-full" aria-hidden>
        <div className="flex-1 bg-[#FF9933]" />
        <div className="flex-1 bg-white border-y border-slate-200" />
        <div className="flex-1 bg-[#138808]" />
      </div>
      <div className="gov-page-header py-3 px-6 text-center">
        <p className="text-[11px] font-semibold tracking-wide opacity-95">
          Ministry-style public grievance portal — transparent, time-bound redressal
        </p>
      </div>

      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-6 pt-16 pb-28">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-20"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded border border-slate-200 mb-8 shadow-sm">
             <Zap size={14} className="text-accent" />
             <span className="text-[10px] font-bold text-primary uppercase tracking-widest leading-none">Integrated complaint management system</span>
          </div>
          <h1 className="text-4xl lg:text-6xl font-bold text-secondary tracking-tight leading-tight mb-6">
            Public complaint <br/> 
            <span className="text-primary">priority & response</span>
          </h1>
          <p className="text-base text-muted font-medium max-w-2xl mx-auto mb-10 leading-relaxed">
             File issues with GPS-verified proof, track officer action, and receive updates — aligned with standard e-governance practice.
          </p>
          
          {user ? (
            <button 
              onClick={() => navigate(user.role === 'admin' ? '/admin-dashboard' : user.role === 'worker' ? '/worker-dashboard' : '/user-dashboard')}
              className="btn-primary !px-10 !py-5 text-sm flex items-center justify-center gap-3 mx-auto"
            >
              Enter Dashboard Terminal <ArrowRight size={20} />
            </button>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
               <div className="flex -space-x-4">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`w-10 h-10 rounded-full border-2 border-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400 overflow-hidden`}>
                      <Users size={16} />
                    </div>
                  ))}
               </div>
               <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Join 2,400+ Citizens raising issues today</p>
            </div>
          )}
        </motion.div>

        {/* Role Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {roles.map((role, idx) => (
            <motion.div
              key={role.id}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * idx }}
            >
              <Link to={role.path} className="block group">
                <Card className="h-full !p-10 border border-slate-200 shadow-soft group-hover:shadow-premium transition-all bg-white group-hover:border-primary/30">
                   <div className="flex justify-between items-start mb-10">
                      <div className={`w-16 h-16 ${role.lightColor} ${role.textColor} rounded-[24px] flex items-center justify-center group-hover:scale-110 transition-transform`}>
                         <role.icon size={32} strokeWidth={2.5} />
                      </div>
                      <Badge variant="primary" className={`${role.color} !text-white !border-0 text-[9px] !px-4`}>
                        {role.id.toUpperCase()} PORTAL
                      </Badge>
                   </div>
                   
                   <h3 className="text-2xl font-black text-slate-900 tracking-tight mb-2 uppercase">{role.title}</h3>
                   <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">{role.subtitle}</p>
                   
                   <p className="text-sm text-slate-500 font-medium leading-relaxed mb-10 min-h-[60px]">
                      {role.description}
                   </p>

                   <div className="space-y-3 mb-10">
                      {role.features.map(f => (
                        <div key={f} className="flex items-center gap-3">
                           <div className={`w-1.5 h-1.5 rounded-full ${role.color}`}></div>
                           <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{f}</span>
                        </div>
                      ))}
                   </div>

                   <div className={`mt-auto pt-6 border-t border-slate-100 flex items-center justify-between group-hover:${role.textColor} transition-colors`}>
                      <span className="text-[10px] font-black uppercase tracking-widest">Secure Access</span>
                      <ArrowRight size={18} className="group-hover:translate-x-2 transition-transform" />
                   </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* System Integrity Sub-footer */}
      <div className="border-t border-slate-200 bg-white py-12">
         <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex gap-12">
               <div className="flex items-center gap-3">
                  <MapPin size={20} className="text-primary" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 leading-none">GPS LOCK</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Verified Location Proof</p>
                  </div>
               </div>
               <div className="flex items-center gap-3">
                  <Clock size={20} className="text-accent" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-900 leading-none">REAL-TIME SYNC</p>
                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">AI Priority Engine active</p>
                  </div>
               </div>
            </div>
            
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">
               Governed by Smart Excellence Protocols
            </p>
         </div>
      </div>
    </div>
  );
};

export default SmartGovernanceHome;
