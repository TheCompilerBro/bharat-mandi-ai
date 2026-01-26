import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import LanguageSelector from './LanguageSelector'
import './Header.css'

const Header: React.FC = () => {
  const { user, logout } = useAuth()
  const [showUserMenu, setShowUserMenu] = useState(false)

  return (
    <header className="header">
      <div className="container">
        <div className="header-content">
          <div className="header-left">
            <h1 className="logo">
              <span className="logo-icon">🏪</span>
              MandiChallenge
            </h1>
          </div>
          
          <div className="header-right">
            <LanguageSelector />
            
            <div className="user-menu">
              <button
                className="user-menu-trigger"
                onClick={() => setShowUserMenu(!showUserMenu)}
                aria-expanded={showUserMenu}
                aria-haspopup="true"
              >
                <div className="user-avatar">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <span className="user-name">{user?.name || 'User'}</span>
                <svg 
                  className={`chevron ${showUserMenu ? 'rotated' : ''}`}
                  width="16" 
                  height="16" 
                  viewBox="0 0 16 16"
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
              </button>
              
              {showUserMenu && (
                <div className="user-menu-dropdown">
                  <a href="/profile" className="menu-item">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                      <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM8 9a5 5 0 00-5 5h10a5 5 0 00-5-5z" fill="currentColor"/>
                    </svg>
                    Profile
                  </a>
                  <button onClick={logout} className="menu-item">
                    <svg width="16" height="16" viewBox="0 0 16 16">
                      <path d="M6 2a1 1 0 000 2h4a1 1 0 100-2H6zM3 6a1 1 0 011-1h8a1 1 0 011 1v6a2 2 0 01-2 2H5a2 2 0 01-2-2V6z" fill="currentColor"/>
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header