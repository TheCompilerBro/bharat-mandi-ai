import React from 'react'
import { useOffline } from '../contexts/OfflineContext'
import './OfflineIndicator.css'

const OfflineIndicator: React.FC = () => {
  const { isOnline } = useOffline()

  if (isOnline) {
    return null
  }

  return (
    <div className="offline-indicator">
      <div className="container">
        <div className="offline-content">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 1a7 7 0 100 14A7 7 0 008 1zM7 4a1 1 0 112 0v3a1 1 0 11-2 0V4zM8 10a1 1 0 100 2 1 1 0 000-2z"/>
          </svg>
          <span>You're offline. Some features may be limited.</span>
        </div>
      </div>
    </div>
  )
}

export default OfflineIndicator