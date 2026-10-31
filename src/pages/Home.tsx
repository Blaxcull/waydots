import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Target,
  Search,
  Bell,
  Repeat,
  TrendingUp,
  Check,
  X,
  Layers,
  ChevronDown,
  Mail,
  Calendar,
  ListTodo,
  LogOut,
  Sparkles,
  Crown,
} from "lucide-react";
import type { SubscriptionPlan, SubscriptionStatus } from "@/hooks/useSubscription";

const fadeInUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
};

const staggerContainer = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1
    }
  }
};

export function Home({
  isAuthenticated = false,
  subscriptionPlan = "free",
  subscriptionStatus = "inactive",
  isPro = false,
}: {
  isAuthenticated?: boolean
  subscriptionPlan?: SubscriptionPlan
  subscriptionStatus?: SubscriptionStatus
  isPro?: boolean
}) {
  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-primary selection:text-primary-foreground font-sf-pro overflow-x-hidden">
      <Nav isAuthenticated={isAuthenticated} isPro={isPro} subscriptionPlan={subscriptionPlan} />
      <main>
        <Hero isAuthenticated={isAuthenticated} isPro={isPro} subscriptionPlan={subscriptionPlan} subscriptionStatus={subscriptionStatus} />
        <How />
        <Features />
        <Compare />
        <Pricing isAuthenticated={isAuthenticated} subscriptionPlan={subscriptionPlan} isPro={isPro} />
        <CTA isAuthenticated={isAuthenticated} />
        <Quote />
      </main>
      <Footer />
    </div>
  );
}

function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return <img src="/applogo.png" alt="Waydots" className={className} />;
}

