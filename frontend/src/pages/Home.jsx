import React from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  HardHat,
  ShieldCheck,
  ArrowRight,
  Zap,
  MapPin,
  Clock,
  Bell,
  ChevronDown,
  CheckCircle2,
  FileText,
  BarChart3,
  LogIn,
  Phone,
  Mail,
  Navigation,
  Camera,
  Star,
  Trash2,
  Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
};

const roleFeatures = [
  {
    id: "public",
    title: "Public User",
    icon: Users,
    iconBg: "bg-gradient-to-tr from-cyan-500 to-blue-600 shadow-cyan-500/30",
    border: "border-cyan-500/40 hover:border-cyan-400",
    gradient: "bg-gradient-to-br from-slate-900/90 via-sky-950/70 to-slate-900/90",
    summary: "Citizens report local issues and track verified resolution in real time.",
    features: [
      "Raise complaints with GPS photo proof",
      "Track live status: Pending → Assigned → Worker Done → Admin Verified",
      "Inspect worker resolution photos sent directly to you",
      "Feedback rating unlocked only after Admin Verification",
      "Resolved complaint notifications automatically cleared across all dashboards",
    ],
    loginHint: "Open Login and choose the User tab.",
  },
  {
    id: "worker",
    title: "Field Worker",
    icon: HardHat,
    iconBg: "bg-gradient-to-tr from-amber-500 to-orange-600 shadow-amber-500/30",
    border: "border-amber-500/40 hover:border-amber-400",
    gradient: "bg-gradient-to-br from-slate-900/90 via-amber-950/60 to-slate-900/90",
    summary: "Municipal staff resolve complaints assigned to their area with GPS routing.",
    features: [
      "View tasks sorted by AI priority & proximity",
      "Dedicated Google Maps turn-by-turn routing to complaint location",
      "Submit on-site photo proof and resolution notes upon completion",
      "Duty station location locking with GPS coordinates",
      "Direct resolution verification pipeline with Municipal Admins",
    ],
    loginHint: "Open Login and choose the Worker tab.",
  },
];

const steps = [
  {
    num: "01",
    title: "Report",
    desc: "Citizen submits complaint with GPS-tagged photo and category.",
    icon: FileText,
    color: "from-cyan-400 to-blue-500",
    border: "border-cyan-500/30 hover:border-cyan-400/60",
    bg: "bg-cyan-950/20",
  },
  {
    num: "02",
    title: "Prioritize",
    desc: "AI engine scores urgency so critical issues are handled first.",
    icon: Zap,
    color: "from-amber-400 to-orange-500",
    border: "border-amber-500/30 hover:border-amber-400/60",
    bg: "bg-amber-950/20",
  },
  {
    num: "03",
    title: "Navigate",
    desc: "Worker navigates to site using dedicated Google Maps routing.",
    icon: Navigation,
    color: "from-emerald-400 to-teal-500",
    border: "border-emerald-500/30 hover:border-emerald-400/60",
    bg: "bg-emerald-950/20",
  },
  {
    num: "04",
    title: "Resolve",
    desc: "Worker fixes issue and uploads on-site photo proof.",
    icon: Camera,
    color: "from-purple-400 to-pink-500",
    border: "border-purple-500/30 hover:border-purple-400/60",
    bg: "bg-purple-950/20",
  },
  {
    num: "05",
    title: "Verify",
    desc: "Admin verifies, citizen gets proof & gives feedback, alerts auto-cleared.",
    icon: ShieldCheck,
    color: "from-rose-400 to-red-500",
    border: "border-rose-500/30 hover:border-rose-400/60",
    bg: "bg-rose-950/20",
  },
];

const features = [
  {
    icon: MapPin,
    title: "GPS-Verified Proof",
    desc: "Every complaint and resolution photo is location-locked for authenticity.",
    color: "from-blue-500 to-cyan-500",
    border: "border-cyan-500/30",
  },
  {
    icon: Zap,
    title: "AI Priority Engine",
    desc: "Smart scoring ensures critical potholes, sewage, and hazards get fast-tracked.",
    color: "from-amber-500 to-orange-500",
    border: "border-amber-500/30",
  },
  {
    icon: Navigation,
    title: "Worker Maps Navigation",
    desc: "Dedicated Google Maps turn-by-turn driving directions built for field workers.",
    color: "from-emerald-500 to-teal-600",
    border: "border-emerald-500/30",
  },
  {
    icon: Camera,
    title: "Verified Proof Forwarding",
    desc: "Worker photo evidence is audited by admins and sent straight to citizens.",
    color: "from-purple-500 to-indigo-600",
    border: "border-purple-500/30",
  },
  {
    icon: Star,
    title: "Gated Citizen Feedback",
    desc: "Feedback rating unlocks only after official admin verification of completed work.",
    color: "from-pink-500 to-rose-600",
    border: "border-pink-500/30",
  },
  {
    icon: Trash2,
    title: "Auto-Purged Notifications",
    desc: "All resolved complaint alerts automatically disappear to eliminate clutter.",
    color: "from-violet-500 to-purple-600",
    border: "border-violet-500/30",
  },
];

