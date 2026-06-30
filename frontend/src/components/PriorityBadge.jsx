import React from 'react';

const PriorityBadge = ({ priority, className = "" }) => {
  const getPriorityConfig = (level) => {
    switch (level) {
      case 'Critical':
        return {
          cls: 'priority-critical'
        };
      case 'High':
        return {
          cls: 'priority-severe'
        };
      case 'Medium':
        return {
          cls: 'priority-medium'
        };
      case 'Low':
        return {
          cls: 'priority-low'
        };
      default:
        return {
          cls: 'priority-low'
        };
    }
  };

  const config = getPriorityConfig(priority);

  return (
    <span 
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${config.cls} ${className}`}
    >
      {priority}
    </span>
  );
};

export default PriorityBadge;
