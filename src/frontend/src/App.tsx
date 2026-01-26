import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Navigation from './components/Navigation'
import Dashboard from './pages/Dashboard'
import PriceDiscovery from './pages/PriceDiscovery'
import Messaging from './pages/Messaging'
import Profile from './pages/Profile'
import Login from './pages/Login'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { OfflineProvider } from './contexts/OfflineContext'
import OfflineIndicator from './components/OfflineIndicator'
import './styles/App.css'

function AppContent() {
  const { isAuthenticated } = useAuth()
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (!isAuthenticated) {
    return <Login />
  }

  return (
    <div className="app">
      <Header />
      <OfflineIndicator />
      <div className="app-content">
        {isMobile ? (
          <div className="mobile-layout">
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/prices" element={<PriceDiscovery />} />
                <Route path="/messages" element={<Messaging />} />
                <Route path="/profile" element={<Profile />} />
              </Routes>
            </main>
            <Navigation />
          </div>
        ) : (
          <div className="desktop-layout">
            <Navigation />
            <main className="main-content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/prices" element={<PriceDiscovery />} />
                <Route path="/messages" element={<Messaging />} />
                <Route path="/profile" element={<Profile />} />
              </Routes>
            </main>
          </div>
        )}
      </div>
    </div>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <OfflineProvider>
          <AppContent />
        </OfflineProvider>
      </AuthProvider>
    </Router>
  )
}

export default App