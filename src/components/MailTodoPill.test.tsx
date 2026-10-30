// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, describe, expect, it, vi } from "vitest"
import { MailTodoPill } from "./MailTodoPill"

afterEach(() => {
  cleanup()
})

const renderWithRouter = (ui: React.ReactElement, initialEntries = ["/"]) => {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>)
}

describe("MailTodoPill", () => {
  it("renders mail and to-do list buttons", () => {
    renderWithRouter(<MailTodoPill />)

    expect(screen.getByRole("button", { name: "Mail" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "To-do list" })).toBeInTheDocument()
  })

  it("handles clicking mail button", () => {
    const onMailClick = vi.fn()
    const dispatchSpy = vi.spyOn(window, "dispatchEvent")

    renderWithRouter(<MailTodoPill onMailClick={onMailClick} />)

    const mailBtn = screen.getByRole("button", { name: "Mail" })
    fireEvent.click(mailBtn)

    expect(onMailClick).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "waydots:open-mail" })
    )
  })

  it("handles clicking to-do list button", () => {
    const onTodoClick = vi.fn()
    const dispatchSpy = vi.spyOn(window, "dispatchEvent")

    renderWithRouter(<MailTodoPill onTodoClick={onTodoClick} />)

    const todoBtn = screen.getByRole("button", { name: "To-do list" })
    fireEvent.click(todoBtn)

    expect(onTodoClick).toHaveBeenCalledTimes(1)
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "waydots:open-tasks" })
    )
  })

  it("shows active style when on /mail route", () => {
    renderWithRouter(<MailTodoPill />, ["/mail"])
    const mailBtn = screen.getByRole("button", { name: "Mail" })
    expect(mailBtn.className).toContain("bg-[#dddddd]")
  })

  it("shows active style when on /todos route", () => {
    renderWithRouter(<MailTodoPill />, ["/todos"])
    const todoBtn = screen.getByRole("button", { name: "To-do list" })
    expect(todoBtn.className).toContain("bg-[#dddddd]")
  })

  it("respects controlled active state", () => {
    const { rerender } = render(
      <MemoryRouter>
        <MailTodoPill isMailActive={true} />
      </MemoryRouter>
    )
    const mailBtn = screen.getByRole("button", { name: "Mail" })
    expect(mailBtn.className).toContain("bg-[#dddddd]")

    rerender(
      <MemoryRouter>
        <MailTodoPill isTodoActive={true} />
      </MemoryRouter>
    )
    const todoBtn = screen.getByRole("button", { name: "To-do list" })
    expect(todoBtn.className).toContain("bg-[#dddddd]")
  })
})
