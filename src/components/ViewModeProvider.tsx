"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

interface ViewModeContextType {
  viewMode: "mobile" | "desktop";
  setViewMode: (mode: "mobile" | "desktop") => void;
  isMobile: boolean;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

export const ViewModeProvider = ({ children }: { children: React.ReactNode }) => {
  const [viewMode, setViewModeState] = useState<"mobile" | "desktop">("desktop");
  const [isManual, setIsManual] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("viewMode") as "mobile" | "desktop" | null;
    if (saved) {
      setViewModeState(saved);
      setIsManual(true);
    } else {
      setViewModeState(window.innerWidth < 768 ? "mobile" : "desktop");
    }
  }, []);

  const setViewMode = useCallback((mode: "mobile" | "desktop") => {
    setViewModeState(mode);
    setIsManual(true);
    localStorage.setItem("viewMode", mode);
  }, []);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (!isManual) {
          setViewModeState(window.innerWidth < 768 ? "mobile" : "desktop");
        }
      }, 150);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timeoutId);
    };
  }, [isManual]);

  const isMobile = viewMode === "mobile";

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode, isMobile }}>
      {children}
    </ViewModeContext.Provider>
  );
};

export const useViewMode = () => {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error("useViewMode must be used within a ViewModeProvider");
  }
  return context;
};
