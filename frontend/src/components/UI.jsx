import { motion } from "framer-motion";
import { TrendingUp, AlertCircle, CheckCircle, Clock } from "lucide-react";

export const Card = ({ children, className = "", noPadding = false }) => (
  <div className={`bg-white rounded-2xl shadow-soft border border-slate-100 overflow-hidden ${!noPadding ? "p-6" : ""} ${className}`}>
    {children}
  </div>
);

export const Badge = ({ children, variant = "default", className = "" }) => {
  const variants = {
    default: "bg-slate-100 text-muted",
    success: "bg-green-50 text-success border border-green-100",
    warning: "bg-amber-50 text-warning border border-amber-100",
    danger: "bg-red-50 text-danger border border-red-100",
    primary: "bg-primary/10 text-primary border border-primary/20",
  };
  return (
    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

export const StatsCard = ({ title, value, icon: Icon, trend, trendLabel, variant = "primary" }) => {
  const colors = {
    primary: { bg: "bg-primary/10", text: "text-primary" },
    success: { bg: "bg-green-50", text: "text-success" },
    warning: { bg: "bg-amber-50", text: "text-warning" },
    danger: { bg: "bg-red-50", text: "text-danger" },
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="bg-white p-6 rounded-3xl shadow-soft border border-slate-50 flex flex-col gap-4 relative overflow-hidden"
    >
      <div className="flex justify-between items-start">
        <div className={`p-4 rounded-2xl ${colors[variant].bg} ${colors[variant].text} shadow-sm`}>
          <Icon size={24} />
        </div>
        {trend && (
           <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${trend > 0 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
             <TrendingUp size={12} className={trend < 0 ? "rotate-90" : ""} />
             {Math.abs(trend)}%
           </div>
        )}
      </div>
      <div>
        <p className="text-[10px] font-black text-muted uppercase tracking-widest mb-1">{title}</p>
        <h3 className="text-3xl font-black text-secondary tracking-tight">{value}</h3>
      </div>
      {trendLabel && (
        <p className="text-[10px] text-muted font-medium italic opacity-60">{trendLabel}</p>
      )}
    </motion.div>
  );
};

export const Button = ({ children, variant = "primary", className = "", ...props }) => {
  const variants = {
    primary: "btn-primary",
    secondary: "btn-secondary",
    danger: "bg-danger text-white hover:bg-red-600 shadow-lg shadow-red-200",
    outline: "border-2 border-slate-100 text-muted hover:border-primary/20 hover:text-primary transition-all",
  };

  return (
    <button 
      className={`${variants[variant] || variants.primary} px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
