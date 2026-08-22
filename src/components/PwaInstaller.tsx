"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

export function PwaInstaller() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error) => {
        console.error("Titan app service worker registration failed", error);
      });
    }

    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    const handleInstalled = () => setPromptEvent(null);

    window.addEventListener("beforeinstallprompt", handlePrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handlePrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (!mounted || !promptEvent || isStandalone()) return null;

  const install = async () => {
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setPromptEvent(null);
  };

  return createPortal(
    <button
      type="button"
      onClick={install}
      aria-label="Install Titan Sales Portal"
      style={{
        position: "fixed",
        right: 22,
        bottom: 22,
        zIndex: 100000,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 17px 11px 11px",
        border: "1px solid rgba(255,138,0,.7)",
        borderRadius: 999,
        color: "white",
        background: "linear-gradient(135deg,#111 0%,#070707 58%,#2b1000 100%)",
        boxShadow: "0 12px 38px rgba(0,0,0,.55),0 0 22px rgba(255,105,0,.18)",
        fontSize: 13,
        fontWeight: 850,
        letterSpacing: ".025em",
        cursor: "pointer",
      }}
    >
      <img src="/titan-app-icon-192.png" width="34" height="34" alt="" style={{ borderRadius: 9 }} />
      Install Titan App
    </button>,
    document.body,
  );
}
