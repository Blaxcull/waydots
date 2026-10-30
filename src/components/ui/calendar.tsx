import * as React from "react"
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from "lucide-react"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
} from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button, buttonVariants } from "@/components/ui/button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      fixedWeeks
      className={cn(
        "bg-neutral-100 text-slate-800 rounded-md w-fit [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        className
      )}
      captionLayout={captionLayout}
      formatters={{
        formatWeekdayName: (date) =>
          date.toLocaleDateString("en-US", { weekday: "narrow" }),
        formatMonthDropdown: (date) =>
          date.toLocaleString("default", { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("w-fit", defaultClassNames.root),
        months: cn("flex flex-col", defaultClassNames.months),
        month: cn("flex flex-col w-full gap-2", defaultClassNames.month),
        nav: cn(
          "flex items-center gap-1 w-full absolute top-0 right-0 justify-end pt-2 pr-4",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-8 aria-disabled:opacity-50 p-0 select-none ml-auto hover:bg-neutral-300 rounded-full",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "size-8 aria-disabled:opacity-50 p-0 select-none hover:bg-neutral-300 rounded-full",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "flex items-center justify-start h-(--cell-size) w-full px-(--cell-size) pl-2",
          defaultClassNames.month_caption
        ),
        caption_label: cn(
          "select-none font-semibold text-neutral-600 text-2xl",
          captionLayout === "label"
            ? "text-xl"
            : "rounded-md pl-2 pr-1 flex items-center gap-1 text-2xl h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          defaultClassNames.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: cn("flex gap-x-5", defaultClassNames.weekdays),
        weekday: cn(
          "text-xl text-neutral-500 font-semibold tracking-wide flex-1 text-center select-none mb-1",

          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-0 gap-x-5 px-0 py-0", defaultClassNames.week),
        week_number_header: cn(
          "select-none w-(--cell-size)",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "text-[0.8rem] select-none text-muted-foreground",
          defaultClassNames.week_number
        ),
        day: cn(
          "relative w-full h-full p-0 aspect-square select-none",
          defaultClassNames.day
        ),
        range_start: cn(
          "rounded-l-md bg-accent",
          defaultClassNames.range_start
        ),
        range_middle: cn("rounded-none", defaultClassNames.range_middle),
        range_end: cn("rounded-r-md bg-accent", defaultClassNames.range_end),
        today: cn(
          "bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "text-neutral-600 opacity-50",
          defaultClassNames.outside
        ),
        disabled: cn(
          "text-muted-foreground opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon className={cn("size-6", className)} {...props} />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("size-6", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon className={cn("size-6", className)} {...props} />
          )
        },
        DayButton: CalendarDayButton,
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: React.ComponentProps<typeof DayButton>) {
  const defaultClassNames = getDefaultClassNames()
  const ref = React.useRef<HTMLButtonElement>(null)

  const isWeekend =
    day.date.getDay() === 0 || day.date.getDay() === 6

  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(

        "h-8 w-8 rounded-full text-lg tabular-nums text-lg font-sf font-bold transition-colors flex items-center justify-center leading-none",
        modifiers.selected
          ? "bg-red-400 text-white hover:bg-neutral-300"
          : modifiers.today
          ? "bg-red-500 text-white hover:bg-neutral-300"
          : modifiers.outside
          ? "text-neutral-400  hover:bg-neutral-300"
          : isWeekend
          ? "text-neutral-500 hover:bg-neutral-300"
          : "text-neutral-800 hover:bg-neutral-300",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )
}

export { Calendar, CalendarDayButton }
