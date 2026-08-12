"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  FiGrid, 
  FiDollarSign, 
  FiMessageSquare, 
  FiCheckSquare, 
  FiMenu,
  FiX,
  FiUser,
  FiSettings,
  FiUsers,
  FiAward,
  FiTarget,
  FiFileText,
  FiBox,
  FiTruck,
  FiPercent,
  FiBarChart2,
  FiClock,
  FiCalendar,
  FiSend,
  FiSliders,
  FiLogOut
} from "react-icons/fi";

interface MobileShellProps {
  children: React.ReactNode;
  user?: { name?: string; role?: string; email?: string };
}

export const MobileShell = ({ children, user }: MobileShellProps) => {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isActive = (path: string, prefixes: string[] = []) => {
    if (!mounted) return false;
    if (pathname === path) return true;
    return prefixes.some(prefix => pathname?.startsWith(prefix));
  };

  const closeDrawer = () => setDrawerOpen(false);

  const getPageTitle = () => {
    if (!pathname || pathname === "/") return "Home";
    const path = pathname.split('/')[1] || "Home";
    return path.charAt(0).toUpperCase() + path.slice(1);
  };

  return (
    <div className="flex flex-col min-h-screen bg-neutral-950 text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur-xl border-b border-white/10 h-14 flex items-center justify-between px-4">
        <div className="flex-1">
          <span className="text-xs font-bold tracking-wider text-neutral-400">TITAN DIAMOND</span>
        </div>
        <div className="flex-1 text-center font-semibold truncate text-sm">
          {getPageTitle()}
        </div>
        <div className="flex-1 flex justify-end items-center space-x-3">
          <button className="text-amber-400 hover:text-amber-300">
             <FiAward size={18} />
          </button>
          <button className="text-neutral-400 hover:text-white relative">
            <FiMessageSquare size={18} />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border border-neutral-950"></span>
          </button>
          <div className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-medium border border-white/10 text-neutral-300">
            {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 pt-14 pb-20 overflow-y-auto">
        {children}
      </main>

      {/* Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-neutral-950/95 backdrop-blur-xl border-t border-white/10 h-16 flex items-center justify-around px-2 pb-safe">
        <Link 
          href="/dashboard" 
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive('/dashboard', ['/dashboard']) ? 'text-amber-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <FiGrid size={20} />
          <span className="text-[10px] font-medium">Dashboard</span>
        </Link>
        <Link 
          href="/sales" 
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive('/sales', ['/sales', '/account']) ? 'text-amber-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <FiDollarSign size={20} />
          <span className="text-[10px] font-medium">Sales</span>
        </Link>
        <Link 
          href="/messages" 
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive('/messages', ['/messages']) ? 'text-amber-400' : 'text-neutral-500 hover:text-neutral-300'} relative`}
        >
          <div className="relative">
            <FiMessageSquare size={20} />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 border-2 border-neutral-950 rounded-full"></span>
          </div>
          <span className="text-[10px] font-medium">Messages</span>
        </Link>
        <Link 
          href="/tasks" 
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${isActive('/tasks', ['/tasks']) ? 'text-amber-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <FiCheckSquare size={20} />
          <span className="text-[10px] font-medium">Tasks</span>
        </Link>
        <button 
          onClick={() => setDrawerOpen(true)}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 transition-colors ${drawerOpen ? 'text-amber-400' : 'text-neutral-500 hover:text-neutral-300'}`}
        >
          <FiMenu size={20} />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      {/* More Drawer Backdrop */}
      {drawerOpen && (
        <div 
          className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm transition-opacity"
          onClick={closeDrawer}
        />
      )}

      {/* More Drawer */}
      <div 
        className={`fixed bottom-0 left-0 right-0 z-[60] bg-neutral-900 border-t border-white/10 rounded-t-3xl transition-transform duration-300 ease-in-out transform ${
          drawerOpen ? 'translate-y-0' : 'translate-y-full'
        } max-h-[85vh] overflow-hidden flex flex-col`}
      >
        <div className="flex-shrink-0 pt-3 pb-4 flex justify-center items-center cursor-pointer" onClick={closeDrawer}>
          <div className="w-12 h-1.5 bg-neutral-700 rounded-full" />
        </div>
        
        <div className="flex-1 overflow-y-auto px-4 pb-10 space-y-6">
          {/* Sales */}
          <div>
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 px-2">Sales</h3>
            <div className="bg-neutral-800/50 rounded-2xl overflow-hidden">
              <DrawerLink href="/accounts" icon={<FiUsers />} label="Accounts" onClick={closeDrawer} />
              <DrawerLink href="/catalog" icon={<FiBox />} label="Catalog" onClick={closeDrawer} />
              <DrawerLink href="/shipping" icon={<FiTruck />} label="Shipping" onClick={closeDrawer} />
              <DrawerLink href="/commissions" icon={<FiPercent />} label="Commissions" onClick={closeDrawer} />
              <DrawerLink href="/stats" icon={<FiBarChart2 />} label="Stats" onClick={closeDrawer} />
            </div>
          </div>

          {/* Communication */}
          <div>
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 px-2">Communication</h3>
            <div className="bg-neutral-800/50 rounded-2xl overflow-hidden">
              <DrawerLink href="/messages" icon={<FiMessageSquare />} label="Messages" onClick={closeDrawer} />
              <DrawerLink href="/campaigns" icon={<FiSend />} label="Campaigns" onClick={closeDrawer} />
            </div>
          </div>

          {/* Time & Pay */}
          <div>
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 px-2">Time & Pay</h3>
            <div className="bg-neutral-800/50 rounded-2xl overflow-hidden">
              <DrawerLink href="/timeclock" icon={<FiClock />} label="Timeclock" onClick={closeDrawer} />
              <DrawerLink href="/payroll" icon={<FiCalendar />} label="Payroll" onClick={closeDrawer} />
            </div>
          </div>

          {/* Admin */}
          {user?.role?.includes('admin') && (
            <div>
              <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 px-2">Admin</h3>
              <div className="bg-neutral-800/50 rounded-2xl overflow-hidden">
                <DrawerLink href="/admin/dashboard" icon={<FiGrid />} label="Dashboard" onClick={closeDrawer} />
                <DrawerLink href="/admin/users" icon={<FiUsers />} label="Users" onClick={closeDrawer} />
                <DrawerLink href="/admin/settings" icon={<FiSettings />} label="Settings" onClick={closeDrawer} />
                <DrawerLink href="/admin/vig" icon={<FiAward />} label="VIG" onClick={closeDrawer} />
                <DrawerLink href="/admin/invoices" icon={<FiFileText />} label="Invoices" onClick={closeDrawer} />
                <DrawerLink href="/admin/payouts" icon={<FiDollarSign />} label="Payouts" onClick={closeDrawer} />
                <DrawerLink href="/admin/goals" icon={<FiTarget />} label="Goals" onClick={closeDrawer} />
              </div>
            </div>
          )}

          {/* Profile */}
          <div>
            <h3 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-2 px-2">Profile</h3>
            <div className="bg-neutral-800/50 rounded-2xl overflow-hidden">
              <DrawerLink href="/profile" icon={<FiUser />} label="My Profile" onClick={closeDrawer} />
              <DrawerLink href="/preferences" icon={<FiSliders />} label="Preferences" onClick={closeDrawer} />
              <button 
                onClick={closeDrawer}
                className="w-full flex items-center px-4 py-3 text-red-400 hover:bg-neutral-700/50 transition-colors"
              >
                <span className="mr-3 text-lg"><FiLogOut /></span>
                <span className="text-sm font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const DrawerLink = ({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) => (
  <Link 
    href={href} 
    onClick={onClick}
    className="flex items-center px-4 py-3 text-neutral-200 hover:bg-neutral-700/50 hover:text-white transition-colors border-b border-white/5 last:border-0"
  >
    <span className="mr-3 text-neutral-400 text-lg">{icon}</span>
    <span className="text-sm font-medium">{label}</span>
  </Link>
);
