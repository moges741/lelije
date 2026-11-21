import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppProvider'
import { useApp } from './context/app-context'
import {
  ChildJoin,
  CodeHelp,
  FamilyRegister,
  FamilySetup,
  Login,
  Start,
} from './pages/account/AccountScreens'
import { ChildNotifications, ChildPlay, ChildSettings } from './pages/child/ChildScreens'
import { MissionDetail } from './pages/MissionDetail'
import { Missions } from './pages/Missions'
import {
  Activity,
  MissionReview,
  Notifications,
  ParentHome,
  ParentSettings,
  PlayReview,
  Routines,
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
  return session?.role === 'child' && session.child ? <Outlet /> : <Navigate to="/login" replace />
}

function RequireParent() {
  const { session } = useApp()
  return session?.role === 'parent' ? <Outlet /> : <Navigate to="/login" replace />
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
            <Route path="/start" element={<Start />} />
            <Route path="/register/family" element={<FamilyRegister />} />
            <Route path="/register/child" element={<ChildJoin />} />
            <Route path="/login" element={<Login />} />
            <Route path="/help/code" element={<CodeHelp />} />

            <Route element={<RequireParent />}>
              <Route path="/family" element={<FamilySetup />} />
              <Route path="/parent" element={<ParentHome />} />
              <Route path="/parent/review/:id" element={<MissionReview />} />
              <Route path="/parent/play" element={<PlayReview />} />
              <Route path="/parent/activity" element={<Activity />} />
              <Route path="/parent/routines" element={<Routines />} />
              <Route path="/parent/notifications" element={<Notifications audience="parent" />} />
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
