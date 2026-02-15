import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import ImportPage from './pages/ImportPage'
import PackageDashboardPage from './pages/PackageDashboardPage'
import DealerUnlockPage from './pages/DealerUnlockPage'
import DealerBidPage from './pages/DealerBidPage'
import ComparisonPage from './pages/ComparisonPage'

const navItems = [
  { to: '/import', label: 'Import Package' },
  { to: '/package', label: 'Bid Package Dashboard' },
  { to: '/invite/demo-token', label: 'Dealer Unlock' },
  { to: '/invite/demo-token/bid', label: 'Dealer Bid' },
  { to: '/comparison', label: 'Comparison' }
]

export default function App() {
  return (
    <div className="app-shell">
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

      <main className="content">
        <Routes>
          <Route path="/" element={<Navigate to="/import" replace />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/package" element={<PackageDashboardPage />} />
          <Route path="/invite/:token" element={<DealerUnlockPage />} />
          <Route path="/invite/:token/bid" element={<DealerBidPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
        </Routes>
      </main>
    </div>
  )
}
