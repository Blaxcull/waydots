import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase, getSafeSession } from '@/lib/supabase'

export type TaskView = 'inbox' | 'today' | 'upcoming' | 'completed'

export interface SubtaskItem {
  id: string
  title: string
  completed: boolean
  dueDate?: string
}

export type TaskPriority = 'p1' | 'p2' | 'p3' | 'p4' | 'high' | 'medium' | 'low'

export interface TaskItem {
  id: string
  title: string
  sectionId: string
  view: TaskView
  dueDate?: string
  dueTime?: string
  completed: boolean
  priority?: TaskPriority
  notes?: string
  subtasks?: SubtaskItem[]
  linkedEmailId?: string
  linkedEmailSubject?: string
  linkedEventId?: string
  createdAt: string
}

export interface TaskSection {
  id: string
  title: string
  view: TaskView
  order: number
}

interface DbTaskSection {
  id: string
  user_id: string
  title: string
  view: string
  sort_order: number
}

interface DbTask {
  id: string
  user_id: string
  section_id: string | null
  title: string
  view: string
  due_date: string | null
  due_time?: string | null
  completed: boolean
  priority: string | null
  notes: string | null
  subtasks?: SubtaskItem[] | string | null
  linked_email_id: string | null
  linked_email_subject: string | null
  linked_event_id: string | null
  created_at: string
}

interface TasksState {
  sections: TaskSection[]
  tasks: TaskItem[]
  activeView: TaskView
  selectedTaskId: string | null
  isSidebarOpen: boolean
  isLoadingRemote: boolean
  hasLoadedRemote: boolean
  setActiveView: (view: TaskView) => void
  setSelectedTaskId: (id: string | null) => void
  setIsSidebarOpen: (open: boolean) => void
  fetchTasks: () => Promise<void>
  syncLocalToRemote: (userId: string) => Promise<void>
  addTask: (task: {
    title: string
    sectionId?: string
    view?: TaskView
    dueDate?: string
    dueTime?: string
    priority?: TaskPriority
    notes?: string
    subtasks?: SubtaskItem[]
  }) => string
  toggleTask: (id: string) => void
  updateTask: (id: string, updates: Partial<TaskItem>) => void
  deleteTask: (id: string) => void
  addSection: (view: TaskView, title?: string) => string
  updateSectionTitle: (id: string, title: string) => void
  deleteSection: (id: string) => void
}

const INITIAL_SECTIONS: TaskSection[] = [
  { id: 'inbox-default', title: 'Section 1', view: 'inbox', order: 0 },
]

const INITIAL_TASKS: TaskItem[] = [
  {
    id: 'task-1',
    title: 'k[koklmlml',
    sectionId: 'inbox-default',
    view: 'inbox',
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'task-2',
    title: 'iuoj',
    sectionId: 'inbox-default',
    view: 'inbox',
    completed: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'task-3',
    title: 'jjll',
    sectionId: 'inbox-default',
    view: 'inbox',
    dueDate: 'Today',
    completed: false,
    createdAt: new Date().toISOString(),
  },
]

const dbToSection = (row: DbTaskSection): TaskSection => ({
  id: row.id,
  title: row.title,
  view: (row.view as TaskView) || 'inbox',
  order: row.sort_order ?? 0,
})

