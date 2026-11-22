'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShoppingBag,
  Users,
  DollarSign,
  ArrowUpRight,
  Activity,
  LayoutDashboard,
  BarChart3,
  Settings,
  Bell,
  Search,
  LucideIcon,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

// --- Mock Analytics Data ---
const chartData = [
  { name: 'Mon', revenue: 4200, orders: 240 },
  { name: 'Tue', revenue: 3800, orders: 210 },
  { name: 'Wed', revenue: 5400, orders: 320 },
  { name: 'Thu', revenue: 4900, orders: 280 },
  { name: 'Fri', revenue: 6800, orders: 410 },
  { name: 'Sat', revenue: 7900, orders: 490 },
  { name: 'Sun', revenue: 8500, orders: 530 },
];

// --- Exact StatsCard Component from Your Snippet ---
interface StatsCardProps {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
  gradient: string;
}

const StatsCard = ({ title, value, change, icon: Icon, gradient }: StatsCardProps) => {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="glass-card p-6 rounded-2xl relative overflow-hidden group cursor-pointer"
    >
      {/* Subtle Hover Glow */}
      <div
        className={`absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gradient-to-br ${gradient} opacity-20 blur-xl group-hover:opacity-40 transition-opacity`}
      />

      <div className="flex items-center justify-between relative z-10">
        <div>
          <p className="text-sm text-white/60">{title}</p>
          <h2 className="text-2xl font-bold text-white mt-1">{value}</h2>
          <p className="flex items-center gap-1 text-sm text-emerald-400 mt-2 font-medium">
            <ArrowUpRight size={16} /> {change}%
          </p>
        </div>

        {/* Gradient Icon Container */}
        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} p-3 flex items-center justify-center shadow-lg`}
        >
          <Icon className="text-white" size={22} />
        </div>
      </div>
    </motion.div>
  );
};

// --- Main Glassy Dashboard Page ---
export default function GlassyDashboardPage() {
  const [activeTab, setActiveTab] = useState('Overview');

  return (
    <div className="min-h-screen bg-[#070913] text-white p-4 md:p-6 flex gap-6 relative overflow-hidden font-sans">
      {/* Inline CSS for the .glass-card utility class */}
      <style jsx global>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.04);
          backdrop-filter: blur(18px);
          -webkit-backdrop-filter: blur(18px);
          border: 1px solid rgba(255, 255, 255, 0.09);
          box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.35);
        }
      `}</style>

      {/* Ambient Liquid Background Orbs */}
      <div className="fixed top-[-15%] left-[-10%] w-[45%] h-[45%] bg-purple-600/25 rounded-full blur-[130px] pointer-events-none" />
      <div className="fixed bottom-[-15%] right-[-10%] w-[45%] h-[45%] bg-cyan-500/20 rounded-full blur-[130px] pointer-events-none" />
      <div className="fixed top-[35%] left-[45%] w-[30%] h-[30%] bg-fuchsia-600/15 rounded-full blur-[120px] pointer-events-none" />

      {/* Sidebar */}
      <aside className="hidden lg:flex w-64 glass-card rounded-3xl p-6 flex-col justify-between z-10">
        <div className="space-y-8">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-cyan-400 flex items-center justify-center font-bold text-sm shadow-lg shadow-purple-500/30">
              XR
            </div>
            <span className="text-lg font-bold tracking-wider bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              GLASSY UI
            </span>
          </div>

          <nav className="space-y-2">
            {[
              { name: 'Overview', icon: LayoutDashboard },
              { name: 'Analytics', icon: BarChart3 },
              { name: 'Activity', icon: Activity },
              { name: 'Settings', icon: Settings },
            ].map((item) => {
              const NavIcon = item.icon;
              const isActive = activeTab === item.name;
              return (
                <button
                  key={item.name}
                  onClick={() => setActiveTab(item.name)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-white/10 text-white border border-white/10 shadow-inner'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <NavIcon size={18} />
                  {item.name}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-500/10 to-cyan-500/10 border border-white/10">
          <p className="text-xs font-semibold text-white/90">Glassy Dashboard v3.0</p>
          <p className="text-[11px] text-white/50 mt-1">Framer Motion + Tailwind</p>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col gap-6 z-10 max-w-7xl mx-auto w-full">
        {/* Top Navbar */}
        <header className="glass-card rounded-2xl px-6 py-4 flex flex-wrap gap-4 justify-between items-center">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{activeTab}</h1>
            <p className="text-xs text-white/50">Real-time performance & analytics</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/60">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search metrics..."
                className="bg-transparent outline-none text-white placeholder-white/40 w-40"
              />
            </div>

            <button className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition relative">
              <Bell size={18} className="text-white/80" />
              <span className="w-2 h-2 rounded-full bg-cyan-400 absolute top-2 right-2" />
            </button>

            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-500 to-cyan-400 p-[2px]">
              <div className="w-full h-full bg-[#070913] rounded-[10px] flex items-center justify-center text-xs font-bold">
                XR
              </div>
            </div>
          </div>
        </header>

        {/* Stats Cards Row (Using Your Exact StatsCard Component) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <StatsCard
            title="Total Revenue"
            value="$54,230"
            change="14.5"
            icon={DollarSign}
            gradient="from-emerald-500 to-teal-400"
          />
          <StatsCard
            title="Total Orders"
            value="1,420"
            change="8.2"
            icon={ShoppingBag}
            gradient="from-purple-500 to-indigo-500"
          />
          <StatsCard
            title="Active Users"
            value="9,845"
            change="21.4"
            icon={Users}
            gradient="from-cyan-500 to-blue-500"
          />
          <StatsCard
            title="Conversion Rate"
            value="4.92%"
            change="3.1"
            icon={Activity}
            gradient="from-pink-500 to-rose-500"
          />
        </div>

        {/* Analytics Chart Panel */}
        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass-card rounded-3xl p-6 flex-1 flex flex-col min-h-[340px]"
        >
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-base font-semibold text-white">Revenue Growth</h3>
              <p className="text-xs text-white/50">Weekly glassmorphic telemetry overview</p>
            </div>
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              +18.4% vs last week
            </span>
          </div>

          <div className="w-full h-72 flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="glassGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5d5961" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="name"
                  stroke="rgba(255,255,255,0.3)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="rgba(255,255,255,0.3)"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `$${val}`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(10, 14, 28, 0.85)',
                    backdropFilter: 'blur(12px)',
                    borderColor: 'rgba(255, 255, 255, 0.12)',
                    borderRadius: '14px',
                    color: '#fff',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#9eb37c"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#glassGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.section>
      </main>
    </div>
  );
}