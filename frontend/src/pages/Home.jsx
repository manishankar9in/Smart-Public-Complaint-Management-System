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
    iconBg: "bg-blue-600",
    border: "border-blue-500/30",
    gradient: "bg-gradient-to-br from-sky-950/90 via-slate-900/80 to-cyan-950/80",
    summary: "Citizens report local issues and track resolution in real time.",
    features: [
      "Raise complaints with GPS photo proof",
      "Track status: Pending → Assigned → Resolved",
      "Get email & in-app notifications",
      "Sign in with Google Gmail or email/password",
      "Register with email, phone, password & address",
    ],
    loginHint: "Open Login and choose the User tab.",
  },
  {
    id: "worker",
    title: "Field Worker",
    icon: HardHat,
    iconBg: "bg-amber-600",
    border: "border-amber-500/30",
    gradient: "bg-gradient-to-br from-amber-950/90 via-orange-950/80 to-slate-900/85",
    summary: "Municipal staff resolve complaints assigned to their area.",
    features: [
      "View tasks sorted by AI priority",
      "Update status and upload proof photos",
      "GPS-verified completion records",
      "Register first, then sign in with same credentials",
      "No Google sign-in — email & password only",
    ],
    loginHint: "Open Login and choose the Worker tab.",
  },
  {
    id: "admin",
    title: "Municipal Admin",
    icon: ShieldCheck,
    iconBg: "bg-indigo-600",
    border: "border-indigo-500/30",
    gradient: "bg-gradient-to-br from-indigo-950/90 via-violet-950/80 to-slate-900/85",
    summary: "Officers oversee complaints, workers, and city analytics.",
    features: [
      "Monitor all complaints in real time",
      "Assign workers by category & location",
      "Verify resolution proof before closing",
      "View analytics and response trends",
      "Sign in with Firebase admin email & password",
    ],
    loginHint: "Open Login and choose the Admin tab.",
  },
];

const steps = [
  {
    num: "01",
    title: "Report",
    desc: "Citizen submits a complaint with GPS-tagged photo and category.",
    icon: FileText,
  },
  {
    num: "02",
    title: "Prioritize",
    desc: "AI engine scores urgency so critical issues are handled first.",
    icon: Zap,
  },
  {
    num: "03",
    title: "Assign",
    desc: "Admin routes the complaint to the nearest qualified field worker.",
    icon: HardHat,
  },
  {
    num: "04",
    title: "Resolve",
    desc: "Worker fixes the issue, uploads proof, and updates live status.",
    icon: CheckCircle2,
  },
  {
    num: "05",
    title: "Verify",
    desc: "Admin verifies, citizen gets notified, and can leave feedback.",
    icon: ShieldCheck,
  },
];