const dbToTask = (row: DbTask): TaskItem => {
  let parsedSubtasks: SubtaskItem[] = []
  if (Array.isArray(row.subtasks)) {
    parsedSubtasks = row.subtasks as SubtaskItem[]
  } else if (typeof row.subtasks === 'string' && row.subtasks.trim()) {
    try {
      parsedSubtasks = JSON.parse(row.subtasks) as SubtaskItem[]
    } catch {
      parsedSubtasks = []
    }
  }

  return {
    id: row.id,
    title: row.title,
    sectionId: row.section_id || 'inbox-default',
    view: (row.view as TaskView) || 'inbox',
    dueDate: row.due_date || undefined,
    dueTime: row.due_time || undefined,
    completed: !!row.completed,
    priority: (row.priority as TaskPriority) || 'p4',
    notes: row.notes || '',
    subtasks: parsedSubtasks,
    linkedEmailId: row.linked_email_id || undefined,
    linkedEmailSubject: row.linked_email_subject || undefined,
    linkedEventId: row.linked_event_id || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  }
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => ({
      sections: INITIAL_SECTIONS,
      tasks: INITIAL_TASKS,
      activeView: 'inbox',
      selectedTaskId: null,
      isSidebarOpen: false,
      isLoadingRemote: false,
      hasLoadedRemote: false,

      setActiveView: (view) => set({ activeView: view }),

      setSelectedTaskId: (id) => set({ selectedTaskId: id, isSidebarOpen: id !== null }),

      setIsSidebarOpen: (open) => set({ isSidebarOpen: open, ...(open ? {} : { selectedTaskId: null }) }),

      fetchTasks: async () => {
        try {
          const { data: { session } } = await getSafeSession()
          const userId = session?.user?.id
          if (!userId) return

          set({ isLoadingRemote: true })

          const [sectionsRes, tasksRes] = await Promise.all([
            supabase
              .from('task_sections')
              .select('*')
              .eq('user_id', userId)
              .order('sort_order', { ascending: true }),
            supabase
              .from('tasks')
              .select('*')
              .eq('user_id', userId)
              .order('created_at', { ascending: true }),
          ])

          // If tables don't exist yet or query fails, keep existing localStorage data safely
          if (sectionsRes.error || tasksRes.error) {
            set({ isLoadingRemote: false })
            return
          }

          const remoteSections = (sectionsRes.data as DbTaskSection[] || []).map(dbToSection)
          const remoteTasks = (tasksRes.data as DbTask[] || []).map(dbToTask)

          // If remote is empty but local has items, seed the remote DB automatically
          const localSections = get().sections
          const localTasks = get().tasks
          if (
            remoteSections.length === 0 &&
            remoteTasks.length === 0 &&
            (localSections.length > 0 || localTasks.length > 0)
          ) {
            void get().syncLocalToRemote(userId)
            set({ isLoadingRemote: false, hasLoadedRemote: true })
            return
          }

          set({
            sections: remoteSections.length > 0 ? remoteSections : localSections,
            tasks: remoteTasks.length > 0 ? remoteTasks : localTasks,
            isLoadingRemote: false,
            hasLoadedRemote: true,
          })
        } catch {
          set({ isLoadingRemote: false })
        }
      },

      syncLocalToRemote: async (userId: string) => {
        try {
          const currentSections = get().sections
          const currentTasks = get().tasks

          if (currentSections.length > 0) {
            await supabase.from('task_sections').upsert(
              currentSections.map((s) => ({
                id: s.id,
                user_id: userId,
                title: s.title,
                view: s.view,
                sort_order: s.order,
              }))
            )
          }

          if (currentTasks.length > 0) {
            await supabase.from('tasks').upsert(
              currentTasks.map((t) => ({
                id: t.id,
                user_id: userId,
                section_id: t.sectionId || null,
                title: t.title,
                view: t.view,
                due_date: t.dueDate || null,
                due_time: t.dueTime || null,
                subtasks: t.subtasks || [],
                completed: t.completed,
                priority: t.priority || 'medium',
                notes: t.notes || '',
                linked_email_id: t.linkedEmailId || null,
                linked_email_subject: t.linkedEmailSubject || null,
                linked_event_id: t.linkedEventId || null,
                created_at: t.createdAt,
                updated_at: new Date().toISOString(),
              }))
            )
          }
        } catch {
          // Silently fail if DB table not yet created
        }
      },

      addTask: ({ title, sectionId, view, dueDate, dueTime, priority, notes, subtasks }) => {
        const currentView = view || get().activeView
        let targetSectionId = sectionId
        if (!targetSectionId) {
          const defaultSection = get().sections.find((s) => s.view === 'inbox')
          targetSectionId = defaultSection ? defaultSection.id : 'inbox-default'
        }

        const newTask: TaskItem = {
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          sectionId: targetSectionId,
          view: currentView,
          dueDate,
          dueTime,
          priority: priority || 'p4',
          notes: notes || '',
          subtasks: subtasks || [],
          completed: false,
          createdAt: new Date().toISOString(),
        }

        // Optimistic local update (instantly stored to localStorage via persist)
        set((state) => ({
          tasks: [...state.tasks, newTask],
        }))

        // Asynchronous Supabase sync
        void (async () => {
          try {
            const { data: { session } } = await getSafeSession()
            const userId = session?.user?.id
            if (!userId) return

            await supabase.from('tasks').upsert({
              id: newTask.id,
              user_id: userId,
              section_id: newTask.sectionId || null,
              title: newTask.title,
              view: newTask.view,
              due_date: newTask.dueDate || null,
              due_time: newTask.dueTime || null,
              subtasks: newTask.subtasks || [],
              completed: newTask.completed,
              priority: newTask.priority || 'p4',
              notes: newTask.notes || '',
              linked_email_id: newTask.linkedEmailId || null,
              linked_email_subject: newTask.linkedEmailSubject || null,
              linked_event_id: newTask.linkedEventId || null,
              created_at: newTask.createdAt,
              updated_at: new Date().toISOString(),
            })
          } catch {
            // Retain local copy if network/table error
          }
        })()

        return newTask.id
      },

      toggleTask: (id) => {
        // Optimistic local update
        let updatedTask: TaskItem | undefined
        set((state) => ({
          tasks: state.tasks.map((task) => {
            if (task.id === id) {
              updatedTask = { ...task, completed: !task.completed }
              return updatedTask
            }
            return task
          }),
        }))

        // Asynchronous Supabase sync
        void (async () => {
          try {
            const { data: { session } } = await getSafeSession()
            const userId = session?.user?.id
            if (!userId || !updatedTask) return

            await supabase
              .from('tasks')
              .update({
                completed: updatedTask.completed,
                updated_at: new Date().toISOString(),
              })
              .eq('id', id)
              .eq('user_id', userId)
          } catch {
            // Ignore if offline
          }
        })()
      },

      updateTask: (id, updates) => {
        // Optimistic local update
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, ...updates } : task
          ),
        }))

        // Asynchronous Supabase sync
        void (async () => {
          try {
            const { data: { session } } = await getSafeSession()
            const userId = session?.user?.id
            if (!userId) return

            const dbUpdates: Record<string, unknown> = {
              updated_at: new Date().toISOString(),
            }
            if (updates.title !== undefined) dbUpdates.title = updates.title
            if (updates.completed !== undefined) dbUpdates.completed = updates.completed
            if (updates.sectionId !== undefined) dbUpdates.section_id = updates.sectionId
            if (updates.view !== undefined) dbUpdates.view = updates.view
            if (updates.dueDate !== undefined) dbUpdates.due_date = updates.dueDate || null
            if (updates.dueTime !== undefined) dbUpdates.due_time = updates.dueTime || null
            if (updates.subtasks !== undefined) dbUpdates.subtasks = updates.subtasks || []
            if (updates.priority !== undefined) dbUpdates.priority = updates.priority
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes

            await supabase
              .from('tasks')
              .update(dbUpdates)
              .eq('id', id)
              .eq('user_id', userId)
          } catch {
            // Ignore if offline
          }
        })()
      },

      deleteTask: (id) => {
        // Optimistic local update
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
          selectedTaskId: state.selectedTaskId === id ? null : state.selectedTaskId,
          isSidebarOpen: state.selectedTaskId === id ? false : state.isSidebarOpen,
        }))

        // Asynchronous Supabase sync
        void (async () => {
          try {
            const { data: { session } } = await getSafeSession()
            const userId = session?.user?.id
            if (!userId) return

            await supabase
              .from('tasks')
              .delete()
              .eq('id', id)
              .eq('user_id', userId)
          } catch {
            // Ignore if offline
          }
        })()
      },

      addSection: (_view, title) => {
        const sectionsInView = get().sections.filter((s) => s.view === 'inbox')
        const newSectionNumber = sectionsInView.length + 1
        const sectionTitle = title || `Section ${newSectionNumber}`
        const newSection: TaskSection = {
          id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: sectionTitle,
          view: 'inbox',
          order: sectionsInView.length,
        }

        // Optimistic local update
        set((state) => ({
          sections: [...state.sections, newSection],
        }))

        // Asynchronous Supabase sync
        void (async () => {
          try {
            const { data: { session } } = await getSafeSession()
            const userId = session?.user?.id
            if (!userId) return

            await supabase.from('task_sections').upsert({
              id: newSection.id,
              user_id: userId,
              title: newSection.title,
              view: newSection.view,
              sort_order: newSection.order,
            })
          } catch {
            // Ignore if offline
          }
        })()

        return newSection.id
      },

      updateSectionTitle: (id, title) => {
        // Optimistic local update
        set((state) => ({
          sections: state.sections.map((sec) =>
            sec.id === id ? { ...sec, title } : sec
          ),
        }))

        // Asynchronous Supabase sync
        void (async () => {
          try {
            const { data: { session } } = await getSafeSession()
            const userId = session?.user?.id
            if (!userId) return

            await supabase
              .from('task_sections')
              .update({ title })
              .eq('id', id)
              .eq('user_id', userId)
          } catch {
            // Ignore if offline
          }
        })()
      },

      deleteSection: (id) => {
        const remainingInView = get().sections.filter((s) => s.view === 'inbox' && s.id !== id)
        const fallbackSectionId = remainingInView[0]?.id || 'inbox-default'

        // Optimistic local update
        set((state) => ({
          sections: state.sections.filter((s) => s.id !== id),
          tasks: state.tasks.map((t) => (t.sectionId === id ? { ...t, sectionId: fallbackSectionId } : t)),
        }))

        // Asynchronous Supabase sync
        void (async () => {
          try {
            const { data: { session } } = await getSafeSession()
            const userId = session?.user?.id
            if (!userId) return

            await supabase.from('task_sections').delete().eq('id', id).eq('user_id', userId)
            await supabase
              .from('tasks')
              .update({ section_id: fallbackSectionId })
              .eq('section_id', id)
              .eq('user_id', userId)
          } catch {
            // Ignore if offline
          }
        })()
      },
    }),
    {
      name: 'waydots-tasks-store',
    }
  )
)