const SmartGovernanceHome = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const dashboardPath =
    user?.role === "admin"
      ? "/admin-dashboard"
      : user?.role === "worker"
        ? "/worker-dashboard"
        : "/user-dashboard";

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="page-shell theme-home !px-0 !py-0 min-h-screen bg-[#08101e] text-slate-100 relative overflow-hidden selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* ── Background Colorful Glow Orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden z-0">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-cyan-500/15 blur-[120px] animate-pulse" />
        <div className="absolute top-1/3 -right-20 h-96 w-96 rounded-full bg-purple-500/12 blur-[140px]" />
        <div className="absolute top-2/3 -left-20 h-96 w-96 rounded-full bg-amber-500/10 blur-[130px]" />
        <div className="absolute -bottom-20 right-1/3 h-96 w-96 rounded-full bg-emerald-500/12 blur-[120px]" />
      </div>

      {/* ── Navigation ── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#08101e]/85 backdrop-blur-md shadow-lg">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <Link
            to="/"
            className="flex items-center gap-3 cursor-pointer group"
            aria-label="Smart Public Complaint System — Home"
          >
            <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl bg-white/10 backdrop-blur-md border border-white/20 p-1 shadow-lg shadow-cyan-500/10 transition-transform group-hover:scale-105">
              <img src="/logo-icon.png" alt="Logo" className="h-full w-full object-contain" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-black tracking-tight text-white sm:text-base">
                Smart Public Complaint
              </p>
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 sm:text-xs">
                Stronger Communities | Better Governance
              </p>
            </div>
          </Link>

          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="Main navigation"
          >
            {[
              { label: "About", id: "about" },
              { label: "How It Works", id: "how-it-works" },
              { label: "Roles", id: "roles" },
              { label: "Features", id: "features" },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 sm:gap-3">
            {user?.role ? (
              <>
                <button
                  type="button"
                  onClick={() => navigate(dashboardPath)}
                  className="btn-primary !text-xs sm:!text-sm cursor-pointer shadow-lg shadow-blue-500/25"
                >
                  Dashboard <ArrowRight size={16} aria-hidden />
                </button>
              </>
            ) : (
              <>
                <Link
                  to="/register?role=public"
                  className="hidden cursor-pointer rounded-xl border border-white/20 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-200 transition-all hover:border-cyan-400/50 hover:bg-white/10 sm:inline-flex sm:px-4 sm:text-sm"
                >
                  Register
                </Link>
                <Link
                  to="/login?role=public"
                  className="btn-primary !text-xs sm:!text-sm cursor-pointer shadow-lg shadow-blue-500/25"
                >
                  <LogIn size={15} aria-hidden /> Login
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-white/10 py-16 sm:py-20 lg:py-28">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/20 via-transparent to-amber-950/20 pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 text-center sm:px-6">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            {/* Logo Badge in Hero */}
            <div className="mb-6 flex items-center justify-center">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-2 backdrop-blur-xl shadow-2xl shadow-cyan-500/10">
                <img src="/logo-icon.png" alt="Smart Public Complaint Emblem" className="h-8 w-8 sm:h-9 sm:w-9 object-contain" />
                <span className="text-xs sm:text-sm font-black tracking-wide text-white">Smart Public Complaint</span>
                <span className="hidden sm:inline-block h-3.5 w-px bg-white/20"></span>
                <span className="hidden sm:inline-block text-[11px] font-bold text-emerald-400 uppercase tracking-widest">Better Governance</span>
              </div>
            </div>

            <h1 className="mx-auto mb-6 max-w-4xl text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Smart Public Complaint{" "}
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 bg-clip-text text-transparent">
                Priority &amp; Response
              </span>{" "}
              System
            </h1>

            <p className="mx-auto mb-4 max-w-3xl text-base leading-relaxed text-slate-300 sm:text-lg lg:text-xl">
              A citizen-first platform where you report local issues with GPS proof,
              track resolution live, and hold your municipality accountable — powered
              by AI priority scoring and on-site worker proof verification.
            </p>

            <p className="mx-auto mb-10 max-w-2xl text-sm text-slate-400 sm:text-base">
              Works on mobile, tablet, and desktop. Open in any browser on Android or
              iOS — no app download needed.
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              {user?.role ? (
                <button
                  type="button"
                  onClick={() => navigate(dashboardPath)}
                  className="btn-primary w-full cursor-pointer px-8 py-3 text-sm sm:w-auto sm:text-base shadow-xl shadow-blue-500/25"
                >
                  Go to Dashboard <ArrowRight size={18} aria-hidden />
                </button>
              ) : (
                <>
                  <Link
                    to="/login?role=public"
                    className="btn-primary w-full cursor-pointer px-8 py-3 text-sm sm:w-auto sm:text-base shadow-xl shadow-blue-500/25"
                  >
                    Login <LogIn size={18} aria-hidden />
                  </Link>
                  <Link
                    to="/register?role=public"
                    className="btn-secondary w-full cursor-pointer px-8 py-3 text-sm sm:w-auto sm:text-base"
                  >
                    Register as Citizen
                  </Link>
                </>
              )}
              <button
                type="button"
                onClick={() => scrollTo("how-it-works")}
                className="btn-secondary w-full cursor-pointer px-8 py-3 text-sm sm:w-auto sm:text-base"
              >
                How It Works <ChevronDown size={18} aria-hidden />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── About ── */}
      <section id="about" className="border-b border-white/10 py-14 sm:py-20 relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="section-title mb-4 text-2xl sm:text-3xl lg:text-4xl">
              What Is This Website?
            </h2>
            <p className="section-subtitle text-base leading-relaxed sm:text-lg">
              This is a <strong className="text-white">Smart Public Management System</strong>{" "}
              built for municipalities and citizens. It connects three roles —{" "}
              <span className="text-cyan-400 font-bold">Public Users</span>,{" "}
              <span className="text-amber-400 font-bold">Field Workers</span>, and{" "}
              <span className="text-purple-400 font-bold">Admins</span> — on one real-time
              platform with AI urgency scoring, worker Google Maps navigation, verified photographic proofs, and auto-cleaned notifications.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section
        id="how-it-works"
        className="border-b border-white/10 bg-white/[0.02] py-14 sm:py-20 relative"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center sm:mb-14">
            <h2 className="section-title mb-3 text-2xl sm:text-3xl lg:text-4xl">
              How It Works
            </h2>
            <p className="section-subtitle mx-auto max-w-2xl text-base">
              Five simple steps from complaint to verified resolution
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-5">
            {steps.map((step, idx) => (
              <motion.div
                key={step.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08 }}
                className={`relative rounded-2xl border ${step.border} ${step.bg} p-5 backdrop-blur transition-all hover:-translate-y-1 hover:shadow-xl`}
              >
                {idx < steps.length - 1 && (
                  <ArrowRight
                    size={18}
                    className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-slate-500 lg:block"
                    aria-hidden
                  />
                )}
                <div className="mb-3 flex items-center justify-between">
                  <span className={`text-2xl font-black bg-gradient-to-r ${step.color} bg-clip-text text-transparent`}>
                    {step.num}
                  </span>
                  <step.icon size={22} className="text-slate-300" aria-hidden />
                </div>
                <h3 className="mb-2 text-base font-bold text-white sm:text-lg">
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-400">
                  {step.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Role Features ── */}
      <section id="roles" className="py-14 sm:py-20 relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center sm:mb-12">
            <h2 className="section-title mb-3 text-2xl sm:text-3xl lg:text-4xl">
              Who Uses This Platform?
            </h2>
            <p className="section-subtitle mx-auto max-w-2xl text-base">
              Two primary roles — each with dedicated features. Use the{" "}
              <Link to="/login?role=public" className="font-bold text-cyan-400 hover:underline">
                Login page
              </Link>{" "}
              and pick User or Worker.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-6">
            {roleFeatures.map((role, idx) => (
              <motion.article
                key={role.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08 }}
                className={`cursor-default rounded-2xl border ${role.border} ${role.gradient} p-5 shadow-xl backdrop-blur transition-shadow hover:shadow-2xl sm:p-6`}
              >
                <div className="mb-4 flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${role.iconBg} shadow-lg`}>
                    <role.icon size={22} className="text-white" aria-hidden />
                  </div>
                  <h3 className="text-lg font-black text-white sm:text-xl">{role.title}</h3>
                </div>
                <p className="mb-4 text-sm leading-relaxed text-slate-300">{role.summary}</p>
                <ul className="mb-4 space-y-2" role="list">
                  {role.features.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-400">
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                  💡 {role.loginHint}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform Features ── */}
      <section
        id="features"
        className="border-t border-white/10 bg-white/[0.02] py-14 sm:py-20 relative"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center sm:mb-14">
            <h2 className="section-title mb-3 text-2xl sm:text-3xl lg:text-4xl">
              Platform Features
            </h2>
            <p className="section-subtitle mx-auto max-w-2xl text-base">
              Built for speed, transparency, and accountability
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
            {features.map((feat, idx) => (
              <motion.div
                key={feat.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.06 }}
                className={`rounded-2xl border ${feat.border} bg-slate-900/80 p-5 backdrop-blur transition-all hover:-translate-y-1 hover:border-white/30 sm:p-6 shadow-lg`}
              >
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${feat.color} shadow-lg`}
                >
                  <feat.icon size={24} className="text-white" aria-hidden />
                </div>
                <h3 className="mb-2 text-base font-bold text-white sm:text-lg">
                  {feat.title}
                </h3>
                <p className="text-sm leading-relaxed text-slate-400">
                  {feat.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA Banner ── */}
      <section className="border-t border-white/10 py-12 sm:py-16 relative">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="mb-4 text-2xl font-black text-white sm:text-3xl">
            Ready to Report an Issue?
          </h2>
          <p className="mb-8 text-base text-slate-400">
            Join citizens using smart governance to make their city better.
            Register in under a minute and submit your first complaint today.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            {user?.role ? (
              <button
                type="button"
                onClick={() => navigate(dashboardPath)}
                className="btn-primary w-full cursor-pointer px-8 py-3 text-sm sm:w-auto sm:text-base shadow-xl shadow-blue-500/25"
              >
                Go to Dashboard <ArrowRight size={18} aria-hidden />
              </button>
            ) : (
              <>
                <Link
                  to="/login?role=public"
                  className="btn-primary w-full cursor-pointer px-8 py-3 text-sm sm:w-auto sm:text-base shadow-xl shadow-blue-500/25"
                >
                  Go to Login <LogIn size={18} aria-hidden />
                </Link>
                <Link
                  to="/register?role=public"
                  className="btn-secondary w-full cursor-pointer px-8 py-3 text-sm sm:w-auto sm:text-base"
                >
                  Register as Citizen
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 bg-[#060c18] py-12 relative z-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 p-1 border border-white/15 shadow-md">
                  <img src="/logo-icon.png" alt="Logo" className="h-full w-full object-contain" />
                </div>
                <div>
                  <p className="text-base font-black text-white">
                    Smart Public Complaint
                  </p>
                  <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                    Stronger Communities | Better Governance
                  </p>
                </div>
              </div>
              <p className="mb-4 text-sm text-slate-400">
                Real-time governance platform for citizens to report local issues and track resolution progress.
              </p>
              <p className="text-xs text-slate-500">
                © {new Date().getFullYear()} — Municipal Corporation
              </p>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-cyan-400">Quick Links</h4>
              <ul className="space-y-2">
                <li>
                  <Link to="/" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Home
                  </Link>
                </li>
                <li>
                  <Link to="/login?role=public" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Citizen Login
                  </Link>
                </li>
                <li>
                  <Link to="/login?role=worker" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Worker Login
                  </Link>
                </li>
                <li>
                  <Link to="/register?role=public" className="text-sm text-slate-400 hover:text-white transition-colors">
                    Register
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-4 text-sm font-bold uppercase tracking-wider text-amber-400">Contact</h4>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-sm text-slate-400">
                  <Phone size={16} className="text-amber-400" />
                  <span>6303594756</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-400">
                  <Mail size={16} className="text-cyan-400" />
                  <span>government@public.in</span>
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-400">
                  <MapPin size={16} className="text-emerald-400" />
                  <span>Municipal Corporation Headquarters</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default SmartGovernanceHome;
