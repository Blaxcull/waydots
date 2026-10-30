import { useCallback, useEffect, useState } from 'react'
import { startReminderService, stopReminderService } from '@/services/reminderService'
import type { ViewType } from '@/components/ViewSwitcher'
import { useEventsStore } from '@/store/eventsStore'
import { useSubscription, type SubscriptionPlan, type SubscriptionStatus } from '@/hooks/useSubscription'
import { useAuthStore } from '@/store/authStore'

interface UseAppShellResult {
  currentView: ViewType
  setCurrentView: (view: ViewType) => void
  isAuthLoading: boolean
  isAuthenticated: boolean
  subscriptionPlan: SubscriptionPlan
  subscriptionStatus: SubscriptionStatus
  isPro: boolean
  isSubscriptionLoading: boolean
  isCompactSidebar: boolean
  isSearchOpen: boolean
  isSidebarMounted: boolean
  isSidebarVisible: boolean
  isSidebarHoverVisible: boolean
  showAppSidebar: boolean
  showFloatingSidebarButton: boolean
  closeCompactSidebarAndClearSelection: () => void
  openCompactSidebar: () => void
  setIsSearchOpen: (open: boolean) => void
  setIsSidebarHoverVisible: (visible: boolean) => void
}

export function useAppShell(isAuthPage: boolean, isSidebarlessPage: boolean): UseAppShellResult {
  const [currentView, setCurrentView] = useState<ViewType>('day')
  const { isAuthenticated, isAuthLoading } = useAuthStore()
  const [isCompactSidebar, setIsCompactSidebar] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSidebarMounted, setIsSidebarMounted] = useState(false)
  const [isSidebarVisible, setIsSidebarVisible] = useState(false)
  const [isSidebarHoverVisible, setIsSidebarHoverVisible] = useState(false)
  const selectedEventId = useEventsStore((state) => state.selectedEventId)
  const setSelectedEvent = useEventsStore((state) => state.setSelectedEvent)

  const showAppSidebar = !isAuthPage && !isSidebarlessPage && isAuthenticated
  const showFloatingSidebarButton = showAppSidebar && isCompactSidebar && !isSidebarOpen

  const closeCompactSidebarAndClearSelection = useCallback(() => {
    setIsSidebarOpen(false)
    setSelectedEvent(null)
  }, [setSelectedEvent])

  const openCompactSidebar = useCallback(() => {
    setIsSidebarOpen(true)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(max-width: 1360px)')
    const applySidebarMode = (matches: boolean) => {
      setIsCompactSidebar(matches)
      setIsSidebarOpen(!matches)
    }

    applySidebarMode(mediaQuery.matches)

    const handleChange = (event: MediaQueryListEvent) => applySidebarMode(event.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!isCompactSidebar || !isSidebarOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSidebarOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCompactSidebar, isSidebarOpen])

  useEffect(() => {
    if (!isAuthenticated || isAuthPage || isSidebarlessPage || !isCompactSidebar) return
    if (!selectedEventId) return
    setIsSidebarOpen(true)
  }, [isAuthenticated, isAuthPage, isSidebarlessPage, isCompactSidebar, selectedEventId])

  useEffect(() => {
    if (typeof window === 'undefined') return

    if (!showAppSidebar || !isCompactSidebar) {
      setIsSidebarMounted(false)
      setIsSidebarVisible(false)
      return
    }

    if (isSidebarOpen) {
      setIsSidebarVisible(false)
      setIsSidebarMounted(true)
      let secondFrameId = 0
      const firstFrameId = window.requestAnimationFrame(() => {
        secondFrameId = window.requestAnimationFrame(() => {
          setIsSidebarVisible(true)
        })
      })

      return () => {
        window.cancelAnimationFrame(firstFrameId)
        if (secondFrameId) window.cancelAnimationFrame(secondFrameId)
      }
    }

    setIsSidebarVisible(false)

    const timeoutId = window.setTimeout(() => {
      setIsSidebarMounted(false)
    }, 260)

    return () => window.clearTimeout(timeoutId)
  }, [isCompactSidebar, isSidebarOpen, showAppSidebar])

  useEffect(() => {
    if (!showFloatingSidebarButton) {
      setIsSidebarHoverVisible(false)
    }
  }, [showFloatingSidebarButton])

  useEffect(() => {
    startReminderService()
    return () => stopReminderService()
  }, [])

  const subscription = useSubscription(isAuthenticated)

  return {
    currentView,
    setCurrentView,
    isAuthLoading,
    isAuthenticated,
    subscriptionPlan: subscription.plan,
    subscriptionStatus: subscription.status,
    isPro: subscription.isPro,
    isSubscriptionLoading: subscription.isLoading,
    isCompactSidebar,
    isSearchOpen,
    isSidebarMounted,
    isSidebarVisible,
    isSidebarHoverVisible,
    showAppSidebar,
    showFloatingSidebarButton,
    closeCompactSidebarAndClearSelection,
    openCompactSidebar,
    setIsSearchOpen,
    setIsSidebarHoverVisible,
  }
}
