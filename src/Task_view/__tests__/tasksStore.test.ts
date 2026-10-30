import { describe, it, expect, beforeEach } from 'vitest'
import { useTasksStore } from '@/store/tasksStore'

describe('tasksStore', () => {
  beforeEach(() => {
    useTasksStore.setState({
      sections: [{ id: 'inbox-default', title: 'Section 1', view: 'inbox', order: 0 }],
      tasks: [],
      activeView: 'inbox',
      selectedTaskId: null,
      isSidebarOpen: false,
    })
  })

  it('adds a task optimistically to the store', () => {
    const id = useTasksStore.getState().addTask({
      title: 'Test Task',
      view: 'inbox',
      sectionId: 'inbox-default',
    })

    const tasks = useTasksStore.getState().tasks
    expect(tasks).toHaveLength(1)
    expect(tasks[0].id).toBe(id)
    expect(tasks[0].title).toBe('Test Task')
    expect(tasks[0].completed).toBe(false)
  })

  it('toggles task completion', () => {
    const id = useTasksStore.getState().addTask({
      title: 'Task to toggle',
      view: 'inbox',
    })

    useTasksStore.getState().toggleTask(id)
    expect(useTasksStore.getState().tasks.find((t) => t.id === id)?.completed).toBe(true)

    useTasksStore.getState().toggleTask(id)
    expect(useTasksStore.getState().tasks.find((t) => t.id === id)?.completed).toBe(false)
  })

  it('adds and updates section titles', () => {
    const newSectionId = useTasksStore.getState().addSection('inbox', 'Section 2')
    expect(useTasksStore.getState().sections).toHaveLength(2)
    expect(useTasksStore.getState().sections[1].id).toBe(newSectionId)
    expect(useTasksStore.getState().sections[1].title).toBe('Section 2')

    useTasksStore.getState().updateSectionTitle(newSectionId, 'Renamed Section')
    expect(useTasksStore.getState().sections[1].title).toBe('Renamed Section')
  })

  it('deletes a section and reassigns its tasks to fallback section', () => {
    const sec2Id = useTasksStore.getState().addSection('inbox', 'Section 2')
    const taskId = useTasksStore.getState().addTask({
      title: 'Task in sec 2',
      sectionId: sec2Id,
    })

    expect(useTasksStore.getState().tasks.find((t) => t.id === taskId)?.sectionId).toBe(sec2Id)

    useTasksStore.getState().deleteSection(sec2Id)
    expect(useTasksStore.getState().sections).toHaveLength(1)
    expect(useTasksStore.getState().tasks.find((t) => t.id === taskId)?.sectionId).toBe('inbox-default')
  })
})
