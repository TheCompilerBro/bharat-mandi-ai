import React, { useState, useEffect } from 'react'
import { useOffline } from '../contexts/OfflineContext'
import './Dashboard.css'

interface PriceAlert {
  id: string
  commodity: string
  currentPrice: number
  change: number
  changePercent: string
  priceFlash?: boolean
  changeFlash?: boolean
}

interface QuickAction {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  action: () => void
  priority: 'high' | 'medium' | 'low'
}

const Dashboard: React.FC = () => {
  const { isOnline, getOfflineData, saveOfflineData } = useOffline()
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([])
  const [loading, setLoading] = useState(true)

  // Function to simulate realistic trading-style price changes
  const simulateTradingPriceChanges = () => {
    setPriceAlerts(prevAlerts => 
      prevAlerts.map(alert => {
        // Generate smaller, more realistic trading changes (-0.05 to +0.05)
        const randomChange = (Math.random() - 0.5) * 0.1
        const currentPercent = parseFloat(alert.changePercent.replace(/[+%]/g, ''))
        let newPercent = currentPercent + randomChange
        
        // Keep percentage within realistic trading bounds (-10% to +10%)
        newPercent = Math.max(-10, Math.min(10, newPercent))
        
        // Update the change amount proportionally
        const newChange = Math.round((newPercent / 100) * alert.currentPrice)
        
        // Slightly adjust the current price for more realism (smaller changes)
        const priceChange = Math.round((Math.random() - 0.5) * 10)
        const newPrice = Math.max(100, alert.currentPrice + priceChange)
        
        // Determine if this is a significant change (for animation)
        const isSignificantChange = Math.abs(newPercent - currentPercent) > 0.03
        
        return {
          ...alert,
          currentPrice: newPrice,
          change: newChange,
          changePercent: `${newPercent >= 0 ? '+' : ''}${newPercent.toFixed(2)}%`,
          priceFlash: Math.abs(priceChange) > 5, // Flash if price changed significantly
          changeFlash: isSignificantChange // Flash if percentage changed significantly
        }
      })
    )
    
    // Clear flash states after animation
    setTimeout(() => {
      setPriceAlerts(prevAlerts => 
        prevAlerts.map(alert => ({
          ...alert,
          priceFlash: false,
          changeFlash: false
        }))
      )
    }, 800)
  }

  // Start trading-style price changes on component mount - using useRef to persist across re-renders
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null)
  
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
    }
    
    // Start new interval only if we have price alerts
    if (priceAlerts.length > 0) {
      intervalRef.current = setInterval(simulateTradingPriceChanges, 3000) // Change every 3 seconds (slower speed)
    }
    
    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [priceAlerts.length]) // Only restart when alerts are loaded

  const quickActions: QuickAction[] = [
    {
      id: 'check-prices',
      title: 'Check Prices',
      description: 'View current market rates',
      priority: 'high',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
      ),
      action: () => window.location.href = '/prices'
    },
    {
      id: 'send-message',
      title: 'Send Message',
      description: 'Connect with traders',
      priority: 'high',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
        </svg>
      ),
      action: () => window.location.href = '/messages'
    },
    {
      id: 'update-profile',
      title: 'Update Profile',
      description: 'Manage your information',
      priority: 'medium',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      ),
      action: () => window.location.href = '/profile'
    }
  ]

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        if (isOnline) {
          // Get auth token from localStorage
          const token = localStorage.getItem('accessToken')
          console.log('Dashboard: Token found:', !!token)
          
          if (!token) {
            console.error('Dashboard: No auth token found')
            // Set some default mock data when no token
            const mockAlerts = [
              {
                id: '1',
                commodity: 'Rice',
                currentPrice: 2000,
                change: 50,
                changePercent: '+2.50%'
              },
              {
                id: '2',
                commodity: 'Wheat',
                currentPrice: 2500,
                change: -30,
                changePercent: '-1.20%'
              },
              {
                id: '3',
                commodity: 'Cotton',
                currentPrice: 5500,
                change: 100,
                changePercent: '+1.80%'
              },
              {
                id: '4',
                commodity: 'Onion',
                currentPrice: 1200,
                change: -88,
                changePercent: '-4.60%'
              },
              {
                id: '5',
                commodity: 'Potato',
                currentPrice: 800,
                change: 25,
                changePercent: '+3.20%'
              },
              {
                id: '6',
                commodity: 'Tomato',
                currentPrice: 1500,
                change: -45,
                changePercent: '-2.90%'
              },
              {
                id: '7',
                commodity: 'Sugarcane',
                currentPrice: 350,
                change: 15,
                changePercent: '+4.50%'
              },
              {
                id: '8',
                commodity: 'Maize',
                currentPrice: 1800,
                change: 60,
                changePercent: '+3.40%'
              }
            ]
            setPriceAlerts(mockAlerts)
            saveOfflineData('priceAlerts', mockAlerts)
            setLoading(false)
            return
          }

          // Fetch live data from API
          const response = await fetch('/api/v1/analytics/dashboard', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          })
          
          console.log('Dashboard: API response status:', response.status)
          
          if (response.ok) {
            const data = await response.json()
            console.log('Dashboard: API data received:', data)
            
            // Convert dashboard data to price alerts format
            const alerts = data.data?.recentActivity?.filter((activity: any) => 
              activity.type === 'price_alert' || activity.type === 'price_update'
            ).map((activity: any, index: number) => ({
              id: activity.id || index.toString(),
              commodity: activity.commodity || 'Unknown',
              currentPrice: Math.floor(Math.random() * 3000) + 1000, // Mock price
              change: Math.floor(Math.random() * 200) - 100, // Mock change
              changePercent: (Math.random() * 10 - 5).toFixed(1) // Mock percentage
            })) || []
            
            // If no alerts from API, add comprehensive mock data
            if (alerts.length === 0) {
              alerts.push(
                {
                  id: '1',
                  commodity: 'Rice',
                  currentPrice: 2000,
                  change: 50,
                  changePercent: '+2.50%'
                },
                {
                  id: '2',
                  commodity: 'Wheat',
                  currentPrice: 2500,
                  change: -30,
                  changePercent: '-1.20%'
                },
                {
                  id: '3',
                  commodity: 'Cotton',
                  currentPrice: 5500,
                  change: 100,
                  changePercent: '+1.80%'
                },
                {
                  id: '4',
                  commodity: 'Onion',
                  currentPrice: 1200,
                  change: -88,
                  changePercent: '-4.60%'
                },
                {
                  id: '5',
                  commodity: 'Potato',
                  currentPrice: 800,
                  change: 25,
                  changePercent: '+3.20%'
                },
                {
                  id: '6',
                  commodity: 'Tomato',
                  currentPrice: 1500,
                  change: -45,
                  changePercent: '-2.90%'
                },
                {
                  id: '7',
                  commodity: 'Sugarcane',
                  currentPrice: 350,
                  change: 15,
                  changePercent: '+4.50%'
                },
                {
                  id: '8',
                  commodity: 'Maize',
                  currentPrice: 1800,
                  change: 60,
                  changePercent: '+3.40%'
                },
                {
                  id: '9',
                  commodity: 'Turmeric',
                  currentPrice: 8500,
                  change: -200,
                  changePercent: '-2.30%'
                },
                {
                  id: '10',
                  commodity: 'Chillies',
                  currentPrice: 12000,
                  change: 300,
                  changePercent: '+2.60%'
                }
              )
            }
            
            setPriceAlerts(alerts)
            saveOfflineData('priceAlerts', alerts)
          } else {
            console.error('Dashboard: API request failed:', response.status)
            // Fallback to cached data
            const cachedAlerts = getOfflineData('priceAlerts') || []
            setPriceAlerts(cachedAlerts)
          }
        } else {
          // Load cached data
          const cachedAlerts = getOfflineData('priceAlerts') || []
          setPriceAlerts(cachedAlerts)
        }
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
        // Fallback to cached data
        const cachedAlerts = getOfflineData('priceAlerts') || []
        setPriceAlerts(cachedAlerts)
      } finally {
        setLoading(false)
      }
    }

    loadDashboardData()
  }, [isOnline, getOfflineData, saveOfflineData])

  // Filter actions based on screen size and priority
  const getVisibleActions = () => {
    const isMobile = window.innerWidth <= 768
    if (isMobile) {
      // On mobile, show only high priority actions
      return quickActions.filter(action => action.priority === 'high')
    }
    return quickActions
  }

  const visibleActions = getVisibleActions()

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Welcome back! Here's what's happening in your markets.
        </p>
      </div>

      <div className="dashboard-grid">
        {/* Quick Actions */}
        <section className="dashboard-section">
          <h2 className="section-title">Quick Actions</h2>
          <div className="quick-actions">
            {visibleActions.map((action) => (
              <button
                key={action.id}
                className="quick-action-card"
                onClick={action.action}
              >
                <div className="action-icon">{action.icon}</div>
                <div className="action-content">
                  <h3 className="action-title">{action.title}</h3>
                  <p className="action-description">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Price Alerts */}
        <section className="dashboard-section">
          <h2 className="section-title">
            Price Alerts
            {!isOnline && <span className="offline-badge">Cached</span>}
          </h2>
          
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading price alerts...</p>
            </div>
          ) : priceAlerts.length > 0 ? (
            <div className="price-alerts">
              {priceAlerts.map((alert) => (
                <div key={`${alert.id}-${alert.changePercent}`} className="price-alert-card">
                  <div className="alert-commodity">{alert.commodity}</div>
                  <div className={`alert-price ${alert.priceFlash ? 'price-flash' : ''}`}>
                    ₹{alert.currentPrice.toLocaleString()}
                  </div>
                  <div className={`alert-change ${alert.change >= 0 ? 'positive' : 'negative'} ${alert.changeFlash ? 'change-flash' : ''} ${Math.abs(alert.change) > 50 ? 'significant-change' : ''}`}>
                    {alert.change >= 0 ? '+' : ''}₹{alert.change} ({alert.changePercent})
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>No price alerts at the moment.</p>
              <button 
                className="btn bg-primary text-white"
                onClick={() => window.location.href = '/prices'}
              >
                Set up alerts
              </button>
            </div>
          )}
        </section>

        {/* Market Summary */}
        <section className="dashboard-section">
          <h2 className="section-title">Market Summary</h2>
          <div className="market-summary">
            <div className="summary-card">
              <h3>Active Markets</h3>
              <div className="summary-value">24</div>
            </div>
            <div className="summary-card">
              <h3>Avg Response Time</h3>
              <div className="summary-value">1.2s</div>
            </div>
            <div className="summary-card">
              <h3>Languages Supported</h3>
              <div className="summary-value">10</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Dashboard