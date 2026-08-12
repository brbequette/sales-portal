"use client";

import React from "react";
import { FiSmartphone, FiMonitor } from "react-icons/fi";
import { useViewMode } from "./ViewModeProvider";

export const ViewModeToggle = () => {
  const { viewMode, setViewMode } = useViewMode();
  
  const isMobile = viewMode === "mobile";
  
  const toggleMode = () => {
    setViewMode(isMobile ? "desktop" : "mobile");
  };
  
  return (
    <div className="relative group inline-block">
      <button
        onClick={toggleMode}
        className="flex items-center justify-center bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-full px-3 py-1.5 transition-colors border border-white/10"
        aria-label={`Switch to ${isMobile ? "Desktop" : "Mobile"} View`}
      >
        {isMobile ? <FiMonitor size={16} /> : <FiSmartphone size={16} />}
      </button>
      
      {/* Tooltip */}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-neutral-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-white/10 z-50">
        Switch to {isMobile ? "Desktop" : "Mobile"} View
      </div>
    </div>
  );
};
