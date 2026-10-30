import React from "react"
import ReactDOM from "react-dom"
import { X } from "lucide-react"

interface DialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  if (!open) return null
  if (typeof document === "undefined") return null

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 30000 }}
    >
      <div 
        className="absolute inset-0"
        style={{
          backgroundColor: "rgba(0,0,0,0.30)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
        onClick={() => onOpenChange(false)}
      />
      <div className="relative" style={{ zIndex: 30010 }}>
        {children}
      </div>
    </div>,
    document.body
  )
}

interface DialogContentProps {
  children: React.ReactNode
  className?: string
  onClose?: () => void
}

export function DialogContent({ children, className = "", onClose }: DialogContentProps) {
  return (
    <div className={`bg-neutral-100 border border-neutral-300 rounded-xl shadow-2xl ${className}`}>
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-neutral-400 hover:text-white p-1"
        >
          <X className="h-5 w-5" />
        </button>
      )}
      {children}
    </div>
  )
}

interface DialogHeaderProps {
  children: React.ReactNode
}

export function DialogHeader({ children }: DialogHeaderProps) {
  return (
    <div className="px-4 py-3 border-b border-neutral-300">
      {children}
    </div>
  )
}

interface DialogBodyProps {
  children: React.ReactNode
}

export function DialogBody({ children }: DialogBodyProps) {
  return (
    <div className="p-4">
      {children}
    </div>
  )
}
