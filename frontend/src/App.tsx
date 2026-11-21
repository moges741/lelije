import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppProvider'
import { useApp } from './context/app-context'
import { ChildJoin, CodeHelp, FamilyRegister, FamilySetup, Login } from './pages/account/AccountScreens'
import { ChildNotifications, ChildPlay, ChildSettings } from './pages/child/ChildScreens'
import { MissionDetail } from './pages/MissionDetail'
import { Missions } from './pages/Missions'
import {
  Activity,
  MissionReview,
  ParentHome,
  ParentNotifications,
  ParentSettings,
  PlayReview,
} from './pages/parent/ParentScreens'
import { Success } from './pages/Success'
import { Welcome } from './pages/Welcome'

const PoseMission = lazy(() =>
  import('./pages/PoseMission').then((m) => ({ default: m.PoseMission })),
)
const CatchStars = lazy(() =>
  import('./pages/CatchStars').then((m) => ({ default: m.CatchStars })),
)

function RequireChild() {
  const { session } = useApp()
  if (session?.role === 'child' && session.child) return <Outlet />
  if (session?.role === 'parent') return <Navigate to="/parent" replace />
  return <Navigate to="/login" replace />
}

function RequireParent() {
  const { session } = useApp()
  if (session?.role === 'parent') return <Outlet />
  if (session?.role === 'child' && session.child) return <Navigate to="/missions" replace />
  return <Navigate to="/login" replace />
}

function ScreenFallback() {
  const { t } = useApp()
  return (
    <main className="screen">
      <p className="lead">{t('loading')}</p>
    </main>
  )
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Suspense fallback={<ScreenFallback />}>
          <Routes>
            <Route path="/" element={<Welcome />} />
            <Route path="/register/family" element={<FamilyRegister />} />
            <Route path="/register/child" element={<ChildJoin />} />
            <Route path="/login" element={<Login />} />
            <Route path="/help/code" element={<CodeHelp />} />
            <Route path="/parents" element={<Navigate to="/parent" replace />} />

            <Route element={<RequireParent />}>
              <Route path="/family" element={<FamilySetup />} />
              <Route path="/parent" element={<ParentHome />} />
              <Route path="/parent/review/:id" element={<MissionReview />} />
              <Route path="/parent/play" element={<PlayReview />} />
              <Route path="/parent/activity" element={<Activity />} />
              <Route path="/parent/notifications" element={<ParentNotifications />} />
              <Route path="/parent/settings" element={<ParentSettings />} />
            </Route>

            <Route element={<RequireChild />}>
              <Route path="/missions" element={<Missions />} />
              <Route path="/missions/:id" element={<MissionDetail />} />
              <Route path="/missions/:id/play" element={<PoseMission />} />
              <Route path="/stars" element={<CatchStars />} />
              <Route path="/success" element={<Success />} />
              <Route path="/child/settings" element={<ChildSettings />} />
              <Route path="/child/play" element={<ChildPlay />} />
              <Route path="/child/notifications" element={<ChildNotifications />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AppProvider>
  )
}
