import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { startOfWeek, endOfWeek, addWeeks, addMonths, addYears, format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import GoalSidebar from "./GoalSidebar";
import { getGoalIcon, type Goal } from "./goal";
import { useGoalsStore } from "@/store/goalsStore";
import { useEventsStore } from "@/store/eventsStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import SearchIcon from "@/assets/search.svg";
import { MailTodoPill } from "@/components/MailTodoPill";
import type { ColumnType, DragState, SearchGoalResult, TodoItem, TodoStore } from "./goalView.types";
import { getBucketLabel, getColumnTypeFromBucketKey, getKey, parseBucketDate, slideVariants } from "./goalView.utils";
import { useSubscription } from "@/hooks/useSubscription";

interface GoalColumnProps {
  title: string;
  columnType: ColumnType;
  items: TodoItem[];
  direction: number;
  onToggle: (id: string) => void;
  onAdd: (text: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  showNav?: boolean;
  dragState: DragState | null;
  onDragStart: (itemId: string, sourceColumnType: ColumnType, initialDropTarget: DragState['dropTarget']) => void;
  onDragMove: (hoverColumnType: ColumnType | null, dropTarget: DragState['dropTarget']) => void;
  onDragEnd: (targetColumnType: ColumnType | null) => void;
  columnContainerRefs: React.MutableRefObject<Map<ColumnType, HTMLDivElement>>;
  columnItemRefs: React.MutableRefObject<Map<ColumnType, Map<string, HTMLElement>>>;
  columnItemHeights: React.MutableRefObject<Map<ColumnType, number>>;
  onGoalClick: (item: TodoItem) => void;
}

function GoalColumn({ title, columnType, items, direction, onToggle, onAdd, onPrev, onNext, onToday, showNav = true, dragState, onDragStart, onDragMove, onDragEnd, columnContainerRefs, columnItemRefs, columnItemHeights, onGoalClick }: GoalColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [isHovering, setIsHovering] = useState(false);
  const [isAreaHovering, setIsAreaHovering] = useState(false);
  const [listMaxHeight, setListMaxHeight] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const addRowRef = useRef<HTMLDivElement>(null);

  const isDragging = dragState !== null;
  const isDragSource = dragState?.sourceColumnType === columnType;
  const isDropTarget = dragState?.dropTarget?.columnType === columnType;
  const dropTarget = isDropTarget ? dragState!.dropTarget : null;
  const draggedItemId = dragState?.itemId ?? null;
  const itemHeight = columnItemHeights.current.get(columnType) || 44;
  const visibleItemCount = items.filter((item) => !(isDragSource && draggedItemId === item.id)).length;

  useEffect(() => {
    if (isAdding && inputRef.current) inputRef.current.focus();
  }, [isAdding]);

  useEffect(() => {
    const measureListMaxHeight = () => {
      const contentHeight = contentRef.current?.clientHeight ?? 0;
      const titleHeight = titleRef.current?.offsetHeight ?? 0;
      const addRowHeight = addRowRef.current?.offsetHeight ?? 0;

      if (contentHeight <= 0) {
        setListMaxHeight(null);
        return;
      }

      const bodyHeight = Math.max(0, contentHeight - titleHeight);
      const visibleStackLimit = bodyHeight * 0.8;
      const nextListMaxHeight = Math.max(
        itemHeight,
        Math.min(bodyHeight, Math.floor(visibleStackLimit - addRowHeight))
      );

      setListMaxHeight(nextListMaxHeight);
    };

    measureListMaxHeight();

    const observer = new ResizeObserver(measureListMaxHeight);
    if (contentRef.current) observer.observe(contentRef.current);
    if (titleRef.current) observer.observe(titleRef.current);
    if (addRowRef.current) observer.observe(addRowRef.current);

    return () => observer.disconnect();
  }, [isAdding, itemHeight, items.length]);

  const handleSubmit = () => {
    if (newText.trim()) onAdd(newText.trim());
    setNewText("");
    setIsAdding(false);
  };

  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => {
      if (newText.trim()) onAdd(newText.trim());
      setNewText("");
      setIsAdding(false);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
    if (e.key === "Escape") { setNewText(""); setIsAdding(false); }
  };

  const handleColumnBackgroundMouseDown = (e: React.MouseEvent) => {
    if (isDragging) return;
    e.preventDefault();
    clearTimeout(blurTimerRef.current);
    setIsAdding((prev) => !prev);
  };

  const getHoveredColumnType = (clientX: number, clientY: number): ColumnType | null => {
    const orderedColumnTypes: ColumnType[] = ["week", "month", "year", "life"];

    for (const candidate of orderedColumnTypes) {
      const el = columnContainerRefs.current.get(candidate);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return candidate;
      }
    }

    return null;
  };

  const getDropTarget = (clientY: number, excludeId: string, targetColumnType: ColumnType): DragState['dropTarget'] => {
    let closest: { itemId: string; position: 'before' | 'after'; distance: number } | null = null;
    const columnRefs = columnItemRefs.current.get(targetColumnType);

    if (!columnRefs) return null;

    columnRefs.forEach((el, itemId) => {
      if (itemId === excludeId) return;
      const rect = el.getBoundingClientRect();

      const midY = rect.top + rect.height / 2;
      const position: 'before' | 'after' = clientY < midY ? 'before' : 'after';
      const dist = position === 'before' ? Math.abs(clientY - rect.top) : Math.abs(rect.bottom - clientY);

      if (closest === null || dist < closest.distance) {
        closest = { itemId, position, distance: dist };
      }
    });

    if (!closest) return null;
    const c = closest as { itemId: string; position: 'before' | 'after'; distance: number };
    return { columnType: targetColumnType, itemId: c.itemId, position: c.position };
  };

  const handleMouseDown = (itemId: string, e: React.MouseEvent) => {
    const source = e.currentTarget as HTMLElement;
    const rect = source.getBoundingClientRect();

    const dragIndex = items.findIndex(i => i.id === itemId);
    let initialDropTarget: DragState['dropTarget'] = null;
    if (dragIndex < items.length - 1) {
      initialDropTarget = { columnType, itemId: items[dragIndex + 1].id, position: 'before' };
    } else if (dragIndex > 0) {
      initialDropTarget = { columnType, itemId: items[dragIndex - 1].id, position: 'after' };
    }

    const startX = e.clientX;
    const startY = e.clientY;
    let hasDragged = false;

    const ghost = source.cloneNode(true) as HTMLElement;
    const computed = getComputedStyle(source);
    ghost.style.cssText = "";
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      ghost.style.setProperty(prop, computed.getPropertyValue(prop));
    }
    ghost.style.position = "fixed";
    ghost.style.pointerEvents = "none";
    ghost.style.zIndex = "9999";
    ghost.style.transition = "none";
    ghost.style.left = rect.left + "px";
    ghost.style.top = rect.top + "px";
    ghost.style.width = rect.width + "px";
    ghost.style.height = rect.height + "px";
    ghost.style.margin = "0";
    ghost.style.opacity = "1";
    ghost.style.backgroundColor = "#f0f0f0";
    ghost.querySelectorAll("*").forEach(el => {
      (el as HTMLElement).style.opacity = "1";
    });

    const offsetX = e.clientX - rect.left;
    const offsetY = e.clientY - rect.top;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!hasDragged && Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return;
      if (!hasDragged) {
        hasDragged = true;
        document.body.appendChild(ghost);
        onDragStart(itemId, columnType, initialDropTarget);
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
        document.addEventListener("selectstart", preventSelect);
      }
      ghost.style.left = ev.clientX - offsetX + "px";
      ghost.style.top = ev.clientY - offsetY + "px";

      const hoverColumnType = getHoveredColumnType(ev.clientX, ev.clientY);
      if (hoverColumnType) {
        const target = getDropTarget(ev.clientY, itemId, hoverColumnType);
        onDragMove(hoverColumnType, target);
      } else {
        onDragMove(null, null);
      }
    };

    const handleMouseUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("selectstart", preventSelect);

      if (!hasDragged) {
        ghost.remove();
        const clickedItem = items.find(i => i.id === itemId);
        onGoalClick(clickedItem || { id: itemId, text: "", completed: false });
      } else {
        const toType = getHoveredColumnType(ev.clientX, ev.clientY);
        ghost.remove();
        onDragEnd(toType);
      }
    };

    const preventSelect = (e: Event) => e.preventDefault();
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
      <div
        ref={(el) => {
          if (el) {
            columnContainerRefs.current.set(columnType, el);
          } else {
            columnContainerRefs.current.delete(columnType);
          }
        }}
        className="flex flex-col flex-1 transition-all duration-200"
        data-column-type={columnType}
        onMouseEnter={() => {
          setIsHovering(true);
        }}
        onMouseLeave={() => {
          setIsHovering(false);
          setIsAreaHovering(false);
        }}
      >
      <div ref={contentRef} className="flex-1 min-h-0 flex flex-col relative px-2 pt-4 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={title}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col h-full"
          >
          <h2 ref={titleRef} className="text-5xl font-bold tracking-tight leading-tight bg-gradient-to-b from-black to-neutral-500 bg-clip-text text-transparent mb-3">
              {title}
            </h2>

            <div
              className="flex min-h-0 shrink-0 flex-col overflow-y-auto no-scrollbar"
              onMouseEnter={() => setIsAreaHovering(false)}
              style={listMaxHeight !== null ? { maxHeight: `${listMaxHeight}px` } : undefined}
            >
              {items.map((item) => {
                const isDraggedItem = draggedItemId === item.id;
                const showGapBefore = isDragging && dropTarget?.itemId === item.id && dropTarget?.position === 'before';
                const showGapAfter = isDragging && dropTarget?.itemId === item.id && dropTarget?.position === 'after';

                return (
                  <div key={item.id}>
                    <div
                      className="overflow-hidden"
                      style={{ height: showGapBefore ? itemHeight : 0 }}
                    />
                    <motion.div
                      data-goal-sidebar-trigger="true"
                      ref={(el) => {
                        if (el) {
                          if (!columnItemRefs.current.has(columnType)) {
                            columnItemRefs.current.set(columnType, new Map());
                          }
                          columnItemRefs.current.get(columnType)!.set(item.id, el);
                          columnItemHeights.current.set(columnType, el.offsetHeight || 44);
                        } else {
                          columnItemRefs.current.get(columnType)?.delete(item.id);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseEnter={() => setIsAreaHovering(false)}
                      onMouseDown={(isDragSource || !isDragging) ? (e) => {
                        e.stopPropagation();
                        handleMouseDown(item.id, e);
                      } : undefined}
                      style={{ cursor: "grab", display: isDraggedItem && isDragSource ? 'none' : undefined }}
                      className={`flex items-center gap-3 py-2 px-2 rounded-lg select-none ${!isDragging ? 'hover:bg-black/5' : ''} group transition-all duration-200`}
                    >
                      <input
                        type="checkbox"
                        checked={item.completed}
                        onChange={() => onToggle(item.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        className={`h-5 w-5 shrink-0 cursor-pointer transition-all duration-200 accent-black ${item.completed ? "opacity-30" : ""}`}
                      />
                      {item.icon ? (
                        (() => {
                          const iconConfig = getGoalIcon(item.icon);
                          const Icon = iconConfig?.icon;
                          return Icon ? <Icon className="h-5 w-5 shrink-0 text-slate-700" /> : null;
                        })()
                      ) : null}
                      <span className={`text-lg transition-all duration-200 ${item.completed ? "text-muted-foreground" : "text-foreground"}`}>
                        {item.text}
                      </span>
                    </motion.div>
                    <div
                      className="overflow-hidden"
                      style={{ height: showGapAfter ? itemHeight : 0 }}
                    />
                  </div>
                );
              })}


              {/* Do not change this placeholder behavior unless explicitly requested:
                  when a column becomes visually empty during drag, the empty slot must
                  match the goal row size exactly and only appear while the pointer is
                  over that column. */}
              {isDragging && visibleItemCount === 0 && (dragState?.hoverColumnType === columnType || isDragSource) && (
                <div
                  className="rounded-lg bg-white/45 transition-all duration-200"
                  style={{ height: itemHeight || 44 }}
                />
              )}
            </div>

            <div ref={addRowRef} className="pt-0.5">
              {isAdding ? (
                <div
                  className="flex items-center gap-3 pl-1 py-1.5 border border-black/20 rounded-lg shadow-sm focus-within:shadow-md transition-shadow"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (e.target === e.currentTarget) {
                      clearTimeout(blurTimerRef.current);
                      setIsAdding(false);
                    }
                  }}
                >
                  <input type="checkbox" disabled className="h-5 ml-1 w-5 opacity-30" />

                  <input
                    ref={inputRef}
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    className="bg-transparent border-none outline-none text-lg text-foreground w-full"
                    placeholder="Type here..."
                  />
                </div>
              ) : (
                <div
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isDragging) return;
                    setIsAdding(true);
                  }}
                  className={`flex items-center gap-2 py-2 px-2 rounded-lg cursor-pointer transition-all duration-200 ${isAreaHovering ? "text-foreground bg-black/5" : "text-muted-foreground hover:text-foreground hover:bg-black/5"}`}
                  
                >
                  <input
                    type="checkbox"
                    disabled
                    className="h-5 w-5 opacity-30 pointer-events-none"
                  />
                  <span className="text-lg">
                    Add...
                  </span>
                </div>
              )}
            </div>

            <div
              className="flex-1 min-h-0 cursor-pointer"
              onMouseDown={handleColumnBackgroundMouseDown}
              onMouseEnter={() => setIsAreaHovering(true)}
              onMouseLeave={() => setIsAreaHovering(false)}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {showNav && (
        <div className={`shrink-0 flex items-center justify-center gap-3 px-4 py-2.5 transition-opacity duration-200 ${isHovering ? "opacity-100" : "opacity-0"}`}>
          <button onClick={onPrev} className="h-9 w-9 flex items-center justify-center rounded-full bg-white shadow-sm border border-black/5 hover:shadow-md backdrop-blur-md transition-all duration-200 ease-out hover:scale-110 active:scale-90">
            <ChevronLeft className="h-5 w-5 text-[#404040]" />
          </button>
          <button onClick={onToday} className="px-5 py-2 rounded-full bg-white shadow-sm border border-black/5 hover:shadow-md backdrop-blur-md text-sm font-semibold text-[#404040] transition-all duration-200 ease-out hover:scale-105 active:scale-90">
            Today
          </button>
          <button onClick={onNext} className="h-9 w-9 flex items-center justify-center rounded-full bg-white shadow-sm border border-black/5 hover:shadow-md backdrop-blur-md transition-all duration-200 ease-out hover:scale-110 active:scale-90">
            <ChevronRight className="h-5 w-5 text-[#404040]" />
          </button>
        </div>
      )}
    </div>
  );
}

