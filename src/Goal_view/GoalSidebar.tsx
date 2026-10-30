import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, ChevronRight, ChevronsUpDown, CircleDot, Palette, Shapes, Target } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import type { Goal } from "./goal";
import { DEFAULT_GOAL_ICON, GOAL_COLORS, GOAL_ICONS, normalizeGoalIcon } from "./goal";
import { Button } from "@/components/ui/button";

interface GoalSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  isPro: boolean;
  prefillName: string;
  prefillNotes?: string;
  prefillColor?: string;
  prefillIcon?: string;
  prefillTargetValue?: number;
  prefillTargetPeriod?: Goal["targetPeriod"];
  prefillStatus?: Goal["status"];
  columnType?: 'week' | 'month' | 'year' | 'life' | null;
  onSave: (data: {
    text: string;
    notes: string;
    color: string;
    icon: string;
    targetValue: number;
    targetPeriod: Goal["targetPeriod"];
    status: Goal["status"];
  }) => void;
  onClearPrefill: () => void;
}

const GoalSidebar = ({
  isOpen,
  onToggle,
  isPro,
  prefillName,
  prefillNotes,
  prefillColor,
  prefillIcon,
  prefillTargetValue,
  prefillTargetPeriod,
  prefillStatus,
  columnType,
  onSave,
  onClearPrefill,
}: GoalSidebarProps) => {
  const navigate = useNavigate();
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const getAvailableTargetPeriods = () => {
    if (!columnType) {
      return ["day", "week", "month", "year"];
    }
    
    // Day is included in every column type
    switch (columnType) {
      case "week":
        return ["day", "week"]; // Day and week for weekly goals
      case "month":
        return ["day", "week", "month"]; // Day, week, or month for monthly goals
      case "year":
      case "life":
        return ["day", "week", "month", "year"]; // Day, week, month, or year for yearly and life goals
      default:
        return ["day", "week", "month", "year"];
    }
  };

  const [name, setName] = useState("");
  const [color, setColor] = useState(GOAL_COLORS[0].value);
  const [targetValue, setTargetValue] = useState("0");
  const [targetPeriod, setTargetPeriod] = useState<Goal["targetPeriod"]>("week");
  const [status, setStatus] = useState<Goal["status"]>("active");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState(DEFAULT_GOAL_ICON);

  useEffect(() => {
    if (prefillName) {
      setName(prefillName);
      setColor(prefillColor || GOAL_COLORS[0].value);
      setTargetValue(prefillTargetValue !== undefined ? String(prefillTargetValue) : "0");
      
      // Ensure target period is valid for the column type
      const availablePeriods = getAvailableTargetPeriods();
      const newTargetPeriod = prefillTargetPeriod || "week";
      if (availablePeriods.includes(newTargetPeriod as Goal["targetPeriod"])) {
        setTargetPeriod(newTargetPeriod as Goal["targetPeriod"]);
      } else {
        // Default to the first available period
        setTargetPeriod((availablePeriods[0] as Goal["targetPeriod"]) || "week");
      }
      
      setStatus(prefillStatus || "active");
      setDescription(prefillNotes || "");
      setIcon(normalizeGoalIcon(prefillIcon));
      setEditingGoal(null);
    }
  }, [prefillName, prefillNotes, prefillColor, prefillIcon, prefillTargetValue, prefillTargetPeriod, prefillStatus]);

  const resetForm = () => {
    setName("");
    setColor(GOAL_COLORS[0].value);
    setTargetValue("0");
    setTargetPeriod("week");
    setStatus("active");
    setDescription("");
    setIcon(DEFAULT_GOAL_ICON);
    setEditingGoal(null);
  };

  const handleSave = () => {
    if (!name.trim()) return;

    onSave({
      text: name.trim(),
      notes: description.trim(),
      color,
      icon,
      targetValue: isNaN(parseFloat(targetValue)) ? 1 : parseFloat(targetValue),
      targetPeriod,
      status,
    });
    
    resetForm();
    onToggle();
  };

  const title = prefillName ? "Refine Goal" : "Create Goal";
  const lockedSectionContentClassName = isPro ? "" : "pointer-events-none select-none blur-[3px]";

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Close goal sidebar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onToggle}
              className="fixed inset-0 z-40 bg-transparent"
            />
            <motion.div
              initial={{ x: 600 }}
              animate={{ x: 0 }}
              exit={{ x: 600 }}
              transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
              className="fixed right-0 top-0 bottom-0 z-50 flex w-[600px] flex-col overflow-hidden border-l border-gray-300 bg-neutral-100 text-neutral-800"
            >
              <div className="px-4 pb-3 pt-4 shrink-0">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="mt-2 text-[34px] font-semibold text-neutral-800">{title}</h2>
                  </div>
                  <button
                    onClick={onToggle}
                    className="flex h-16 w-16 items-center justify-center rounded-full border border-black/5 bg-white/60 text-slate-600 shadow-lg backdrop-blur-md transition-all duration-200 ease-out hover:scale-110 hover:text-slate-800 hover:shadow-xl active:scale-95"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 mt-10 overflow-y-auto no-scrollbar px-4 pb-4">
                <div className="w-full rounded-[52px] border border-neutral-100 bg-[#ececec] px-5 py-6 shadow-none">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Goal Name"
                    autoFocus
                    className="w-full bg-transparent border-none outline-none text-5xl font-bold leading-tight text-neutral-600 placeholder:text-neutral-600"
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Notes"
                    rows={3}
                    className="mt-3 w-full resize-none bg-transparent border-none outline-none text-xl font-bold leading-7 text-neutral-500 placeholder:text-neutral-500 [&::-webkit-scrollbar]:hidden"
                  />
                </div>

                <div className="mt-5 w-full rounded-[52px] border border-neutral-100 bg-[#ececec] pl-5 pr-6 py-6 shadow-none">
                  <div className={lockedSectionContentClassName}>
                    <div className="flex items-center justify-between py-1 px-0">
                      <div className="flex items-center gap-3">
                        <Palette className="w-7 h-7 text-neutral-600 opacity-30" />
                        <span className="pl-2 text-2xl shrink-0 text-neutral-800">Color</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {GOAL_COLORS.map((c) => (
                          <button
                            key={c.value}
                            type="button"
                            onClick={() => setColor(c.value)}
                            disabled={!isPro}
                            title={c.label}
                            className={`flex h-7 min-w-7 items-center justify-center rounded-full transition-all ${
                              color === c.value ? "ring-2 ring-neutral-500 ring-offset-2 ring-offset-[#ececec]" : "hover:scale-110"
                            } ${!isPro ? "cursor-not-allowed" : ""}`}
                            style={c.value ? { backgroundColor: `hsl(${c.value})` } : undefined}
                          >
                            {c.value ? null : <Ban className="h-4 w-4 text-neutral-600" />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <hr className="border-neutral-300 border-t-[2px] my-3" />
                  </div>

                  <div className="flex items-center justify-between py-1 px-0">
                    <div className="flex items-center gap-3">
                      <Target className="w-7 h-7 text-neutral-600 opacity-30" />
                      <span className="pl-2 text-2xl shrink-0 text-neutral-800">Target</span>
                    </div>

                    <div className="inline-flex flex-nowrap items-center gap-2 whitespace-nowrap text-2xl leading-none text-neutral-700">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={targetValue}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9.]/g, "");
                          // Allow only one dot
                          const dots = val.match(/\./g);
                          if (dots && dots.length > 1) return;
                          setTargetValue(val);
                        }}
                        className="w-14 shrink-0 rounded-lg border-b-2 border-neutral-300 bg-neutral-100 px-2 py-1 outline-none text-center text-xl text-neutral-800 transition-colors focus:border-red-500 focus:text-red-500"
                      />
                      <span className="shrink-0 pb-0.5 leading-none">hrs /</span>
                      <Select value={targetPeriod} onValueChange={(v) => setTargetPeriod(v as Goal["targetPeriod"])}>
                        <SelectTrigger
                          hideIcon
                          className="h-auto w-auto shrink-0 justify-start gap-4 whitespace-nowrap border-none bg-transparent p-0 text-2xl leading-none text-neutral-700 shadow-none focus:ring-0 focus:ring-offset-0"
                        >
                          <span className="flex items-center justify-end whitespace-nowrap pb-0.5 text-right leading-none">
                            <SelectValue />
                          </span>
                          <span className="shrink-0 rounded-full bg-neutral-300 p-1 transition-colors hover:bg-neutral-500">
                            <ChevronsUpDown className="h-5 w-5 text-neutral-700" />
                          </span>
                        </SelectTrigger>
                        <SelectContent data-goal-sidebar-interactive="true">
                          {getAvailableTargetPeriods().map((period) => (
                            <SelectItem key={period} value={period}>
                              {period.charAt(0).toUpperCase() + period.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <hr className="border-neutral-300 border-t-[2px] my-3" />

                  <div className="flex items-center justify-between py-1 px-0">
                    <div className="flex items-center gap-3">
                      <CircleDot className="w-7 h-7 text-neutral-600 opacity-30" />
                      <span className="pl-2 text-2xl shrink-0 text-neutral-800">Status</span>
                    </div>

                    <Select value={status} onValueChange={(v) => setStatus(v as Goal["status"])}>
                    <SelectTrigger
                      hideIcon
                      className="h-auto w-auto shrink-0 justify-start gap-4 whitespace-nowrap border-none bg-transparent p-0 text-2xl leading-none text-neutral-700 shadow-none focus:ring-0 focus:ring-offset-0"
                    >
                      <span className="flex items-center justify-end whitespace-nowrap text-right">
                        <SelectValue />
                      </span>
                      <span className="shrink-0 rounded-full bg-neutral-300 p-1 transition-colors hover:bg-neutral-500">
                        <ChevronsUpDown className="h-5 w-5 text-neutral-700" />
                      </span>
                    </SelectTrigger>
                      <SelectContent data-goal-sidebar-interactive="true">
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="paused">Paused</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="mt-5 w-full rounded-[52px] border border-neutral-100 bg-[#ececec] pl-5 pr-6 py-6 shadow-none">
                  <div className={lockedSectionContentClassName}>
                    <div className="flex items-center justify-between py-1 px-0">
                      <div className="flex items-center gap-3">
                        <Shapes className="w-7 h-7 text-neutral-600 opacity-30" />
                        <span className="pl-2 text-2xl shrink-0 text-neutral-800">Icon</span>
                      </div>
                      <span className="text-xl text-neutral-600">
                        {GOAL_ICONS.find((item) => item.value === icon)?.label ?? "None"}
                      </span>
                    </div>

                    <hr className="border-neutral-300 border-t-[2px] my-3" />

                    <div className="flex flex-wrap gap-2 pt-1">
                      {GOAL_ICONS.map((item) => {
                        const Icon = item.icon;
                        const isSelected = icon === item.value;

                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() => setIcon(item.value)}
                            disabled={!isPro}
                            title={item.label}
                            className={`flex h-14 w-14 items-center justify-center rounded-full transition-all ${
                              isSelected
                                ? "bg-red-500 text-white shadow-sm"
                                : "bg-neutral-300 text-neutral-700 hover:bg-neutral-400"
                            } ${!isPro ? "cursor-not-allowed" : ""}`}
                          >
                            {Icon ? (
                              <Icon className="h-5 w-5" />
                            ) : (
                              <Ban className="h-5 w-5" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                </div>
              </div>

              <div className="mt-auto pt-4 px-4 pb-4 flex justify-end">
                <Button
                  variant="secondary"
                  onClick={handleSave}
                  disabled={!name.trim()}
                  className="bg-red-600 text-white hover:bg-red-700 px-8 py-6 text-lg rounded-full disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Save
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default GoalSidebar;
