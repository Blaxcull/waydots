import { useState, useEffect } from "react";
import { Plus, Calendar, Trash2, ListChecks, Check, Sun, Flag } from "lucide-react";
import { format } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { useTasksStore, type TaskItem } from "@/store/tasksStore";
import { TaskSidebar } from "./TaskSidebar";

export default function TaskView() {
  const activeView = useTasksStore((state) => state.activeView);
  const sections = useTasksStore((state) => state.sections);
  const tasks = useTasksStore((state) => state.tasks);
  const toggleTask = useTasksStore((state) => state.toggleTask);
  const addSection = useTasksStore((state) => state.addSection);
  const updateSectionTitle = useTasksStore((state) => state.updateSectionTitle);
  const deleteSection = useTasksStore((state) => state.deleteSection);
  const selectedTaskId = useTasksStore((state) => state.selectedTaskId);
  const isSidebarOpen = useTasksStore((state) => state.isSidebarOpen);
  const setSelectedTaskId = useTasksStore((state) => state.setSelectedTaskId);
  const setIsSidebarOpen = useTasksStore((state) => state.setIsSidebarOpen);
  const fetchTasks = useTasksStore((state) => state.fetchTasks);

  const [creatingSectionId, setCreatingSectionId] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState("");

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const handleToggle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleTask(id);
  };

  const handleOpenTaskSidebar = (task: TaskItem) => {
    setCreatingSectionId(null);
    setSelectedTaskId(task.id);
    setIsSidebarOpen(true);
  };

  const handleOpenAddSidebar = (sectionId?: string) => {
    setSelectedTaskId(null);
    setCreatingSectionId(sectionId || null);
    setIsSidebarOpen(true);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    setSelectedTaskId(null);
    setCreatingSectionId(null);
  };

  const handleAddSectionClick = () => {
    addSection("inbox");
  };

  const handleSaveSectionTitle = (id: string) => {
    if (editingTitleText.trim()) {
      updateSectionTitle(id, editingTitleText.trim());
    }
    setEditingSectionId(null);
  };

  const formatTaskDate = (dueDate: string) => {
    if (dueDate === "Today" || dueDate === "Tomorrow") return dueDate;
    try {
      const d = new Date(dueDate.includes("T") ? dueDate : `${dueDate}T00:00:00`);
      if (!isNaN(d.getTime())) {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
    } catch {
      // fallback
    }
    return dueDate;
  };

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const overdueTasks = tasks.filter((t) => {
    if (t.completed || !t.dueDate) return false;
    if (t.dueDate === "Today" || t.dueDate === "Tomorrow") return false;
    return t.dueDate < todayStr;
  });

  const todayTasks = tasks.filter((t) => {
    if (t.completed) return false;
    if (t.view === "today") return true;
    if (t.dueDate === "Today") return true;
    if (t.dueDate === todayStr) return true;
    return false;
  });

  const upcomingTasks = tasks.filter((t) => {
    if (t.completed) return false;
    if (t.view === "upcoming") return true;
    if (t.dueDate === "Tomorrow") return true;
    if (t.dueDate && t.dueDate > todayStr) return true;
    return false;
  });

  const completedTasks = tasks.filter((t) => t.completed);

  // Sections only remain for inbox
  const rawInboxSections = sections.filter((s) => s.view === "inbox");
  const inboxSections =
    rawInboxSections.length > 0
      ? rawInboxSections.map((sec, idx) => ({
          ...sec,
          title:
            !sec.title || sec.title === "(No Section)" || sec.title === "To-Do"
              ? `Section ${idx + 1}`
              : sec.title,
        }))
      : [{ id: "inbox-default", title: "Section 1", view: "inbox" as const, order: 0 }];

  const renderTaskCard = (task: TaskItem, isOverdue = false) => (
    <div
      key={task.id}
      onClick={() => handleOpenTaskSidebar(task)}
      className="group flex cursor-pointer items-center justify-between rounded-xl border border-black/5 bg-white/90 px-4 py-3.5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] backdrop-blur-sm transition-all duration-200 hover:border-black/15 hover:bg-white hover:shadow-md"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        {/* Circular Priority Checkbox */}
        <button
          type="button"
          onClick={(e) => handleToggle(task.id, e)}
          className={`group/cb flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
            task.completed
              ? "bg-neutral-800 border-neutral-800 text-white"
              : task.priority === "p1" || task.priority === "high"
              ? "border-red-500 bg-red-500/10 hover:bg-red-500/20 text-red-500"
              : task.priority === "p2"
              ? "border-orange-500 bg-orange-500/10 hover:bg-orange-500/20 text-orange-500"
              : task.priority === "p3"
              ? "border-blue-500 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500"
              : "border-neutral-300 bg-transparent hover:border-neutral-400 text-neutral-400"
          }`}
        >
          {task.completed ? (
            <Check className="h-3.5 w-3.5 stroke-[3]" />
          ) : (
            <Check className="h-3.5 w-3.5 stroke-[3] opacity-0 group-hover/cb:opacity-100 transition-opacity" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-lg md:text-xl font-medium ${
              task.completed ? "text-neutral-400 line-through" : "text-neutral-800"
            }`}
          >
            {task.title}
          </div>

          {task.subtasks && task.subtasks.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-full border border-neutral-200">
                <ListChecks className="h-3.5 w-3.5" />
                <span>
                  {task.subtasks.filter((s) => s.completed).length}/{task.subtasks.length}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Side: Date & Time or subtle Set date prompt */}
      {task.dueDate ? (
        <div
          className={`ml-3 flex shrink-0 items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-full border ${
            isOverdue
              ? "bg-red-100/80 text-red-600 border-red-200/80"
              : "bg-neutral-100/90 text-neutral-600 border-neutral-200/70"
          }`}
        >
          {isOverdue ? (
            <Flag className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <Calendar className="h-3.5 w-3.5 text-neutral-500" />
          )}
          <span>
            {formatTaskDate(task.dueDate)}
            {task.dueTime ? ` · ${task.dueTime}` : ""}
          </span>
        </div>
      ) : (
        <div className="ml-3 flex shrink-0 items-center text-sm font-medium text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="flex items-center gap-1.5 hover:text-neutral-600">
            <Calendar className="h-3.5 w-3.5" />
            <span>Set date</span>
          </span>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-gradient-to-br from-neutral-100 via-neutral-50 to-neutral-200 p-4 pt-[120px] gap-4 text-neutral-900">
      {/* Inbox View: Sections as Columns consuming available space */}
      {activeView === "inbox" ? (
        <div className="flex min-h-0 w-full flex-1 items-stretch gap-4 overflow-x-auto overflow-y-hidden pb-2 no-scrollbar">
          <AnimatePresence mode="popLayout">
            {inboxSections.map((sec) => {
              const sectionTasks = tasks.filter(
                (t) =>
                  (t.sectionId === sec.id || (!t.sectionId && sec.id === inboxSections[0]?.id)) &&
                  !t.completed
              );
              const isEditingTitle = editingSectionId === sec.id;

              return (
                <motion.div
                  key={sec.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
                  transition={{
                    layout: { type: "spring", stiffness: 320, damping: 30 },
                    opacity: { duration: 0.2 },
                  }}
                  className="flex h-full min-h-0 min-w-[280px] flex-1 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl"
                >
                  <motion.div
                    layout="position"
                    className="flex-1 min-h-0 flex flex-col relative px-4 pt-4 pb-4 overflow-hidden"
                  >
                    {/* Section Heading */}
                    <motion.div layout="position" className="mb-3 flex items-center justify-between group/sec-title min-h-[44px]">
                      {isEditingTitle ? (
                        <input
                          autoFocus
                          value={editingTitleText}
                          onChange={(e) => setEditingTitleText(e.target.value)}
                          onBlur={() => handleSaveSectionTitle(sec.id)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveSectionTitle(sec.id);
                            if (e.key === "Escape") setEditingSectionId(null);
                          }}
                          className="text-4xl md:text-5xl font-bold tracking-tight text-neutral-900 bg-transparent border-b border-black/20 outline-none w-full"
                        />
                      ) : (
                        <motion.h2
                          layout="position"
                          onClick={() => {
                            setEditingSectionId(sec.id);
                            setEditingTitleText(sec.title);
                          }}
                          title="Click to rename"
                          className="text-4xl md:text-5xl font-bold tracking-tight leading-tight bg-gradient-to-b from-black to-neutral-500 bg-clip-text text-transparent cursor-pointer hover:opacity-80 transition-opacity truncate"
                        >
                          {sec.title}
                        </motion.h2>
                      )}

                      {inboxSections.length > 1 && !isEditingTitle && (
                        <button
                          type="button"
                          onClick={() => deleteSection(sec.id)}
                          title="Delete section"
                          className="opacity-0 group-hover/sec-title:opacity-100 text-neutral-400 hover:text-red-500 transition-opacity p-1.5 rounded-md hover:bg-black/5"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </motion.div>

                    {/* Tasks List */}
                    <motion.div layout="position" className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col gap-2.5 pr-0.5">
                      {sectionTasks.map((task) => renderTaskCard(task))}

                      {/* Add Button - Directly opens sidebar */}
                      <div className="pt-0.5">
                        <div
                          onClick={() => handleOpenAddSidebar(sec.id)}
                          className="flex items-center gap-3.5 py-2.5 px-3 rounded-lg cursor-pointer transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-black/5"
                        >
                          <div className="h-6 w-6 shrink-0 rounded-full border-2 border-neutral-300 opacity-40 pointer-events-none" />
                          <span className="text-xl font-medium">Add...</span>
                        </div>
                      </div>
                    </motion.div>
                  </motion.div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Vertical Add Section Button - Centered in middle on right */}
          <motion.div
            layout
            transition={{
              layout: { type: "spring", stiffness: 320, damping: 30 },
            }}
            className="flex h-56 w-14 shrink-0 self-center items-center justify-center"
          >
            <button
              type="button"
              onClick={handleAddSectionClick}
              title="Add section"
              className="group flex h-full w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-neutral-300/80 bg-white/40 p-2 text-neutral-500 shadow-sm transition-all duration-200 hover:border-neutral-400 hover:bg-white hover:text-neutral-900 hover:shadow-md"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200/80 text-neutral-600 transition-colors group-hover:bg-neutral-900 group-hover:text-white">
                <Plus className="h-4 w-4" />
              </div>
              <span className="text-xs font-semibold tracking-wider text-neutral-500 uppercase [writing-mode:vertical-lr] rotate-180 group-hover:text-neutral-900">
                Add Section
              </span>
            </button>
          </motion.div>
        </div>
      ) : activeView === "today" ? (
        /* Today View */
        <div className="flex h-full min-h-0 w-full flex-1">
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
            <div className="flex-1 min-h-0 flex flex-col relative px-6 pt-6 pb-6 overflow-hidden">
              {/* Header */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-black/5 pb-5 shrink-0">
                <div>
                  <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight bg-gradient-to-b from-black to-neutral-500 bg-clip-text text-transparent">
                    Today
                  </h2>
                  <p className="mt-1 text-base md:text-lg font-medium text-neutral-500">
                    {format(new Date(), "EEEE, MMMM d")}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {(todayTasks.length > 0 || overdueTasks.length > 0) && (
                    <span className="text-xs md:text-sm font-semibold px-3.5 py-1.5 rounded-full bg-neutral-200/80 text-neutral-700">
                      {todayTasks.length + overdueTasks.length}{" "}
                      {todayTasks.length + overdueTasks.length === 1 ? "task" : "tasks"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenAddSidebar()}
                    className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 transition-all active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Task</span>
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col pr-0.5">
                {overdueTasks.length === 0 && todayTasks.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-amber-500/10 border border-amber-500/20 shadow-xs mb-4 text-amber-500">
                      <Sun className="h-10 w-10" />
                    </div>
                    <h3 className="text-2xl font-bold text-neutral-800 tracking-tight">
                      All clear for today
                    </h3>
                    <p className="mt-1.5 max-w-sm text-base text-neutral-500 font-medium">
                      Enjoy your day, or schedule tasks to stay on top of your goals.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenAddSidebar()}
                      className="mt-6 flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-base font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 hover:border-neutral-400 transition-all active:scale-95"
                    >
                      <Plus className="h-4 w-4 text-neutral-500" />
                      <span>Add a task</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Overdue Section */}
                    {overdueTasks.length > 0 && (
                      <div>
                        <div className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-red-500 px-1">
                          <Flag className="h-3.5 w-3.5" />
                          <span>Overdue ({overdueTasks.length})</span>
                        </div>
                        <div className="space-y-2.5">
                          {overdueTasks.map((task) => renderTaskCard(task, true))}
                        </div>
                      </div>
                    )}

                    {/* Today Section */}
                    {todayTasks.length > 0 && (
                      <div>
                        {overdueTasks.length > 0 && (
                          <div className="mb-2.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-neutral-500 px-1">
                            <span>Today</span>
                          </div>
                        )}
                        <div className="space-y-2.5">
                          {todayTasks.map((task) => renderTaskCard(task))}
                        </div>
                      </div>
                    )}

                    {/* Inline Add Button */}
                    <div className="pt-1">
                      <div
                        onClick={() => handleOpenAddSidebar()}
                        className="flex items-center gap-3.5 py-2.5 px-3 rounded-xl cursor-pointer transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-black/5"
                      >
                        <div className="h-6 w-6 shrink-0 rounded-full border-2 border-neutral-300 opacity-40 pointer-events-none" />
                        <span className="text-lg md:text-xl font-medium">Add task...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : activeView === "upcoming" ? (
        /* Upcoming View */
        <div className="flex h-full min-h-0 w-full flex-1">
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
            <div className="flex-1 min-h-0 flex flex-col relative px-6 pt-6 pb-6 overflow-hidden">
              {/* Header */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-black/5 pb-5 shrink-0">
                <div>
                  <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight bg-gradient-to-b from-black to-neutral-500 bg-clip-text text-transparent">
                    Upcoming
                  </h2>
                  <p className="mt-1 text-base md:text-lg font-medium text-neutral-500">
                    Scheduled for future dates
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {upcomingTasks.length > 0 && (
                    <span className="text-xs md:text-sm font-semibold px-3.5 py-1.5 rounded-full bg-neutral-200/80 text-neutral-700">
                      {upcomingTasks.length}{" "}
                      {upcomingTasks.length === 1 ? "task" : "tasks"}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleOpenAddSidebar()}
                    className="flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 transition-all active:scale-95"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Add Task</span>
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col pr-0.5">
                {upcomingTasks.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-neutral-100 border border-black/5 shadow-xs mb-4 text-neutral-400">
                      <Calendar className="h-10 w-10 text-neutral-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-neutral-800 tracking-tight">
                      No upcoming tasks
                    </h3>
                    <p className="mt-1.5 max-w-sm text-base text-neutral-500 font-medium">
                      Schedule tasks with future dates to plan your days ahead.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleOpenAddSidebar()}
                      className="mt-6 flex items-center gap-2 rounded-full border border-neutral-300 bg-white px-5 py-2.5 text-base font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50 hover:border-neutral-400 transition-all active:scale-95"
                    >
                      <Plus className="h-4 w-4 text-neutral-500" />
                      <span>Schedule a task</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2.5">
                      {upcomingTasks.map((task) => renderTaskCard(task))}
                    </div>
                    <div className="pt-1">
                      <div
                        onClick={() => handleOpenAddSidebar()}
                        className="flex items-center gap-3.5 py-2.5 px-3 rounded-xl cursor-pointer transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-black/5"
                      >
                        <div className="h-6 w-6 shrink-0 rounded-full border-2 border-neutral-300 opacity-40 pointer-events-none" />
                        <span className="text-lg md:text-xl font-medium">Add task...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Completed View */
        <div className="flex h-full min-h-0 w-full flex-1">
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
            <div className="flex-1 min-h-0 flex flex-col relative px-6 pt-6 pb-6 overflow-hidden">
              {/* Header */}
              <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-black/5 pb-5 shrink-0">
                <div>
                  <h2 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight bg-gradient-to-b from-black to-neutral-500 bg-clip-text text-transparent">
                    Completed
                  </h2>
                  <p className="mt-1 text-base md:text-lg font-medium text-neutral-500">
                    Tasks you've accomplished
                  </p>
                </div>

                {completedTasks.length > 0 && (
                  <span className="text-xs md:text-sm font-semibold px-3.5 py-1.5 rounded-full bg-neutral-200/80 text-neutral-700">
                    {completedTasks.length}{" "}
                    {completedTasks.length === 1 ? "task" : "tasks"}
                  </span>
                )}
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col pr-0.5">
                {completedTasks.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center py-16 px-4 text-center">
                    <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-neutral-100 border border-black/5 shadow-xs mb-4 text-neutral-400">
                      <Check className="h-10 w-10 text-neutral-500" />
                    </div>
                    <h3 className="text-2xl font-bold text-neutral-800 tracking-tight">
                      No completed tasks yet
                    </h3>
                    <p className="mt-1.5 max-w-sm text-base text-neutral-500 font-medium">
                      Check off tasks in Inbox or Today to see them archived here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {completedTasks.map((task) => renderTaskCard(task))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Details / Creation Sidebar */}
      <TaskSidebar
        isOpen={isSidebarOpen}
        onClose={handleCloseSidebar}
        taskId={selectedTaskId}
        initialSectionId={creatingSectionId}
        initialView={activeView}
      />
    </div>
  );
}
