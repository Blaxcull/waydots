import { useState, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  Flag,
  Trash2,
  ListChecks,
  Plus,
  X,
  Check,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  useTasksStore,
  type TaskView,
  type TaskPriority,
  type SubtaskItem,
} from "@/store/tasksStore";

interface TaskSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string | null;
  initialSectionId?: string | null;
  initialView?: TaskView;
}

const PRIORITY_OPTIONS: {
  id: TaskPriority;
  label: string;
  name: string;
  flagColor: string;
  activeBg: string;
}[] = [
  { id: "p1", label: "P1", name: "Highest", flagColor: "text-red-500 fill-red-500", activeBg: "bg-red-500" },
  { id: "p2", label: "P2", name: "High", flagColor: "text-orange-500 fill-orange-500", activeBg: "bg-orange-500" },
  { id: "p3", label: "P3", name: "Medium", flagColor: "text-blue-500 fill-blue-500", activeBg: "bg-blue-500" },
  { id: "p4", label: "P4", name: "Lowest", flagColor: "text-neutral-400 fill-neutral-400", activeBg: "bg-neutral-600" },
];

/* Generate 15-minute time options */
const TIME_OPTIONS: { label: string; minutes: number }[] = [];
for (let hour = 0; hour < 24; hour++) {
  for (let min = 0; min < 60; min += 15) {
    TIME_OPTIONS.push({
      label: `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`,
      minutes: hour * 60 + min,
    });
  }
}

