// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { TopBarLeft } from "./TopBarLeft"

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

afterEach(() => {
  cleanup()
})

const renderWithRouter = (initialEntries = ["/day/2026/10/31"]) => {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <TopBarLeft />
    </MemoryRouter>
  )
}

describe("TopBarLeft", () => {
  it("renders Goal and Progress icons when on calendar view", () => {
    renderWithRouter(["/day/2026/10/31"])

    expect(screen.getAllByRole("button", { name: "Goals" })[0]).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Progress" })[0]).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Home" })).not.toBeInTheDocument()
  })

  it("renders Home and Calendar icons when on mail view", () => {
    renderWithRouter(["/mail"])

    expect(screen.getAllByRole("button", { name: "Home" })[0]).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Calendar" })[0]).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Goals" })).not.toBeInTheDocument()
  })

  it("renders Home and Calendar icons when on todos view", () => {
    renderWithRouter(["/todos"])

    expect(screen.getAllByRole("button", { name: "Home" })[0]).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Calendar" })[0]).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Goals" })).not.toBeInTheDocument()
  })
})
