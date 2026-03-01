import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import ImportPage from './pages/ImportPage'
import ProjectsPage from './pages/ProjectsPage'
import PackageDashboardPage from './pages/PackageDashboardPage'
import VendorsPage from './pages/VendorsPage'
import DealerUnlockPage from './pages/DealerUnlockPage'
import DealerBidPage from './pages/DealerBidPage'
import ComparisonPage from './pages/ComparisonPage'
import PublicBidPackagePage from './pages/PublicBidPackagePage'

const navItems = [
  { to: '/vendors', label: 'Vendors' },
  { to: '/projects', label: 'Projects' },
  { to: '/import', label: 'Import Package' },
  { to: '/package', label: 'Bid Package Dashboard' }
]

export default function App() {
  const location = useLocation()
  const isBidderPath = /^\/invite\/[^/]+(?:\/bid)?$/.test(location.pathname)
  const isPublicPath = /^\/public\/bid-packages\/[^/]+$/.test(location.pathname)
  const isFocusedComparisonPath = location.pathname === '/comparison' && /[?&]bid_package_id=/.test(location.search || '')
  const hideTopbar = isBidderPath || isPublicPath || isFocusedComparisonPath

  return (
    <div className={`app-shell ${hideTopbar ? 'app-shell-bidder' : ''}`.trim()}>
      {hideTopbar ? null : (
        <header className="topbar">
          <div>
            <p className="eyebrow">Designer Pages Prototype</p>
            <h1>Bid Collections</h1>
          </div>
          <nav className="topnav">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </header>
      )}

      <main className={`content ${hideTopbar ? 'no-topbar' : ''}`.trim()}>
        <Routes>
          <Route path="/" element={<Navigate to="/import" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/vendors" element={<VendorsPage />} />
          <Route path="/package" element={<PackageDashboardPage />} />
          <Route path="/invite/:token" element={<DealerUnlockPage />} />
          <Route path="/invite/:token/bid" element={<DealerBidPage />} />
          <Route path="/public/bid-packages/:token" element={<PublicBidPackagePage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
        </Routes>
      </main>
    </div>
  )
}
