import ChevronLeftIcon from '@/assets/chevron-left.svg'
import SearchIcon from '@/assets/search.svg'
import { Button } from '@/components/ui/button'
import { CardContent } from '@/components/ui/card'
import { Calendar } from '@/components/ui/sidebarCalendar'

interface SidebarHeaderProps {
  compact: boolean
  selectedDate: Date | null
  onSelectDate: (date: Date | undefined) => void
  onOpenSearch: () => void
  onPrevious: () => void
  onToday: () => void
  onNext: () => void
}

export default function SidebarHeader({
  compact,
  selectedDate,
  onSelectDate,
  onOpenSearch,
  onPrevious,
  onToday,
  onNext,
}: SidebarHeaderProps) {
  const containerPadding = compact ? 'px-5 pt-24 pb-7' : 'px-30 pt-24 pb-9'
  const layoutClass = compact
    ? 'flex items-start gap-4'
    : 'flex items-start gap-3'
  const calendarShellClass = compact
    ? 'flex items-start justify-start pt-2'
    : 'w-[135px] flex items-start justify-center pt-6'
  const controlsShellClass = compact
    ? 'flex flex-1 items-start justify-start pt-2'
    : 'flex flex-1 justify-start pt-8 pl-35'

  return (
    <>
      <Button
        variant="ghost"
        onClick={onOpenSearch}
        className="absolute top-4 right-4 z-10
shadow-lg text-slate-600
border-[1px]
hover:text-slate-800 
rounded-full h-16 w-16
transition-all duration-200 ease-out
hover:scale-110 hover:shadow-xl"
      >
        <img src={SearchIcon} alt="Search" className="h-8 w-8 opacity-60" />
      </Button>

      <CardContent className={`shrink-0 ${containerPadding}`}>
        <div className={layoutClass}>
          <div className={calendarShellClass}>
            <div className="origin-top">
              <Calendar
                mode="single"
                selected={selectedDate || undefined}
                onSelect={onSelectDate}
                className="rounded-md bg-neutral-100 text-white"
              />
            </div>
          </div>

          <div className={controlsShellClass}>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="icon-xl"
                onClick={onPrevious}
                aria-label="Previous day"
                className="rounded-full text-[#404040] bg-[#e2e2e1] hover:bg-[#d6d6d5]
transition-all duration-200 ease-out
hover:scale-110 hover:shadow-md
active:scale-95"
              >
                <img src={ChevronLeftIcon} alt="Previous" className="h-5 w-5 transition-transform duration-200 group-hover:-translate-x-0.5" />
              </Button>

              <Button
                variant="secondary"
                size="xl"
                onClick={onToday}
                className="text-xl text-[#404040] font-semibold bg-[#e2e2e1] hover:bg-[#d6d6d5]
transition-all duration-200 ease-out
hover:scale-105 hover:shadow-md
active:scale-95"
              >
                Today
              </Button>

              <Button
                variant="secondary"
                size="icon-xl"
                onClick={onNext}
                aria-label="Next day"
                className="rounded-full bg-[#e2e2e1] hover:bg-[#d6d6d5]
transition-all duration-200 ease-out
hover:scale-110 hover:shadow-md
active:scale-95"
              >
                <img
                  src={ChevronLeftIcon}
                  alt="Next"
                  className="h-5 w-5 rotate-180 transition-transform duration-200"
                />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </>
  )
}
