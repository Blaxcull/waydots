import { Navigate, Route, Routes } from 'react-router-dom'
import { DayViewRoute, MonthViewRoute, TodayRedirect, WeekViewRoute, YearViewRoute } from '@/components/DayViewRoute'
import GoalView from '@/Goal_view/GoalView'
import { Home } from '@/pages/Home'
import { CheckoutPage } from '@/pages/Checkout'
import { Login } from '@/pages/Login'
import { ResetPassword } from '@/pages/ResetPassword'
import { Signup } from '@/pages/Signup'
import AnalysisView from '@/Analysis_view/AnalysisView'
import MailView from '@/Mail_view/MailView'
import TaskView from '@/Task_view/TaskView'
import type { SubscriptionPlan, SubscriptionStatus } from '@/hooks/useSubscription'

interface AppRoutesProps {
  isAuthenticated: boolean
  subscriptionPlan: SubscriptionPlan
  subscriptionStatus: SubscriptionStatus
  isPro: boolean
}

export function AppRoutes({ isAuthenticated, subscriptionPlan, subscriptionStatus, isPro }: AppRoutesProps) {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Home
            isAuthenticated={isAuthenticated}
            subscriptionPlan={subscriptionPlan}
            subscriptionStatus={subscriptionStatus}
            isPro={isPro}
          />
        }
      />
      <Route path="/checkout" element={isAuthenticated ? <CheckoutPage /> : <Navigate to="/login" replace />} />
      <Route path="/today" element={isAuthenticated ? <TodayRedirect /> : <Navigate to="/login" replace />} />
      <Route path="/day/:year/:month/:day" element={isAuthenticated ? <DayViewRoute /> : <Navigate to="/login" replace />} />
      <Route path="/week/:year/:month/:day" element={isAuthenticated ? <WeekViewRoute /> : <Navigate to="/login" replace />} />
      <Route path="/month/:year/:month/:day" element={isAuthenticated ? <MonthViewRoute /> : <Navigate to="/login" replace />} />
      <Route path="/year/:year/:month/:day" element={isAuthenticated ? <YearViewRoute /> : <Navigate to="/login" replace />} />
      <Route path="/goals" element={isAuthenticated ? <GoalView /> : <Navigate to="/login" replace />} />
      <Route path="/analysis" element={isAuthenticated ? <AnalysisView /> : <Navigate to="/login" replace />} />
      <Route path="/mail" element={isAuthenticated ? <MailView /> : <Navigate to="/login" replace />} />
      <Route path="/todos" element={isAuthenticated ? <TaskView /> : <Navigate to="/login" replace />} />
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/signup" element={isAuthenticated ? <Navigate to="/" replace /> : <Signup />} />
      <Route path="/reset-password" element={<ResetPassword />} />
    </Routes>
  )
}