const GoalView = () => {
  const navigateTo = useNavigate();
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [yearDate, setYearDate] = useState(() => new Date());
  const [direction, setDirection] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarItemId, setSidebarItemId] = useState("");
  const [sidebarPrefillName, setSidebarPrefillName] = useState("");
  const [sidebarColumnType, setSidebarColumnType] = useState<ColumnType | null>(null);
  const [sidebarItemData, setSidebarItemData] = useState<{ notes?: string; color?: string; icon?: string; targetValue?: number; targetPeriod?: Goal["targetPeriod"]; status?: Goal["status"] }>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
  const store = useGoalsStore((state) => state.store) as TodoStore;
  const fetchAllGoals = useGoalsStore((state) => state.fetchAllGoals);
  const addGoal = useGoalsStore((state) => state.addGoal);
  const updateGoal = useGoalsStore((state) => state.updateGoal);
  const deleteGoal = useGoalsStore((state) => state.deleteGoal);
  const reorderGoals = useGoalsStore((state) => state.reorderGoals);
  const moveGoal = useGoalsStore((state) => state.moveGoal);
  
  const hasLoadedAllGoals = useGoalsStore((state) => state.hasLoadedAll);
  const syncGoalLinkedEvents = useEventsStore((state) => state.syncGoalLinkedEvents);
  const { isPro } = useSubscription(true);

  const columnContainerRefs = useRef<Map<ColumnType, HTMLDivElement>>(new Map());
  const columnItemRefs = useRef<Map<ColumnType, Map<string, HTMLElement>>>(new Map());
  const columnItemHeights = useRef<Map<ColumnType, number>>(new Map());
  const hasAttemptedLegacyMigrationRef = useRef(false);

  useEffect(() => {
    void fetchAllGoals();
  }, [fetchAllGoals]);

  useEffect(() => {
    const keys = Object.values(currentBucketKeys);
    void useGoalsStore.getState().fetchGoalBuckets(keys);
  }, [currentDate, yearDate]);

  useEffect(() => {
    if (!hasLoadedAllGoals || hasAttemptedLegacyMigrationRef.current) return;
    hasAttemptedLegacyMigrationRef.current = true;

    if (Object.keys(store).length > 0) return;

    try {
      const raw = localStorage.getItem("todo-store");
      if (!raw) return;
      const legacyStore = JSON.parse(raw) as TodoStore;
      if (!legacyStore || Object.keys(legacyStore).length === 0) return;

      // Migrate legacy store (one by one for safety)
      for (const [key, items] of Object.entries(legacyStore)) {
        items.forEach(item => {
          void addGoal(key, item.text);
        });
      }
      localStorage.removeItem("todo-store");
    } catch {
      // Ignore malformed local legacy data.
    }
  }, [hasLoadedAllGoals, store, addGoal]);

  const getDate = useCallback((type: ColumnType) => type === "year" ? yearDate : currentDate, [yearDate, currentDate]);

  const getItems = useCallback((type: ColumnType): TodoItem[] => {
    const key = getKey(type, getDate(type));
    return store[key] || [];
  }, [store, getDate]);

  const currentBucketKeys: Record<ColumnType, string> = {
    week: getKey("week", currentDate),
    month: getKey("month", currentDate),
    year: getKey("year", yearDate),
    life: "life",
  };

  const columnPriority: Record<ColumnType, number> = {
    week: 0,
    month: 1,
    year: 2,
    life: 3,
  };

  const searchableGoals: SearchGoalResult[] = Object.entries(store).flatMap(([bucketKey, items]) => {
    const columnType = getColumnTypeFromBucketKey(bucketKey) as ColumnType | null;
    if (!columnType) return [];

    return items.map((item) => ({
      id: item.id,
      text: item.text,
      notes: item.notes ?? "",
      color: item.color,
      icon: item.icon,
      targetValue: item.targetValue,
      targetPeriod: item.targetPeriod,
      status: item.status,
      completed: item.completed,
      columnType,
      bucketKey,
      bucketLabel: getBucketLabel(columnType, bucketKey),
    }));
  });

  const filteredGoals = (() => {
    const baseResults = searchableGoals
      .map((item) => ({
        ...item,
        textRank: 999,
        isCurrentBucket: item.bucketKey === currentBucketKeys[item.columnType] ? 0 : 1,
      }))
      .sort((a, b) =>
        a.isCurrentBucket - b.isCurrentBucket ||
        columnPriority[a.columnType] - columnPriority[b.columnType] ||
        a.text.localeCompare(b.text)
      );

    const query = searchQuery.trim().toLowerCase();
    if (!query) return baseResults.slice(0, 3);

    const matched = searchableGoals
      .map((item) => {
        const statusLabel = (item.completed ? "completed" : item.status || "active").toLowerCase();
        const columnLabel = item.columnType.toLowerCase();
        const bucketLabel = item.bucketLabel.toLowerCase();

        let textRank = -1;
        if (item.text.toLowerCase() === query) textRank = 0;
        else if (item.text.toLowerCase().startsWith(query)) textRank = 1;
        else if (item.text.toLowerCase().includes(query)) textRank = 2;
        else if (item.notes.toLowerCase().includes(query)) textRank = 3;
        else if (columnLabel === query) textRank = 4;
        else if (columnLabel.includes(query)) textRank = 5;
        else if (bucketLabel.includes(query)) textRank = 6;
        else if (statusLabel === query) textRank = 7;
        else if (statusLabel.includes(query)) textRank = 8;

        return {
          ...item,
          textRank,
          isCurrentBucket: item.bucketKey === currentBucketKeys[item.columnType] ? 0 : 1,
        };
      })
      .filter((item) => item.textRank !== -1)
      .sort((a, b) =>
        a.isCurrentBucket - b.isCurrentBucket ||
        columnPriority[a.columnType] - columnPriority[b.columnType] ||
        a.textRank - b.textRank ||
        a.text.localeCompare(b.text)
      )
      .slice(0, 3);

    if (matched.length >= 3) return matched;

    const usedIds = new Set(matched.map((item) => item.id));
    const filler = baseResults.filter((item) => !usedIds.has(item.id)).slice(0, 3 - matched.length);
    return [...matched, ...filler];
  })();

  const openSearchResult = (goal: SearchGoalResult) => {
    const bucketDate = parseBucketDate(goal.bucketKey);

    if ((goal.columnType === "week" || goal.columnType === "month") && bucketDate) {
      setCurrentDate(bucketDate);
    }
    if (goal.columnType === "year" && bucketDate) {
      setYearDate(bucketDate);
    }

    setSidebarItemId(goal.id);
    setSidebarPrefillName(goal.text);
    setSidebarColumnType(goal.columnType);
    setSidebarItemData({
      notes: goal.notes,
      color: goal.color,
      icon: goal.icon,
      targetValue: goal.targetValue,
      targetPeriod: goal.targetPeriod,
      status: goal.status,
    });
    setSidebarOpen(true);
    setSearchOpen(false);
  };

  const handleAddItem = (type: ColumnType, text: string) => {
    const key = getKey(type, getDate(type));
    const items = store[key] || [];

    if (!isPro && type !== "life" && items.length >= 3) {
      navigateTo({ pathname: "/", hash: "#pricing" });
      return;
    }

    void addGoal(key, text);
  };

  const handleToggleItem = (type: ColumnType, id: string) => {
    const key = getKey(type, getDate(type));
    const item = (store[key] || []).find(i => i.id === id);
    if (item) {
      const newCompleted = !item.completed;
      void updateGoal(key, id, { 
        completed: newCompleted,
        status: newCompleted ? "completed" : "active"
      });
    }
  };

  const handleSidebarSave = (data: { text: string; notes: string; color: string; icon: string; targetValue: number; targetPeriod: Goal["targetPeriod"]; status: Goal["status"] }) => {
    if (!sidebarItemId || !sidebarColumnType) return;
    const key = getKey(sidebarColumnType, getDate(sidebarColumnType));
    const items = store[key] || [];
    const previousItem = items.find((item) => item.id === sidebarItemId);
    
    void updateGoal(key, sidebarItemId, { 
      text: data.text, 
      notes: data.notes, 
      color: data.color, 
      icon: data.icon, 
      targetValue: data.targetValue, 
      targetPeriod: data.targetPeriod, 
      status: data.status,
      completed: data.status === "completed"
    });

    if (
      previousItem &&
      (
        previousItem.text !== data.text ||
        (previousItem.color || "") !== data.color ||
        (previousItem.icon || "") !== data.icon
      )
    ) {
      void syncGoalLinkedEvents({
        columnType: sidebarColumnType,
        bucketKey: key,
        previousGoalText: previousItem.text,
        nextGoalText: data.text,
        color: data.color,
        icon: data.icon,
      });
    }

    setSidebarOpen(false);
  };

  useEffect(() => {
    if (!sidebarOpen || !sidebarItemId || !sidebarColumnType) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      
      const key = getKey(sidebarColumnType, getDate(sidebarColumnType));
      void deleteGoal(key, sidebarItemId);
      setSidebarOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen, sidebarItemId, sidebarColumnType, getDate, deleteGoal]);

  const handleMoveItem = (fromType: ColumnType, toType: ColumnType, itemId: string, dropTarget?: DragState['dropTarget']) => {
    const fromKey = getKey(fromType, getDate(fromType));
    const toKey = getKey(toType, getDate(toType));
    
    if (fromKey === toKey) return;

    let targetIndex: number | undefined;
    if (dropTarget && dropTarget.columnType === toType) {
      const toItems = store[toKey] || [];
      targetIndex = toItems.findIndex(i => i.id === dropTarget.itemId);
      if (targetIndex !== -1 && dropTarget.position === 'after') {
        targetIndex += 1;
      }
    }

    void moveGoal(fromKey, toKey, itemId, targetIndex);
  };

  const handleReorderItems = (colType: ColumnType, itemId: string, targetItemId: string, position: 'before' | 'after') => {
    const key = getKey(colType, getDate(colType));
    const items = [...(store[key] || [])];
    const draggedIndex = items.findIndex(i => i.id === itemId);
    const targetIndex = items.findIndex(i => i.id === targetItemId);
    if (draggedIndex === -1 || targetIndex === -1 || itemId === targetItemId) return;

    const [item] = items.splice(draggedIndex, 1);
    let insertAt = items.findIndex(i => i.id === targetItemId);
    if (position === 'after') insertAt += 1;
    items.splice(insertAt, 0, item);

    void reorderGoals(key, items.map(i => i.id));
  };

  const dragStateRef = useRef<DragState | null>(null);

  const handleDragStart = (itemId: string, sourceColumnType: ColumnType, initialDropTarget: DragState['dropTarget']) => {
    const state: DragState = { itemId, sourceColumnType, hoverColumnType: sourceColumnType, dropTarget: initialDropTarget };
    dragStateRef.current = state;
    setSidebarOpen(false);
    setDragState(state);
  };

  const handleDragMove = (hoverColumnType: ColumnType | null, dropTarget: DragState['dropTarget']) => {
    setDragState(prev => {
      const next = prev ? { ...prev, hoverColumnType, dropTarget } : null;
      dragStateRef.current = next;
      return next;
    });
  };

  const handleDragEnd = (targetColumnType: ColumnType | null) => {
    const current = dragStateRef.current;
    if (current) {
      if (targetColumnType && targetColumnType !== current.sourceColumnType) {
        handleMoveItem(current.sourceColumnType, targetColumnType, current.itemId, current.dropTarget);
      } else if (current.dropTarget) {
        handleReorderItems(current.dropTarget.columnType, current.itemId, current.dropTarget.itemId, current.dropTarget.position);
      }
    }
    dragStateRef.current = null;
    setDragState(null);
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const weekLabel = `${format(weekStart, "d")}–${format(weekEnd, "d MMM")}`;
  const monthLabel = format(currentDate, "MMMM");
  const yearLabel = format(yearDate, "yyyy");

  const goToToday = () => { setDirection(1); setCurrentDate(new Date()); setYearDate(new Date()); };

  const navigate = (fn: (d: Date) => Date, dir: number) => {
    setDirection(dir);
    setCurrentDate(fn);
  };

  const navigateYear = (fn: (d: Date) => Date, dir: number) => {
    setDirection(dir);
    setYearDate(fn);
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-gradient-to-br from-neutral-100 via-neutral-50 to-neutral-200 p-2 sm:p-4 pt-16 sm:pt-[120px] pb-24 sm:pb-4 gap-4">
      <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-50 flex items-center gap-2 sm:gap-3">
        <MailTodoPill />
        <Button
          type="button"
          variant="ghost"
          onClick={() => setSearchOpen(true)}
          className="h-11 w-11 sm:h-16 sm:w-16 rounded-full border-[1px] shadow-md sm:shadow-lg text-slate-600 transition-all duration-200 ease-out hover:scale-110 hover:shadow-xl hover:text-slate-800 bg-[#ececeb]/95 backdrop-blur-sm p-0 flex items-center justify-center"
          aria-label="Open goal search"
        >
          <img src={SearchIcon} alt="Search" className="h-5 w-5 sm:h-8 sm:w-8 opacity-60" />
        </Button>
      </div>
      <div className="flex min-h-0 w-full flex-col gap-4">
        <div className="grid min-h-0 flex-1 w-full grid-flow-col auto-cols-[minmax(280px,calc(100vw-2rem))] gap-4 overflow-x-auto overflow-y-hidden no-scrollbar md:auto-cols-[minmax(320px,calc((100vw-3rem)/2))] xl:grid-flow-row xl:grid-cols-4 xl:auto-cols-auto xl:overflow-hidden">
      <div data-column-type="week" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
        <GoalColumn title={weekLabel} columnType="week" items={getItems("week")} direction={direction} onToggle={(id) => handleToggleItem("week", id)} onAdd={(text) => handleAddItem("week", text)} onPrev={() => navigate(d => addWeeks(d, -1), -1)} onNext={() => navigate(d => addWeeks(d, 1), 1)} onToday={goToToday} dragState={dragState} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} columnContainerRefs={columnContainerRefs} columnItemRefs={columnItemRefs} columnItemHeights={columnItemHeights} onGoalClick={(item) => { setSidebarItemId(item.id); setSidebarPrefillName(item.text); setSidebarColumnType("week"); setSidebarItemData({ notes: item.notes, color: item.color, icon: item.icon, targetValue: item.targetValue, targetPeriod: item.targetPeriod, status: item.status }); setSidebarOpen(true); }} />
      </div>
      <div data-column-type="month" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
        <GoalColumn title={monthLabel} columnType="month" items={getItems("month")} direction={direction} onToggle={(id) => handleToggleItem("month", id)} onAdd={(text) => handleAddItem("month", text)} onPrev={() => navigate(d => addMonths(d, -1), -1)} onNext={() => navigate(d => addMonths(d, 1), 1)} onToday={goToToday} dragState={dragState} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} columnContainerRefs={columnContainerRefs} columnItemRefs={columnItemRefs} columnItemHeights={columnItemHeights} onGoalClick={(item) => { setSidebarItemId(item.id); setSidebarPrefillName(item.text); setSidebarColumnType("month"); setSidebarItemData({ notes: item.notes, color: item.color, icon: item.icon, targetValue: item.targetValue, targetPeriod: item.targetPeriod, status: item.status }); setSidebarOpen(true); }} />
      </div>
      <div data-column-type="year" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
        <GoalColumn title={yearLabel} columnType="year" items={getItems("year")} direction={direction} onToggle={(id) => handleToggleItem("year", id)} onAdd={(text) => handleAddItem("year", text)} onPrev={() => navigateYear(d => addYears(d, -1), -1)} onNext={() => navigateYear(d => addYears(d, 1), 1)} onToday={goToToday} dragState={dragState} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} columnContainerRefs={columnContainerRefs} columnItemRefs={columnItemRefs} columnItemHeights={columnItemHeights} onGoalClick={(item) => { setSidebarItemId(item.id); setSidebarPrefillName(item.text); setSidebarColumnType("year"); setSidebarItemData({ notes: item.notes, color: item.color, icon: item.icon, targetValue: item.targetValue, targetPeriod: item.targetPeriod, status: item.status }); setSidebarOpen(true); }} />
      </div>
      <div data-column-type="life" className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-black/5 bg-white/60 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur-xl">
        <GoalColumn title="Life" columnType="life" items={getItems("life")} direction={direction} onToggle={(id) => handleToggleItem("life", id)} onAdd={(text) => handleAddItem("life", text)} onPrev={() => {}} onNext={() => {}} onToday={goToToday} dragState={dragState} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} columnContainerRefs={columnContainerRefs} columnItemRefs={columnItemRefs} columnItemHeights={columnItemHeights} showNav={false} onGoalClick={(item) => { setSidebarItemId(item.id); setSidebarPrefillName(item.text); setSidebarColumnType("life"); setSidebarItemData({ notes: item.notes, color: item.color, icon: item.icon, targetValue: item.targetValue, targetPeriod: item.targetPeriod, status: item.status }); setSidebarOpen(true); }} />
      </div>
        </div>
      </div>
      <GoalSidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} prefillName={sidebarPrefillName} prefillNotes={sidebarItemData.notes} prefillColor={sidebarItemData.color} prefillIcon={sidebarItemData.icon} prefillTargetValue={sidebarItemData.targetValue} prefillTargetPeriod={sidebarItemData.targetPeriod} prefillStatus={sidebarItemData.status} columnType={sidebarColumnType} isPro={isPro} onSave={handleSidebarSave} onClearPrefill={() => { setSidebarItemId(""); setSidebarPrefillName(""); setSidebarColumnType(null); setSidebarItemData({}); }} />
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="w-[min(680px,92vw)] overflow-hidden rounded-[28px] border border-gray-200 bg-neutral-100 p-0 shadow-[0_24px_70px_rgba(0,0,0,0.14)]">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="flex items-center gap-3 rounded-[24px] border border-gray-200 bg-[#e7e7e6] px-4 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#dddddc]">
                <img src={SearchIcon} alt="" className="h-5 w-5 opacity-60" />
              </div>
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filteredGoals.length > 0) {
                    e.preventDefault();
                    openSearchResult(filteredGoals[0]);
                  }
                }}
                placeholder="Search Goals"
                className="w-full bg-transparent text-2xl font-semibold text-neutral-700 outline-none placeholder:text-neutral-400"
              />
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto no-scrollbar px-3 py-3">
            {filteredGoals.length > 0 ? (
              <div className="space-y-2">
                {filteredGoals.map((goal) => (
                  (() => {
                    const showBucketLabel = goal.columnType !== "life";
                    return (
                  <button
                    key={`${goal.bucketKey}-${goal.id}`}
                    type="button"
                    onClick={() => openSearchResult(goal)}
                    className="group flex w-full items-start justify-between rounded-[24px] border border-transparent bg-[#ececeb] px-4 py-3 text-left transition-all duration-200 hover:border-gray-200 hover:bg-[#f3f3f2]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[17px] font-semibold text-neutral-800">{goal.text}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium text-neutral-500">
                        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-500">
                          {goal.columnType}
                        </span>
                        {showBucketLabel ? (
                          <span className="rounded-full bg-white px-2.5 py-1">
                            {goal.bucketLabel}
                          </span>
                        ) : null}
                        <span className="rounded-full bg-white px-2.5 py-1">
                          {goal.completed ? "completed" : goal.status || "active"}
                        </span>
                      </div>
                    </div>
                    <div className="ml-4 flex h-10 w-10 shrink-0 items-center justify-center self-center rounded-full bg-white text-xl font-semibold leading-none text-neutral-300 transition-colors duration-200 group-hover:text-neutral-500">
                      &gt;
                    </div>
                  </button>
                    )
                  })()
                ))}
              </div>
            ) : (
              <div className="flex min-h-[180px] items-center justify-center rounded-[24px] border border-dashed border-gray-200 bg-[#ececeb] text-center">
                <div>
                  <p className="text-base font-semibold text-neutral-500">No matching goals</p>
                  <p className="mt-1 text-sm text-neutral-400">Try a goal title or note.</p>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default GoalView
