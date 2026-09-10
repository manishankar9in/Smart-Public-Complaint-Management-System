import React from 'react';

const PriorityBadge = ({ priority, className = "" }) => {
  const getPriorityConfig = (level) => {
    const lvl = String(level || "Low").trim().toLowerCase();
    switch (lvl) {
      case 'critical':
        return {
          cls: 'bg-rose-100 border-rose-300 text-rose-800 font-black shadow-sm',
          dot: 'bg-rose-500 animate-pulse',
        };
      case 'high':
        return {
          cls: 'bg-orange-100 border-orange-300 text-orange-800 font-bold shadow-sm',
          dot: 'bg-orange-500',
        };
      case 'medium':
        return {
          cls: 'bg-amber-100 border-amber-300 text-amber-800 font-semibold shadow-sm',
          dot: 'bg-amber-500',
        };
      case 'low':
        return {
          cls: 'bg-emerald-100 border-emerald-300 text-emerald-800 font-semibold shadow-sm',
          dot: 'bg-emerald-500',
        };
      default:
        return {
          cls: 'bg-slate-100 border-slate-300 text-slate-800 font-semibold shadow-sm',
          dot: 'bg-slate-400',
        };
    }
  };

  const config = getPriorityConfig(priority);

  return (
    <span 
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${config.cls} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {priority || "Low"}
    </span>
  );
};

export default PriorityBadge;