const features = [
  {
    icon: MapPin,
    title: "GPS-Verified Proof",
    desc: "Every complaint and resolution photo is location-locked for authenticity.",
    color: "from-blue-500 to-blue-700",
  },
  {
    icon: Zap,
    title: "AI Priority Engine",
    desc: "Smart scoring ensures potholes near schools and emergencies get fast-tracked.",
    color: "from-amber-500 to-orange-600",
  },
  {
    icon: Clock,
    title: "Real-Time Tracking",
    desc: "Status updates sync instantly across citizen, worker, and admin dashboards.",
    color: "from-emerald-500 to-teal-600",
  },
  {
    icon: Bell,
    title: "Instant Notifications",
    desc: "Email and in-app alerts keep everyone informed at every stage.",
    color: "from-purple-500 to-indigo-600",
  },
  {
    icon: BarChart3,
    title: "Live Analytics",
    desc: "Admins see complaint trends, response times, and area-wise performance.",
    color: "from-rose-500 to-pink-600",
  },
  {
    icon: ShieldCheck,
    title: "Secure & Role-Based",
    desc: "Separate portals for citizens, workers, and admins with protected access.",
    color: "from-slate-600 to-slate-800",
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
    <div className="page-shell theme-home !px-0 !py-0 min-h-screen bg-[#0b1220] text-slate-100">
      {/* ── Navigation ── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0b1220]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
          <Link
            to="/"
            className="flex items-center gap-2.5 cursor-pointer group"
            aria-label="Smart Public Complaint System — Home"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent shadow-md transition-transform group-hover:scale-105 sm:h-10 sm:w-10">
              <ShieldCheck size={20} className="text-white" aria-hidden />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-black tracking-tight text-white sm:text-base">
                Smart Complaint
              </p>
              <p className="hidden text-[10px] font-semibold uppercase tracking-widest text-slate-400 sm:block sm:text-xs">
                Priority & Response
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
              <button
                type="button"
                onClick={() => navigate(dashboardPath)}
                className="btn-primary !text-xs sm:!text-sm cursor-pointer"
              >
                Dashboard <ArrowRight size={16} aria-hidden />
              </button>
            ) : (
              <>
                <Link
                  to="/register"
                  className="hidden cursor-pointer rounded-xl border border-white/20 px-3 py-2 text-xs font-bold uppercase tracking-wider text-slate-200 transition-all hover:border-white/40 hover:bg-white/10 sm:inline-flex sm:px-4 sm:text-sm"
                >
                  Register
                </Link>
                <Link
                  to="/login?role=public"
                  className="btn-primary !text-xs sm:!text-sm cursor-pointer"
                >
                  <LogIn size={15} aria-hidden /> Login
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/40 via-transparent to-accent/20" />
        <div className="relative mx-auto max-w-7xl px-4 py-16 text-center sm:px-6 sm:py-20 lg:py-28">
          <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
            <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-300">
              <Zap size={14} aria-hidden />
              Real-Time Governance Platform
            </span>

            <h1 className="mx-auto mb-6 max-w-4xl text-3xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
              Smart Public Complaint{" "}
              <span className="text-amber-400">Priority & Response</span> System
            </h1>

            <p className="mx-auto mb-4 max-w-3xl text-base leading-relaxed text-slate-300 sm:text-lg lg:text-xl">
              A citizen-first platform where you report local issues with GPS proof,
              track resolution live, and hold your municipality accountable — powered
              by AI priority scoring and real-time coordination.
            </p>

            <p className="mx-auto mb-10 max-w-2xl text-sm text-slate-400 sm:text-base">
              Works on mobile, tablet, and desktop. Open in any browser on Android or
              iOS — no app download needed.
            </p>

            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link
                to="/login?role=public"
                className="btn-primary w-full cursor-pointer px-8 py-3 text-sm sm:w-auto sm:text-base"
              >
                Login <LogIn size={18} aria-hidden />
              </Link>
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
      <section id="about" className="border-b border-white/10 py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="section-title mb-4 text-2xl sm:text-3xl lg:text-4xl">
              What Is This Website?
            </h2>
            <p className="section-subtitle text-base leading-relaxed sm:text-lg">
              This is a <strong className="text-white">Smart Public Management System</strong>{" "}
              built for municipalities and citizens. It connects three roles —{" "}
              <span className="text-blue-400">Public Users</span>,{" "}
              <span className="text-amber-400">Field Workers</span>, and{" "}
              <span className="text-indigo-400">Admins</span> — on one real-time
              platform so complaints move from report to resolution without delays.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section
        id="how-it-works"
        className="border-b border-white/10 bg-white/[0.03] py-14 sm:py-20"
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
                className="relative rounded-2xl border border-white/10 bg-slate-800/60 p-5 backdrop-blur transition-all hover:-translate-y-1 hover:border-white/20 hover:shadow-premium"
              >
                {idx < steps.length - 1 && (
                  <ArrowRight
                    size={18}
                    className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 text-slate-500 lg:block"
                    aria-hidden
                  />
                )}
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-2xl font-black text-amber-400/80">
                    {step.num}
                  </span>
                  <step.icon size={22} className="text-slate-400" aria-hidden />
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

      {/* ── Role Features (no login buttons — use top Login) ── */}
      <section id="roles" className="py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-10 text-center sm:mb-12">
            <h2 className="section-title mb-3 text-2xl sm:text-3xl lg:text-4xl">
              Who Uses This Platform?
            </h2>
            <p className="section-subtitle mx-auto max-w-2xl text-base">
              Three roles — each with dedicated features. Use the{" "}
              <Link to="/login?role=public" className="font-bold text-amber-400 hover:underline">
                Login page
              </Link>{" "}
              and pick User, Worker, or Admin.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
            {roleFeatures.map((role, idx) => (
              <motion.article
                key={role.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                whileHover={{ y: -6, rotateX: 2, rotateY: idx === 1 ? 0 : idx === 0 ? -2 : 2 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08 }}
                style={{ transformStyle: "preserve-3d" }}
                  className={`cursor-default rounded-2xl border ${role.border} ${role.gradient} p-5 shadow-lg backdrop-blur transition-shadow hover:shadow-xl sm:p-6`}
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
                  {role.loginHint}
                </p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Platform Features ── */}
      <section
        id="features"
        className="border-t border-white/10 bg-white/[0.03] py-14 sm:py-20"
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
                className="rounded-2xl border border-white/10 bg-slate-800/50 p-5 backdrop-blur transition-all hover:-translate-y-1 hover:border-white/20 sm:p-6"
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
      <section className="border-t border-white/10 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="mb-4 text-2xl font-black text-white sm:text-3xl">
            Ready to Report an Issue?
          </h2>
          <p className="mb-8 text-base text-slate-400">
            Join citizens using smart governance to make their city better.
            Register in under a minute and submit your first complaint today.
          </p>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              to="/login?role=public"
              className="btn-primary w-full cursor-pointer px-8 py-3 text-sm sm:w-auto sm:text-base"
            >
              Go to Login <LogIn size={18} aria-hidden />
            </Link>
            <Link
              to="/register?role=public"
              className="btn-secondary w-full cursor-pointer px-8 py-3 text-sm sm:w-auto sm:text-base"
            >
              Register as Citizen
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 bg-[#080e1a] py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 text-center sm:flex-row sm:px-6 sm:text-left">
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-accent" aria-hidden />
            <p className="text-sm font-semibold text-slate-400">
              Smart Public Complaint Priority & Response System
            </p>
          </div>
          <p className="text-xs text-slate-600">
            © {new Date().getFullYear()} — Real-time governance for every citizen
          </p>
        </div>
      </footer>
    </div>
  );
};

export default SmartGovernanceHome;