/* ================= DATE PICKER COMPONENT ================= */
function TaskDatePicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (dateStr: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const hasDate = Boolean(value && value.trim() !== "" && value !== "No Date" && value !== "Select date");

  const parsedDate = useMemo(() => {
    if (!hasDate || !value) return new Date();
    if (value === "Today") return new Date();
    if (value === "Tomorrow") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d;
    }
    const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
    return isNaN(d.getTime()) ? new Date() : d;
  }, [hasDate, value]);

  const [month, setMonth] = useState<Date>(parsedDate);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const formattedDisplay = useMemo(() => {
    if (!hasDate) return "Select date";
    return format(parsedDate, "MMM d, yyyy");
  }, [hasDate, parsedDate]);

  return (
    <div ref={containerRef} className="flex items-center gap-2">
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={() => {
            if (!isOpen) setMonth(parsedDate);
            setIsOpen(!isOpen);
          }}
          className={`rounded-full px-4 py-1.5 text-base font-semibold transition-all ${
            isOpen
              ? "border-2 border-red-500 bg-neutral-100 text-red-500 shadow-sm"
              : hasDate
              ? "border border-neutral-300 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
              : "border border-neutral-300 bg-neutral-100 text-red-500 hover:bg-neutral-200"
          }`}
        >
          {formattedDisplay}
        </button>

        {isOpen && (
          <div className="absolute top-full right-0 z-50 mt-1.5 bg-[#f6f6f6] shadow-2xl rounded-2xl p-2.5 border border-black/10">
            <Calendar
              mode="single"
              selected={hasDate ? parsedDate : undefined}
              month={month}
              onMonthChange={setMonth}
              onSelect={(date) => {
                if (date) {
                  onChange(format(date, "yyyy-MM-dd"));
                  setIsOpen(false);
                }
              }}
              className="bg-[#f6f6f6] text-black rounded-xl"
            />
          </div>
        )}
      </div>

      {hasDate && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          title="Clear date"
          className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-black/5 hover:text-neutral-700 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ================= TIME PICKER COMPONENT ================= */
function TaskTimePicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (timeStr: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hasTime = Boolean(value && value.trim() !== "");

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !listRef.current) return;
    const selectedEl = listRef.current.querySelector('[data-selected="true"]') as HTMLElement;
    if (selectedEl) {
      listRef.current.scrollTop =
        selectedEl.offsetTop - listRef.current.clientHeight / 2 + selectedEl.clientHeight / 2;
    } else {
      // Auto-scroll to near current time so user starts near now instead of 00:00 midnight
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + Math.round(now.getMinutes() / 15) * 15;
      const closestOption = TIME_OPTIONS.reduce((prev, curr) =>
        Math.abs(curr.minutes - currentMinutes) < Math.abs(prev.minutes - currentMinutes) ? curr : prev
      );
      const defaultEl = listRef.current.querySelector(`[data-time="${closestOption.label}"]`) as HTMLElement;
      if (defaultEl) {
        listRef.current.scrollTop =
          defaultEl.offsetTop - listRef.current.clientHeight / 2 + defaultEl.clientHeight / 2;
      }
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className="flex items-center gap-2">
      <div className="relative inline-flex">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`rounded-full px-4 py-1.5 text-base font-semibold transition-all ${
            isOpen
              ? "border-2 border-red-500 bg-neutral-100 text-red-500 shadow-sm"
              : hasTime
              ? "border border-neutral-300 bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
              : "border border-neutral-300 bg-neutral-100 text-red-500 hover:bg-neutral-200"
          }`}
        >
          {value || "Select time"}
        </button>

        {isOpen && (
          <div
            ref={listRef}
            className="absolute top-full left-1/2 -translate-x-1/2 z-50 mt-1.5 bg-[#f6f6f6] shadow-2xl rounded-2xl p-1.5 max-h-[220px] overflow-y-auto w-28 border border-black/10 no-scrollbar"
          >
            {TIME_OPTIONS.map((opt) => {
              const isSelected = value === opt.label;
              return (
                <button
                  key={opt.label}
                  type="button"
                  data-time={opt.label}
                  data-selected={isSelected}
                  onClick={() => {
                    onChange(opt.label);
                    setIsOpen(false);
                  }}
                  className={`w-full text-center py-2 px-2 rounded-xl text-lg transition-colors ${
                    isSelected
                      ? "bg-red-500 text-white font-medium shadow-sm"
                      : "text-neutral-800 hover:bg-neutral-200/80 font-normal"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {hasTime && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          title="Clear time"
          className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 hover:bg-black/5 hover:text-neutral-700 transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ================= SIDEBAR CONTENT ================= */
function TaskSidebarContent({
  taskId,
  initialSectionId,
  initialView,
  onClose,
}: {
  taskId: string | null;
  initialSectionId?: string | null;
  initialView?: TaskView;
  onClose: () => void;
}) {
  const tasks = useTasksStore((state) => state.tasks);
  const activeView = useTasksStore((state) => state.activeView);
  const addTask = useTasksStore((state) => state.addTask);
  const updateTask = useTasksStore((state) => state.updateTask);
  const deleteTask = useTasksStore((state) => state.deleteTask);

  const activeTask = taskId ? tasks.find((t) => t.id === taskId) : null;
  const isCreating = !activeTask;

  const [title, setTitle] = useState(activeTask?.title || "");
  const [notes, setNotes] = useState(activeTask?.notes || "");
  // Default is empty string ("Select date") or today's date if creating in today view
  const [dueDate, setDueDate] = useState(
    activeTask?.dueDate ||
      (isCreating && initialView === "today"
        ? format(new Date(), "yyyy-MM-dd")
        : "")
  );
  // Default is empty string ("Select time")
  const [dueTime, setDueTime] = useState(activeTask?.dueTime || "");
  const [priority, setPriority] = useState<TaskPriority>(
    (activeTask?.priority as TaskPriority) || "p4"
  );
  const [subtasks, setSubtasks] = useState<SubtaskItem[]>(
    activeTask?.subtasks || []
  );
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");

  const handleToggleSubtask = (subtaskId: string) => {
    setSubtasks((prev) =>
      prev.map((st) =>
        st.id === subtaskId ? { ...st, completed: !st.completed } : st
      )
    );
  };

  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    const newSubtask: SubtaskItem = {
      id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: newSubtaskTitle.trim(),
      completed: false,
    };
    setSubtasks((prev) => [...prev, newSubtask]);
    setNewSubtaskTitle("");
  };

  const handleDeleteSubtask = (subtaskId: string) => {
    setSubtasks((prev) => prev.filter((st) => st.id !== subtaskId));
  };

  const handleSave = () => {
    if (!title.trim()) return;

    if (activeTask) {
      updateTask(activeTask.id, {
        title: title.trim(),
        notes,
        dueDate: dueDate.trim() ? dueDate : undefined,
        dueTime: dueTime.trim() ? dueTime : undefined,
        priority,
        subtasks,
      });
    } else {
      addTask({
        title: title.trim(),
        sectionId: initialSectionId || undefined,
        view: initialView || activeView,
        dueDate: dueDate.trim() ? dueDate : undefined,
        dueTime: dueTime.trim() ? dueTime : undefined,
        priority,
        notes,
        subtasks,
      });
    }
    onClose();
  };

  const handleDelete = () => {
    if (activeTask) {
      deleteTask(activeTask.id);
    }
    onClose();
  };

  const completedSubtasksCount = subtasks.filter((s) => s.completed).length;

  return (
    <>
      {/* Top Header */}
      <div className="px-6 pb-2 pt-5 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-[34px] font-semibold text-neutral-800">
            {isCreating ? "New Task" : "Task Details"}
          </h2>
        </div>
        <button
          onClick={onClose}
          type="button"
          title="Close"
          className="flex h-16 w-16 items-center justify-center rounded-full border border-black/5 bg-white/60 text-slate-600 shadow-lg backdrop-blur-md transition-all duration-200 ease-out hover:scale-110 hover:text-slate-800 hover:shadow-xl active:scale-95"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>

      {/* Main Form Body */}
      <div className="flex-1 mt-6 overflow-y-auto no-scrollbar px-6 pb-6 space-y-4">
        {/* Card 1: Task Name & Notes */}
        <div className="w-full rounded-[44px] border border-neutral-100 bg-[#ececec] px-6 py-6 shadow-none">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task Name"
            autoFocus
            className="w-full bg-transparent border-none outline-none text-4xl font-bold leading-tight text-neutral-800 placeholder:text-neutral-400"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes"
            rows={3}
            className="mt-3 w-full resize-none bg-transparent border-none outline-none text-xl font-medium leading-7 text-neutral-600 placeholder:text-neutral-400 [&::-webkit-scrollbar]:hidden"
          />
        </div>

        {/* Card 2: Date & Time + Priority */}
        <div className="w-full rounded-[44px] border border-neutral-100 bg-[#ececec] px-6 py-5 shadow-none">
          {/* Priority Row (Centered P1, P2, P3, P4 with Flag icons) */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <Flag className="w-6 h-6 text-neutral-600 opacity-40" />
              <span className="text-xl font-semibold text-neutral-800">Priority</span>
            </div>

            <div className="inline-flex items-center gap-1.5 p-1 bg-neutral-200/90 rounded-full">
              {PRIORITY_OPTIONS.map((p) => {
                const isSelected =
                  priority === p.id ||
                  (p.id === "p1" && priority === "high") ||
                  (p.id === "p3" && priority === "medium") ||
                  (p.id === "p4" && priority === "low");

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPriority(p.id)}
                    className={`flex items-center justify-center gap-1.5 min-w-[54px] h-8 px-2.5 rounded-full text-xs font-bold transition-all ${
                      isSelected
                        ? `${p.activeBg} text-white shadow-sm scale-105`
                        : "text-neutral-700 hover:text-neutral-900 hover:bg-white/50"
                    }`}
                  >
                    <Flag
                      className={`h-3 w-3 shrink-0 ${
                        isSelected ? "text-white fill-white" : p.flagColor
                      }`}
                    />
                    <span className="font-bold leading-none">{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <hr className="border-neutral-300 border-t-[1.5px] my-3" />

          {/* Date Row (By default "Select date") */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <CalendarIcon className="w-6 h-6 text-neutral-600 opacity-40" />
              <span className="text-xl font-semibold text-neutral-800">Date</span>
            </div>

            <TaskDatePicker
              value={dueDate}
              onChange={(newDate) => setDueDate(newDate)}
            />
          </div>

          <hr className="border-neutral-300 border-t-[1.5px] my-3" />

          {/* Time Row (By default "Select time", dropdown centered beneath button) */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <Clock className="w-6 h-6 text-neutral-600 opacity-40" />
              <span className="text-xl font-semibold text-neutral-800">Time</span>
            </div>

            <TaskTimePicker
              value={dueTime}
              onChange={(newTime) => setDueTime(newTime)}
            />
          </div>
        </div>

        {/* Card 3: Subtasks */}
        <div className="w-full rounded-[44px] border border-neutral-100 bg-[#ececec] px-6 py-5 shadow-none">
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-3">
              <ListChecks className="w-6 h-6 text-neutral-600 opacity-40" />
              <span className="text-xl font-semibold text-neutral-800">Subtasks</span>
            </div>

            {subtasks.length > 0 && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-300/70 text-neutral-700">
                {completedSubtasksCount} of {subtasks.length} completed
              </span>
            )}
          </div>

          {/* Checklist of Subtasks */}
          {subtasks.length > 0 && (
            <div className="mt-3 space-y-1">
              {subtasks.map((st) => (
                <div
                  key={st.id}
                  className="group flex items-center justify-between gap-3 py-1.5 px-3 rounded-xl hover:bg-black/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggleSubtask(st.id)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                        st.completed
                          ? "bg-neutral-900 border-neutral-900 text-white"
                          : "border-neutral-300 hover:border-neutral-500 bg-white"
                      }`}
                    >
                      {st.completed && <Check className="h-3 w-3 stroke-[3]" />}
                    </button>
                    <span
                      className={`truncate text-base font-medium ${
                        st.completed
                          ? "line-through text-neutral-400"
                          : "text-neutral-800"
                      }`}
                    >
                      {st.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {st.dueDate && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-neutral-200 text-neutral-600 font-medium">
                        {st.dueDate}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDeleteSubtask(st.id)}
                      title="Delete subtask"
                      className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-500 transition-opacity p-1 rounded-md hover:bg-black/5"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Subtask Input */}
          <div className="mt-3 flex items-center gap-2.5 bg-white border border-black/5 rounded-full px-4 py-2 transition-all focus-within:border-black/20 focus-within:shadow-xs">
            <Plus className="h-4 w-4 text-neutral-400 shrink-0" />
            <input
              type="text"
              value={newSubtaskTitle}
              onChange={(e) => setNewSubtaskTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddSubtask();
                }
              }}
              placeholder="Add a subtask..."
              className="flex-1 bg-transparent text-sm md:text-base text-neutral-800 placeholder:text-neutral-400 outline-none font-medium"
            />
            {newSubtaskTitle.trim() && (
              <button
                type="button"
                onClick={handleAddSubtask}
                className="rounded-full bg-neutral-900 px-3.5 py-1 text-xs font-semibold text-white hover:bg-neutral-800 transition-all shrink-0"
              >
                Add
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-auto pt-4 px-6 pb-6 flex items-center justify-between shrink-0">
        {!isCreating ? (
          <button
            type="button"
            onClick={handleDelete}
            className="flex items-center gap-1.5 text-base font-semibold text-red-600 hover:text-red-700 transition-colors"
          >
            <Trash2 className="h-5 w-5" /> Delete Task
          </button>
        ) : (
          <div />
        )}

        <Button
          onClick={handleSave}
          disabled={!title.trim()}
          className="rounded-full bg-neutral-900 px-8 py-6 text-lg font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {isCreating ? "Create Task" : "Save"}
        </Button>
      </div>
    </>
  );
}

export function TaskSidebar({
  isOpen,
  onClose,
  taskId,
  initialSectionId,
  initialView,
}: TaskSidebarProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[20090] bg-black/20 backdrop-blur-[2px]"
          />

          {/* Slide-out Sidebar Panel */}
          <motion.div
            initial={{ x: 600 }}
            animate={{ x: 0 }}
            exit={{ x: 600 }}
            transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
            className="fixed right-0 top-0 bottom-0 z-[20100] flex w-full max-w-[600px] flex-col overflow-hidden border-l border-gray-300 bg-neutral-100 text-neutral-800"
          >
            <TaskSidebarContent
              key={taskId || `new-${initialSectionId || "default"}`}
              taskId={taskId}
              initialSectionId={initialSectionId}
              initialView={initialView}
              onClose={onClose}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
export default TaskSidebar;
