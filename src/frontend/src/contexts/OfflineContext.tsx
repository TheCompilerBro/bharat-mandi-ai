import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface OfflineContextType {
  isOnline: boolean
  offlineData: Record<string, any>
  saveOfflineData: (key: string, data: any) => void
  getOfflineData: (key: string) => any
}

const OfflineContext = createContext<OfflineContextType | undefined>(undefined)

export const useOffline = () => {
  const context = useContext(OfflineContext)
  if (context === undefined) {
    throw new Error('useOffline must be used within an OfflineProvider')
  }
  return context
}

interface OfflineProviderProps {
  children: ReactNode
}

export const OfflineProvider: React.FC<OfflineProviderProps> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [offlineData, setOfflineData] = useState<Record<string, any>>({})

  useEffect(() => {
    // Load offline data from localStorage on mount
    const loadOfflineData = () => {
      try {
        const stored = localStorage.getItem('offlineData')
        if (stored) {
          setOfflineData(JSON.parse(stored))
        }
      } catch (error) {
        console.error('Failed to load offline data:', error)
      }
    }

    loadOfflineData()

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true)
      // Sync offline data when coming back online
      syncOfflineData()
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const saveOfflineData = (key: string, data: any) => {
    const newOfflineData = {
      ...offlineData,
      [key]: data
    }
    setOfflineData(newOfflineData)
    
    try {
      localStorage.setItem('offlineData', JSON.stringify(newOfflineData))
    } catch (error) {
      console.error('Failed to save offline data:', error)
    }
  }

  const getOfflineData = (key: string) => {
    return offlineData[key] || null
  }

  const syncOfflineData = async () => {
    // Sync cached data with server when coming back online
    try {
      // This would typically sync any pending changes
      console.log('Syncing offline data...')
      
      // Example: sync pending messages, price updates, etc.
      // Implementation would depend on specific sync requirements
    } catch (error) {
      console.error('Failed to sync offline data:', error)
    }
  }

  const value: OfflineContextType = {
    isOnline,
    offlineData,
    saveOfflineData,
    getOfflineData,
  }

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  )
}