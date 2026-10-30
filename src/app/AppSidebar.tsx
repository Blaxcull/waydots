import { ChevronLeft } from 'lucide-react'
import SearchIcon from '@/assets/search.svg'
import { SideBar } from '@/SideBar/SideBar'
import { Button } from '@/components/ui/button'

export function SearchControlButton({
  onOpenSearch,
  inline = false,
}: {
  onOpenSearch: () => void
  inline?: boolean
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={onOpenSearch}
      className={
        inline
          ? "h-16 w-16 rounded-full border border-black/5 bg-[#e7e7e4] text-slate-600 shadow-sm transition-all duration-200 ease-out hover:scale-105 hover:text-slate-800 hover:shadow-md"
          : "pointer-events-auto fixed right-4 top-4 z-[20050] h-16 w-16 rounded-full border-[1px] bg-[#ececeb]/95 text-slate-600 shadow-lg backdrop-blur-sm transition-all duration-200 ease-out hover:scale-110 hover:text-slate-800 hover:shadow-xl"
      }
      aria-label="Search events"
    >
      <img src={SearchIcon} alt="Search" className="h-8 w-8 opacity-60" />
    </Button>
  )
}

export function DesktopSidebar() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <SideBar />
      </div>
    </div>
  )
}

interface CompactSidebarOverlayProps {
  isVisible: boolean
  onClose: () => void
}

export function CompactSidebarOverlay({ isVisible, onClose }: CompactSidebarOverlayProps) {
  return (
    <>
      <button
        type="button"
        aria-label="Close sidebar overlay"
        className={`fixed inset-0 z-[20000] bg-black/25 backdrop-blur-[2px] transition-opacity duration-300 ease-out ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={onClose}
      />
      <div
        className={`fixed inset-y-0 right-0 z-[20010] flex max-w-[calc(100vw-24px)] flex-col overflow-hidden pr-3 pt-3 pb-3 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          isVisible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-full overflow-hidden">
          <SideBar compact onRequestClose={onClose} />
        </div>
      </div>
    </>
  )
}

interface FloatingSidebarControlsProps {
  isHoverVisible: boolean
  onHoverVisibleChange: (visible: boolean) => void
  onOpenSidebar: () => void
  onOpenSearch: () => void
  showSidebarToggle?: boolean
}

export function FloatingSidebarControls({
  isHoverVisible,
  onHoverVisibleChange,
  onOpenSidebar,
  onOpenSearch,
  showSidebarToggle = true,
}: FloatingSidebarControlsProps) {
  return (
    <>
      <SearchControlButton onOpenSearch={onOpenSearch} />
      {showSidebarToggle && (
        <div
          className="fixed inset-y-0 right-0 z-[19990] hidden w-24 md:block"
          onMouseEnter={() => onHoverVisibleChange(true)}
          onMouseLeave={() => onHoverVisibleChange(false)}
        >
          <div
            className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 transition-all duration-200 ${
              isHoverVisible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0'
            }`}
          >
            <Button
              type="button"
              variant="secondary"
              onClick={onOpenSidebar}
              className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#cfcfcb] bg-[#f3f3f2]/95 text-[#404040] shadow-[0_14px_30px_rgba(0,0,0,0.16)] backdrop-blur-md transition-all duration-200 hover:translate-x-[-2px] hover:bg-white"
              aria-label="Open sidebar"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
