import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'

interface AuthRedirectProps {
  children: React.ReactNode
}

export function AuthRedirect({ children }: AuthRedirectProps) {
  const { isAuthenticated, isAuthLoading } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isAuthLoading && isAuthenticated) {
      const today = new Date()
      navigate(`/day/${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`, { replace: true })
    }
  }, [isAuthenticated, isAuthLoading, navigate])

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return <>{children}</>
}
