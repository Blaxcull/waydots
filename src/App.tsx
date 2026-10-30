import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { SearchEventsDialog } from '@/SideBar/SearchEventsDialog'
import { SearchMailDialog } from '@/Mail_view/SearchMailDialog'
import { AppRoutes } from '@/app/AppRoutes'
import { CompactSidebarOverlay, DesktopSidebar, FloatingSidebarControls } from '@/app/AppSidebar'
import { useAppShell } from '@/app/useAppShell'
import TimeUpdater from '@/components/TimeUpdater'
import { TopBarLeft } from '@/components/TopBarLeft'
import { ViewSwitcher } from '@/components/ViewSwitcher'
import { useAuthStore } from '@/store/authStore'
import { useTasksStore } from '@/store/tasksStore'

function App() {
  const initializeAuth = useAuthStore((state) => state.initialize)

  useEffect(() => {
    void initializeAuth()
  }, [initializeAuth])

  const location = useLocation()
  const isAuthPage = location.pathname === '/login' || location.pathname === '/signup' || location.pathname === '/reset-password'
  const isGoalView = location.pathname === '/goals'
  const isAnalysisView = location.pathname === '/analysis'
  const isMailView = location.pathname === '/mail'
  const isTodoView = location.pathname === '/todos'
  const isHomePage = location.pathname === '/'
  const isCheckoutPage = location.pathname === '/checkout'
  const isShellHiddenPage = isAuthPage || isHomePage || isCheckoutPage
  const isSidebarlessPage = isGoalView || isAnalysisView || isMailView || isTodoView
  const isTaskSidebarOpen = useTasksStore((state) => state.isSidebarOpen)
  const {
    currentView,
    setCurrentView,
    isAuthLoading,
    isAuthenticated,
    subscriptionPlan,
    subscriptionStatus,
    isPro,
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
  } = useAppShell(isShellHiddenPage, isSidebarlessPage)

  if (isAuthLoading) {
    return <div className="h-screen w-screen bg-[#f3f3f2]" />
  }

  return (
    <>
      <TimeUpdater />
      {!isShellHiddenPage && isAuthenticated && <ViewSwitcher currentView={currentView} onViewChange={setCurrentView} />}
      {!isShellHiddenPage && isAuthenticated && <TopBarLeft />}
      <div className={`flex h-screen overflow-hidden relative ${isShellHiddenPage ? '' : ''}`}>
        <div className={`flex-1 ${isShellHiddenPage || isSidebarlessPage ? 'w-full overflow-y-auto no-scrollbar' : 'overflow-hidden'}`}>
          <AppRoutes
            isAuthenticated={isAuthenticated}
            subscriptionPlan={subscriptionPlan}
            subscriptionStatus={subscriptionStatus}
            isPro={isPro}
          />
        </div>

        {showAppSidebar && !isCompactSidebar && <DesktopSidebar />}
      </div>

      {showAppSidebar && isCompactSidebar && isSidebarMounted && (
        <CompactSidebarOverlay
          isVisible={isSidebarVisible}
          onClose={closeCompactSidebarAndClearSelection}
        />
      )}

      {(showFloatingSidebarButton || isAnalysisView || isMailView || (isTodoView && !isTaskSidebarOpen)) && (
        <FloatingSidebarControls
          isHoverVisible={isSidebarHoverVisible}
          onHoverVisibleChange={setIsSidebarHoverVisible}
          onOpenSidebar={openCompactSidebar}
          onOpenSearch={() => setIsSearchOpen(true)}
          showSidebarToggle={!isSidebarlessPage}
        />
      )}

      {isMailView ? (
        <SearchMailDialog open={isSearchOpen} onOpenChange={setIsSearchOpen} />
      ) : (
        <SearchEventsDialog open={isSearchOpen} onOpenChange={setIsSearchOpen} />
      )}
    </>
  )
}

export default App
