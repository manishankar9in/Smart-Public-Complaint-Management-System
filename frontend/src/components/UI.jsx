import { motion } from "framer-motion";
import { TrendingUp, AlertCircle, CheckCircle, Clock } from "lucide-react";

export const Card = ({ children, className = "", noPadding = false }) => (
  <div className={`card w-full max-w-full cursor-default ${noPadding ? "p-0" : "p-3 sm:p-4 md:p-5 lg:p-6"} ${className}`}>
    {children}
  </div>
);

export const Badge = ({ children, variant = "default", className = "" }) => {
  const variants = {
    default: "bg-slate-100 text-slate-900 border border-slate-300 cursor-default",
    success: "status-completed cursor-default",
    warning: "status-pending cursor-default",
    danger: "priority-critical cursor-default",
    primary: "status-assigned cursor-default",
  };
  return (
    <span className={`inline-flex items-center rounded-lg px-2 sm:px-2.5 py-1 text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
};

export const StatsCard = ({ title, value, icon: Icon, trend, trendLabel, variant = "primary" }) => {
  const colors = {
    primary: "border border-blue-200 bg-blue-100 text-blue-900",
    success: "border border-green-200 bg-green-100 text-green-900",
    warning: "border border-amber-200 bg-amber-100 text-amber-900",
    danger: "border border-red-200 bg-red-100 text-red-900",
  };

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="card cursor-default"
    >
      <div className="mb-3 sm:mb-4 flex items-start justify-between">
        <div className={`rounded-lg sm:rounded-2xl border p-2 sm:p-3 ${colors[variant]}`}>
          <Icon size={20} className="sm:w-6 sm:h-6" />
        </div>
        {typeof trend === "number" && (
           <div className={`flex items-center gap-1 rounded-full px-2 sm:px-2.5 py-1 text-[9px] sm:text-[10px] font-black ${trend > 0 ? "border border-green-300 bg-green-100 text-green-900" : "border border-red-300 bg-red-100 text-red-900"}`}>
             <TrendingUp size={10} className={trend < 0 ? "rotate-90" : ""} />
             {Math.abs(trend)}%
           </div>
        )}
      </div>
      <div className="space-y-0.5 sm:space-y-1">
        <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-green-800">{title}</p>
        <h3 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-blue-900">{value}</h3>
      </div>
      {trendLabel && (
        <p className="mt-2 sm:mt-3 text-[10px] sm:text-[11px] text-pink-800">{trendLabel}</p>
      )}
    </motion.div>
  );
};

export const Button = ({ children, variant = "primary", className = "", ...props }) => {
  const variants = {
    primary: "btn-primary cursor-pointer",
    secondary: "btn-secondary cursor-pointer",
    danger: "inline-flex items-center justify-center gap-2 rounded-xl border border-red-400 bg-red-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-red-900 transition hover:bg-red-200 cursor-pointer active:bg-red-300 disabled:opacity-50 disabled:cursor-not-allowed",
    outline: "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-400 bg-transparent px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-black transition hover:border-blue-600 hover:text-blue-900 hover:bg-blue-50 cursor-pointer active:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed",
  };

  return (
    <button 
      className={`${variants[variant] || variants.primary} disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};