/* ---------- Profile dropdown menu ---------- */
function ProfileMenu({
  isPro = false,
  subscriptionPlan = "free",
}: {
  isPro?: boolean;
  subscriptionPlan?: SubscriptionPlan;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const hasProPlan = isPro || subscriptionPlan === "pro";

  const [imageFailed, setImageFailed] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(() => {
    return (
      user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture ||
      user?.identities?.[0]?.identity_data?.avatar_url ||
      user?.identities?.[0]?.identity_data?.picture ||
      (typeof window !== "undefined" ? localStorage.getItem("user_avatar") : null) ||
      null
    );
  });

  const displayName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split("@")[0] ||
    "Account";

  const email = user?.email || "";

  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .map((part: string) => part.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  useEffect(() => {
    const metaAvatar =
      user?.user_metadata?.avatar_url ||
      user?.user_metadata?.picture ||
      user?.identities?.[0]?.identity_data?.avatar_url ||
      user?.identities?.[0]?.identity_data?.picture;

    if (metaAvatar) {
      setPhotoUrl(metaAvatar);
      setImageFailed(false);
      if (typeof window !== "undefined") {
        localStorage.setItem("user_avatar", metaAvatar);
      }
      return;
    }

    if (typeof window !== "undefined") {
      const cached = localStorage.getItem("user_avatar");
      if (cached) {
        setPhotoUrl(cached);
        return;
      }
      const token = localStorage.getItem("google_provider_token");
      if (token) {
        fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((info) => {
            if (info?.picture) {
              setPhotoUrl(info.picture);
              setImageFailed(false);
              localStorage.setItem("user_avatar", info.picture);
            }
          })
          .catch(() => {});
      }
    }
  }, [user]);

  const handleLogout = async () => {
    setIsOpen(false);
    await signOut();
    navigate("/");
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const navItems = [
    {
      label: "Workspace (Today)",
      sublabel: "Calendar & schedule",
      to: "/today",
      icon: Calendar,
    },
    {
      label: "Mail & AI",
      sublabel: "Smart drafts & inbox",
      to: "/mail",
      icon: Mail,
    },
    {
      label: "To-Do List",
      sublabel: "Actionable tasks",
      to: "/todos",
      icon: ListTodo,
    },
    {
      label: "Goals & Habits",
      sublabel: "Milestones & targets",
      to: "/goals",
      icon: Target,
    },
    {
      label: "Analytics",
      sublabel: "Productivity report",
      to: "/analysis",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger Button: circle with actual profile photo of the mail and the arrow */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-full bg-foreground text-background p-1 pr-2.5 hover:opacity-90 active:scale-95 transition shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="User profile and options"
      >
        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-background text-foreground flex items-center justify-center font-bold text-xs overflow-hidden shrink-0 border border-white/20">
          {photoUrl && !imageFailed ? (
            <img
              src={photoUrl}
              alt={displayName}
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              className="w-full h-full object-cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span>{initials}</span>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform duration-200 opacity-80 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 top-full mt-2.5 w-72 sm:w-80 rounded-2xl bg-white dark:bg-card border border-border/80 p-2 shadow-2xl z-50 text-foreground"
            style={{
              boxShadow: "0 20px 40px -15px rgba(0,0,0,0.15), 0 0 1px rgba(0,0,0,0.1)",
            }}
          >
            {/* Header: User Profile Info */}
            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/40 border border-border/40">
              <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center font-bold text-sm overflow-hidden shrink-0 border border-border/20">
                {photoUrl && !imageFailed ? (
                  <img
                    src={photoUrl}
                    alt={displayName}
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                    className="w-full h-full object-cover"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-semibold text-sm tracking-tight text-foreground truncate">
                    {displayName}
                  </p>
                  {hasProPlan ? (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      <Sparkles className="w-2.5 h-2.5" /> PRO
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-muted text-muted-foreground border border-border/60">
                      FREE
                    </span>
                  )}
                </div>
                {email && (
                  <p className="text-xs text-muted-foreground truncate">{email}</p>
                )}
              </div>
            </div>

            {/* Navigation Section */}
            <div className="my-1.5 px-1">
              <p className="text-[10px] font-bold tracking-wider uppercase text-muted-foreground/70 px-2 py-1">
                Workspace
              </p>
              <div className="space-y-0.5">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/70 transition group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:bg-background transition shrink-0 border border-border/40">
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-xs leading-none">{item.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-none mt-1">
                          {item.sublabel}
                        </p>
                      </div>
                      <ArrowRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-foreground group-hover:translate-x-0.5 transition" />
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-border/60 my-1 mx-1" />

            {/* Plan / Subscription section */}
            <div className="px-1 py-0.5">
              <Link
                to={hasProPlan ? "#pricing" : "/checkout"}
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-medium text-foreground hover:bg-muted/70 transition group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 border border-amber-500/20">
                    <Crown className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="font-semibold text-xs leading-none">
                      {hasProPlan ? "Pro Subscription" : "Upgrade Plan"}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-none mt-1">
                      {hasProPlan ? "All features unlocked" : "Unlock unlimited AI & sync"}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground">
                  {hasProPlan ? "Active" : "Upgrade"}
                </span>
              </Link>
            </div>

            <div className="h-px bg-border/60 my-1 mx-1" />

            {/* Logout */}
            <div className="px-1 pt-0.5">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-red-600 hover:bg-red-500/10 transition text-left cursor-pointer"
              >
                <div className="w-7 h-7 rounded-lg bg-red-500/10 text-red-600 flex items-center justify-center shrink-0">
                  <LogOut className="w-3.5 h-3.5" />
                </div>
                <span className="font-semibold">Sign out</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Floating pill nav ---------- */
function Nav({
  isAuthenticated,
  isPro = false,
  subscriptionPlan = "free",
}: {
  isAuthenticated: boolean;
  isPro?: boolean;
  subscriptionPlan?: SubscriptionPlan;
}) {
  return (
    <motion.div 
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className="fixed top-6 left-0 right-0 z-50 px-4"
    >
      <header
        className="mx-auto max-w-5xl flex items-center justify-between gap-8 rounded-full bg-card/80 backdrop-blur-xl border border-border/70 pl-7 pr-3 py-3.5"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <Link to="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-semibold tracking-tight">Waydots</span>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          <a href="#how" className="hover:text-foreground transition">How it works</a>
          <a href="#features" className="hover:text-foreground transition">Features</a>
          <a href="#pricing" className="hover:text-foreground transition">Pricing</a>
        </nav>
        {isAuthenticated ? (
          <ProfileMenu isPro={isPro} subscriptionPlan={subscriptionPlan} />
        ) : (
          <Link
            to="/signup"
            className="rounded-full bg-foreground text-background text-sm font-medium px-5 py-2 hover:opacity-90 transition"
          >
            Get started
          </Link>
        )}
      </header>
    </motion.div>
  );
}

/* ---------- Hero ---------- */
function Hero({ 
  isAuthenticated, 
  isPro, 
  subscriptionPlan, 
  subscriptionStatus 
}: { 
  isAuthenticated: boolean; 
  isPro: boolean; 
  subscriptionPlan: SubscriptionPlan; 
  subscriptionStatus: SubscriptionStatus 
}) {
  return (
    <section className="relative overflow-hidden bg-background">
      {/* Background Spotlight */}
      <div 
        className="absolute inset-x-0 -top-40 -z-10 h-[1000px] w-full opacity-50"
        style={{ background: "var(--gradient-hero)" }}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ duration: 1.5 }}
        aria-hidden
        className="absolute -left-32 top-20 h-[420px] w-[420px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--brand-warm) 0%, transparent 70%)" }}
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
        transition={{ duration: 1.5, delay: 0.2 }}
        aria-hidden
        className="absolute right-0 top-40 h-[360px] w-[360px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
      />

      <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-10 text-center">
        <motion.div 
          initial="initial"
          animate="animate"
          variants={staggerContainer}
        >
          <motion.div
            variants={fadeInUp}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-semibold tracking-[0.14em] uppercase"
          >
            {isAuthenticated ? (
              <>
                <span className={`h-1.5 w-1.5 rounded-full ${isPro ? "bg-emerald-500" : "bg-foreground"}`} />
                {subscriptionPlan === "pro" ? `Pro plan${subscriptionStatus === "trialing" ? " trial" : ""}` : "Free plan"}
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                The calendar for goals
              </>
            )}
          </motion.div>

          <motion.h1 
            variants={fadeInUp}
            className="mt-10 text-4xl sm:text-6xl md:text-8xl font-bold tracking-[-0.04em] leading-[0.98] sm:leading-[0.95]"
          >
            Turn plans into
            <br />
            <span className="italic font-bold text-muted-foreground/70">measurable</span>{" "}
            <span className="italic font-bold">progress.</span>
          </motion.h1>

          <motion.p 
            variants={fadeInUp}
            className="mt-8 text-base sm:text-lg text-muted-foreground max-w-xl mx-auto text-balance"
          >
            Waydots links every event to a goal — so you can see exactly where
            your time goes, and how each hour moves you forward.
          </motion.p>

          <motion.div 
            variants={fadeInUp}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-3"
          >
            <Link
              to={isAuthenticated ? "/today" : "/signup"}
              className="inline-flex w-full sm:w-auto justify-center items-center gap-2 rounded-full bg-foreground text-background px-7 h-12 text-base font-medium hover:opacity-90 transition"
            >
              {isAuthenticated ? "Go to Calendar" : "Start free"} <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#how"
              className="inline-flex w-full sm:w-auto justify-center items-center rounded-full border border-border bg-card px-7 h-12 text-base font-medium hover:bg-secondary transition"
            >
              See how it works
            </a>
          </motion.div>
        </motion.div>
      </div>

      {/* Calendar screenshot */}
      <motion.div 
        initial={{ opacity: 0, y: 40, scale: 0.98 }}
        whileInView={{ opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        className="relative mx-auto max-w-6xl px-6 mt-10 pb-24"
      >
        <div
          className="rounded-3xl overflow-hidden border border-border bg-card"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <img
            src="/monthview.png"
            alt="Waydots calendar — week view with goal-linked events"
            className="block w-full h-auto"
          />
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-16 h-40"
          style={{
            background:
              "linear-gradient(to bottom, transparent, var(--background) 85%)",
          }}
        />
      </motion.div>
    </section>
  );
}

/* ---------- Section heading helper ---------- */
function SectionHead({
  kicker,
  title,
  sub,
  align = "center",
}: {
  kicker: string;
  title: React.ReactNode;
  sub?: string;
  align?: "center" | "left";
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
      className={align === "center" ? "text-center max-w-2xl mx-auto" : "max-w-2xl"}
    >
      {kicker && (
        <div className="text-[11px] font-semibold tracking-[0.18em] uppercase text-muted-foreground">
          {kicker}
        </div>
      )}
      <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold tracking-[-0.03em]">{title}</h2>
      {sub && <p className="mt-4 text-muted-foreground text-lg">{sub}</p>}
    </motion.div>
  );
}

/* ---------- How it works — vertical timeline ---------- */
function How() {
  const steps = [
    {
      n: "01",
      title: "Define your intent",
      body: "Define weekly streaks, monthly milestones, or lifetime dreams. Set your direction.",
      image: "/assets/goal.png",
    },
    {
      n: "02",
      title: "Bridge the gap",
      body: "Link calendar events to your goals in a single tap. Turn hours into evidence.",
      image: "/assets/calendar2.png",
    },
    {
      n: "03",
      title: "See the momentum",
      body: "Watch your progress bars fill automatically. See where your time actually goes.",
      image: "/assets/progress.png",
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-5xl px-4 sm:px-6 py-20 sm:py-28">
      <SectionHead
        kicker=""
        title={
          <>
            From scattered hours to{" "}
            <span className="italic text-muted-foreground/70">stacked progress</span>.
          </>
        }
      />

      <div className="mt-16 relative">
        {/* spine */}
        <motion.div
          initial={{ height: 0 }}
          whileInView={{ height: "100%" }}
          viewport={{ once: true }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
          aria-hidden
          className="absolute left-6 md:left-1/2 top-2 bottom-2 w-px bg-border md:-translate-x-1/2 origin-top"
        />
        <div className="space-y-12">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: i * 0.1 }}
              className="relative grid md:grid-cols-2 gap-6 md:gap-12 items-center"
            >
              {/* dot */}
              <div
                aria-hidden
                className="absolute left-6 md:left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-foreground ring-4 ring-background"
              />
              <div className={i % 2 === 0 ? "md:pr-12 md:text-right pl-16 md:pl-0" : "md:order-2 md:pl-12 pl-16"}>
                <div className="text-xs font-mono text-muted-foreground">STEP {s.n}</div>
                <h3 className="mt-2 text-2xl md:text-3xl font-semibold tracking-tight">
                  {s.title}
                </h3>
                <p className="mt-3 text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
              <div className={i % 2 === 0 ? "pl-16 md:pl-12" : "md:order-1 md:pr-12 pl-16 md:pl-0 md:text-right"}>
                <motion.div
                  whileHover={{ scale: 1.05, rotate: i % 2 === 0 ? 2 : -2 }}
                  className={`inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-card border border-border overflow-hidden p-4`}
                  style={{ boxShadow: "var(--shadow-soft)" }}
                >
                  <img src={s.image} alt={s.title} className="w-full h-full object-contain" />
                </motion.div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- Features — bento grid ---------- */
function Features() {
  return (
    <section id="features" className="bg-secondary/40 border-y border-border/70">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-28">
        <SectionHead
          kicker=""
          title={
            <>
              A planning system,{" "}
              <span className="italic text-muted-foreground/70">not just a calendar</span>.
            </>
          }
        />

        <motion.div 
          initial="initial"
          whileInView="animate"
          viewport={{ once: true, margin: "-50px" }}
          variants={staggerContainer}
          className="mt-14 grid grid-cols-1 md:grid-cols-6 auto-rows-auto md:auto-rows-[180px] gap-4"
        >
          {/* Big: goal-linked events */}
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            className="md:col-span-4 md:row-span-2 rounded-3xl bg-card border border-border p-8 flex flex-col justify-between overflow-hidden relative"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <div>
              <div className="h-11 w-11 rounded-2xl bg-foreground text-background flex items-center justify-center">
                <Target className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-2xl font-semibold tracking-tight">Goal-linked events</h3>
              <p className="mt-2 text-muted-foreground max-w-md text-pretty">
                Every block of time can point at a goal. Hours stop being noise and start being evidence.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mt-6">
              {[
                ["Run 5k", "var(--chart-1)"],
                ["Deep work", "var(--chart-2)"],
                ["Read 20 pages", "var(--chart-5)"],
                ["Side project", "var(--chart-3)"],
              ].map(([label, c]) => (
                <span
                  key={label}
                  className="text-xs font-medium px-3 py-1.5 rounded-full"
                  style={{
                    background: `color-mix(in oklab, ${c} 15%, var(--background))`,
                    borderLeft: `3px solid ${c}`,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Multi-view */}
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            className="md:col-span-2 md:row-span-2 rounded-3xl bg-foreground text-background p-7 flex flex-col justify-between overflow-hidden"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <div>
              <div className="h-11 w-11 rounded-2xl bg-background/10 flex items-center justify-center">
                <Layers className="h-5 w-5" />
              </div>
              <h3 className="mt-5 text-xl font-semibold tracking-tight">
                Day · Week · Month · Year
              </h3>
              <p className="mt-2 text-sm opacity-70">
                Zoom from one hour to a whole year. Same calendar, different altitude.
              </p>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-4">
              {Array.from({ length: 16 }).map((_, j) => (
                <div
                  key={j}
                  className="h-6 rounded-md"
                  style={{
                    background:
                      j % 5 === 0
                        ? "var(--accent)"
                        : "rgba(255,255,255,0.12)",
                  }}
                />
              ))}
            </div>
          </motion.div>

          {/* Analytics */}
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            className="md:col-span-3 rounded-3xl bg-card border border-border p-7 flex items-center gap-5"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-foreground text-background flex items-center justify-center">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Visual Momentum</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Stop guessing where your week went. See exactly how much time you invested in your ambitions.
              </p>
            </div>
          </motion.div>

          {/* Routines */}
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            className="md:col-span-3 rounded-3xl bg-card border border-border p-7 flex items-center gap-5"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-foreground text-background flex items-center justify-center">
              <Repeat className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Routine Mastery</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Establish the rhythm of your life. Build consistency without the mental overhead of re-scheduling.
              </p>
            </div>
          </motion.div>

          {/* Reminders */}
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            className="md:col-span-3 rounded-3xl bg-card border border-border p-7 flex items-center gap-5"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-foreground text-background flex items-center justify-center">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Proactive Focus</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Free up your mental space. Get notified exactly when you need to transition to your next intent.
              </p>
            </div>
          </motion.div>

          {/* Search */}
          <motion.div
            variants={fadeInUp}
            whileHover={{ y: -5 }}
            className="md:col-span-3 rounded-3xl bg-card border border-border p-7 flex items-center gap-5"
            style={{ boxShadow: "var(--shadow-soft)" }}
          >
            <div className="h-11 w-11 shrink-0 rounded-2xl bg-foreground text-background flex items-center justify-center">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Universal Search</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Instant recall for your entire timeline. Find any goal, event, or milestone in a single keystroke.
              </p>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- Quote ---------- */
function Quote() {
  return (
    <section className="py-32 px-6 bg-secondary/10">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="mx-auto max-w-3xl text-center"
      >
        <p className="text-2xl md:text-3xl font-medium italic text-muted-foreground leading-relaxed tracking-tight text-balance">
          "Setting goals is the first step in turning the invisible into the visible."
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <div className="h-px w-12 bg-border" />
          <span className="text-xs font-bold uppercase tracking-[0.3em] text-foreground/30">Jim Rohn</span>
          <div className="h-px w-12 bg-border" />
        </div>
      </motion.div>
    </section>
  );
}

/* ---------- Compare ---------- */
function Compare() {
  const cols = ["Waydots", "Google Calendar", "Notion", "To-Do Apps"];
  const rows: Array<[string, ...Array<boolean | "partial">]> = [
    ["Goal-linked events", true, false, "partial", false],
    ["Time-per-goal analytics", true, false, false, false],
    ["Activity / progress view", true, false, "partial", "partial"],
    ["Smart recurring routines", true, true, "partial", "partial"],
    ["Goal-first planning", true, false, false, false],
  ];
  const cell = (v: boolean | "partial") =>
    v === true ? (
      <Check className="h-5 w-5 mx-auto" />
    ) : v === "partial" ? (
      <span className="text-xs text-muted-foreground font-semibold">Partial</span>
    ) : (
      <X className="h-5 w-5 mx-auto text-muted-foreground/40" />
    );
  return (
    <section id="compare" className="bg-secondary/40 border-y border-border/70">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-20 sm:py-28">
        <SectionHead kicker="" title="Why Waydots feels different." />
        <div className="mt-4 md:hidden flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground/75">
          <span>Swipe horizontally to compare</span>
          <span>&rarr;</span>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 sm:mt-14 overflow-hidden rounded-3xl border border-border bg-card"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full min-w-[560px] sm:min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="sticky left-0 bg-card z-10 shadow-[1px_0_0_rgba(0,0,0,0.06)] sm:shadow-none" />
                  {cols.map((c, i) => (
                    <th
                      key={c}
                      className={`p-3.5 sm:p-5 text-center whitespace-nowrap ${
                        i === 0 ? "text-foreground font-bold" : "text-muted-foreground"
                      }`}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, ...vals]) => (
                  <tr key={label} className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors group">
                    <td className="sticky left-0 bg-card p-3.5 sm:p-5 font-semibold text-foreground/80 z-10 whitespace-nowrap shadow-[1px_0_0_rgba(0,0,0,0.06)] sm:shadow-none">
                      {label}
                    </td>
                    {vals.map((v, i) => (
                      <td
                        key={i}
                        className={`p-3.5 sm:p-5 text-center ${i === 0 ? "bg-foreground/[0.03]" : ""}`}
                      >
                        {cell(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/* ---------- Pricing ---------- */
function Pricing({ isAuthenticated, subscriptionPlan, isPro }: { isAuthenticated: boolean; subscriptionPlan: SubscriptionPlan; isPro: boolean }) {
  return (
    <section id="pricing" className="mx-auto max-w-5xl px-4 sm:px-6 py-20 sm:py-28">
      <SectionHead
        kicker=""
        title="Start free. Grow into Pro."
        sub="Plan your first goals on us. Upgrade when momentum kicks in."
      />
      <motion.div 
        initial="initial"
        whileInView="animate"
        viewport={{ once: true }}
        variants={staggerContainer}
        className="mt-14 grid md:grid-cols-2 gap-5"
      >
        <motion.div
          variants={fadeInUp}
          whileHover={{ y: -5 }}
          className="rounded-3xl border border-border bg-card p-8 flex flex-col transition-all hover:shadow-xl"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <h3 className="text-xl font-semibold">Free</h3>
          <p className="text-sm text-muted-foreground mt-1">For getting started</p>
          <p className="mt-6 text-5xl font-bold tracking-tight">$0</p>
          <ul className="mt-8 space-y-3 text-sm flex-1">
            {["Up to 3 goals", "30-day history", "Weekly summary", "Goal-linked events"].map((i) => (
              <li key={i} className="flex items-center gap-3 font-medium text-muted-foreground/80">
                <Check className="h-4 w-4 text-foreground" /> {i}
              </li>
            ))}
          </ul>
          <Link
            to={isAuthenticated ? "/today" : "/signup"}
            className="w-full mt-8 rounded-full border border-border h-12 font-bold text-sm hover:bg-secondary transition flex items-center justify-center tracking-tight"
          >
            {isAuthenticated && subscriptionPlan === "free" ? "Current plan" : "Get started"}
          </Link>
        </motion.div>
        <motion.div
          variants={fadeInUp}
          whileHover={{ y: -5 }}
          className="rounded-3xl bg-foreground text-background p-8 relative overflow-hidden flex flex-col transition-all hover:shadow-2xl group"
          style={{ boxShadow: "var(--shadow-soft)" }}
        >
          <span className="absolute top-5 right-5 text-[10px] font-bold tracking-[0.2em] uppercase rounded-full bg-background/10 px-3 py-1 backdrop-blur-sm">
            Pro
          </span>
          <h3 className="text-xl font-semibold">Pro</h3>
          <p className="text-sm opacity-60 mt-1">For serious momentum</p>
          <p className="mt-6 text-5xl font-bold tracking-tight">
            $5<span className="text-base opacity-60 font-medium">/mo</span>
          </p>
          <ul className="mt-8 space-y-3 text-sm flex-1">
            {["Unlimited goals", "Full activity history", "Custom colors and icons", "Advanced insights"].map((i) => (
              <li key={i} className="flex items-center gap-3 font-medium">
                <Check className="h-4 w-4 opacity-100" /> {i}
              </li>
            ))}
          </ul>
          {isAuthenticated && !isPro ? (
            <Link
              to="/checkout"
              className="w-full mt-8 rounded-full bg-background text-foreground h-12 font-bold text-sm hover:opacity-90 transition flex items-center justify-center tracking-tight"
            >
              Unlock Pro
            </Link>
          ) : (
            <Link
              to={isAuthenticated ? "/today" : "/signup"}
              className="w-full mt-8 rounded-full bg-background text-foreground h-12 font-bold text-sm hover:opacity-90 transition flex items-center justify-center tracking-tight"
            >
              {isAuthenticated ? "Current plan" : "Go Pro"}
            </Link>
          )}
          
          <div 
            className="absolute -bottom-20 -right-20 h-64 w-64 rounded-full opacity-20 blur-3xl group-hover:opacity-30 transition-opacity"
            style={{ background: "var(--gradient-accent)" }}
          />
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ---------- CTA ---------- */
function CTA({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 pb-20 sm:pb-28">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-[2rem] bg-foreground text-background px-5 sm:px-8 py-14 sm:py-20 text-center group"
        style={{ boxShadow: "var(--shadow-soft)" }}
      >
        <div
          aria-hidden
          className="absolute -top-32 left-1/2 -translate-x-1/2 h-[400px] w-[700px] rounded-full opacity-30 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
        />
        <h2 className="relative text-3xl sm:text-4xl md:text-6xl font-bold tracking-[-0.03em] leading-tight">
          Clarity over chaos.
        </h2>
        <p className="relative mt-5 text-lg opacity-70 max-w-xl mx-auto font-medium">
          Stop wondering where the week went. Start seeing where it goes.
        </p>
        <Link
          to={isAuthenticated ? "/today" : "/signup"}
          className="relative mt-9 inline-flex items-center gap-2 rounded-full bg-background text-foreground px-10 h-14 text-base font-bold hover:scale-105 transition-all shadow-lg active:scale-95 tracking-tight"
        >
          {isAuthenticated ? "Go to Calendar" : "Start with Waydots"} <ArrowRight className="h-5 w-5" />
        </Link>
      </motion.div>
    </section>
  );
}

/* ---------- Footer ---------- */
function Footer() {
  return (
    <footer className="border-t border-border/70 py-16">
      <div className="mx-auto max-w-6xl px-6 flex flex-col md:flex-row items-center justify-between gap-8 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Logo className="h-6 w-6" />
          <span className="font-bold text-foreground tracking-tight text-lg">Waydots</span>
          <span className="font-medium">© {new Date().getFullYear()}</span>
        </div>
        <span className="font-medium tracking-tight">A calendar for intentional living.</span>
      </div>
    </footer>
  );
}
