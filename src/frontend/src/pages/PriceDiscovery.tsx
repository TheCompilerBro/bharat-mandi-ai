import React, { useState, useEffect } from 'react'
import { useOffline } from '../contexts/OfflineContext'
import './PriceDiscovery.css'

interface PriceData {
  commodity: string
  currentPrice: number
  priceRange: { min: number, max: number, modal: number }
  lastUpdated: Date
  volatility: number
  trend: 'up' | 'down' | 'stable'
}

const PriceDiscovery: React.FC = () => {
  const { isOnline, getOfflineData, saveOfflineData } = useOffline()
  const [searchTerm, setSearchTerm] = useState('')
  const [priceData, setPriceData] = useState<PriceData[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedCommodity, setSelectedCommodity] = useState<string>('')

  const commonCommodities = [
    'Rice', 'Wheat', 'Onion', 'Potato', 'Tomato', 
    'Sugarcane', 'Cotton', 'Soybean', 'Maize', 'Turmeric'
  ]

  useEffect(() => {
    // Load cached price data on mount
    const cachedData = getOfflineData('prices') || []
    setPriceData(cachedData)
  }, [getOfflineData])

  const searchPrices = async (commodity: string) => {
    setLoading(true)
    setSelectedCommodity(commodity)

    try {
      if (isOnline) {
        const response = await fetch(`/api/v1/price-discovery/search?q=${encodeURIComponent(commodity)}`)
        if (response.ok) {
          const data = await response.json()
          // Transform the API response to match our interface
          const transformedData = data.data?.map((item: any) => ({
            commodity: item.commodity,
            currentPrice: item.currentPrice,
            priceRange: item.priceRange,
            lastUpdated: new Date(item.lastUpdated),
            volatility: item.volatility,
            trend: item.volatility > 10 ? 'up' : item.volatility < -5 ? 'down' : 'stable'
          })) || []
          
          setPriceData(transformedData)
          // Cache the data for offline use
          saveOfflineData('prices', transformedData)
        }
      } else {
        // Filter cached data
        const cachedData = getOfflineData('prices') || []
        const filtered = cachedData.filter((item: PriceData) => 
          item.commodity.toLowerCase().includes(commodity.toLowerCase())
        )
        setPriceData(filtered)
      }
    } catch (error) {
      console.error('Failed to search prices:', error)
      // Fallback to cached data
      const cachedData = getOfflineData('prices') || []
      const filtered = cachedData.filter((item: PriceData) => 
        item.commodity.toLowerCase().includes(commodity.toLowerCase())
      )
      setPriceData(filtered)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (searchTerm.trim()) {
      searchPrices(searchTerm.trim())
    }
  }

  const handleCommodityClick = (commodity: string) => {
    setSearchTerm(commodity)
    searchPrices(commodity)
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <span className="trend-icon up">↗</span>
      case 'down':
        return <span className="trend-icon down">↘</span>
      default:
        return <span className="trend-icon stable">→</span>
    }
  }

  const getVolatilityColor = (volatility: number) => {
    if (volatility > 15) return 'high'
    if (volatility > 8) return 'medium'
    return 'low'
  }

  return (
    <div className="price-discovery">
      <div className="page-header">
        <h1 className="page-title">Price Discovery</h1>
        <p className="page-subtitle">
          Real-time market prices from across India
          {!isOnline && <span className="offline-note"> (Cached data)</span>}
        </p>
      </div>

      {/* Search Section */}
      <section className="search-section">
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-input-group">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search for commodity (e.g., Rice, Wheat, Onion)"
              className="search-input"
            />
            <button 
              type="submit" 
              className="search-button"
              disabled={loading}
            >
              {loading ? (
                <div className="spinner"></div>
              ) : (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          </div>
        </form>

        {/* Quick commodity buttons */}
        <div className="commodity-chips">
          {commonCommodities.map((commodity) => (
            <button
              key={commodity}
              className={`commodity-chip ${selectedCommodity === commodity ? 'active' : ''}`}
              onClick={() => handleCommodityClick(commodity)}
            >
              {commodity}
            </button>
          ))}
        </div>
      </section>

      {/* Results Section */}
      <section className="results-section">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Searching market prices...</p>
          </div>
        ) : priceData.length > 0 ? (
          <div className="price-results">
            <div className="results-header">
              <h2>Price Results</h2>
              <p>{priceData.length} markets found</p>
            </div>
            
            <div className="price-grid">
              {priceData.map((item, index) => (
                <div key={index} className="price-card">
                  <div className="price-header">
                    <h3 className="commodity-name">{item.commodity}</h3>
                    {getTrendIcon(item.trend)}
                  </div>
                  
                  <div className="price-main">
                    <div className="current-price">₹{item.currentPrice}</div>
                    <div className="price-unit">per kg</div>
                  </div>
                  
                  <div className="price-range">
                    <div className="range-item">
                      <span className="range-label">Min</span>
                      <span className="range-value">₹{item.priceRange.min}</span>
                    </div>
                    <div className="range-item">
                      <span className="range-label">Max</span>
                      <span className="range-value">₹{item.priceRange.max}</span>
                    </div>
                    <div className="range-item">
                      <span className="range-label">Modal</span>
                      <span className="range-value">₹{item.priceRange.modal}</span>
                    </div>
                  </div>
                  
                  <div className="price-footer">
                    <div className={`volatility ${getVolatilityColor(item.volatility)}`}>
                      Volatility: {item.volatility}%
                    </div>
                    <div className="last-updated">
                      Updated: {new Date(item.lastUpdated).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : searchTerm ? (
          <div className="empty-state">
            <p>No price data found for "{searchTerm}"</p>
            <p>Try searching for a different commodity or check your spelling.</p>
          </div>
        ) : (
          <div className="welcome-state">
            <h2>Welcome to Price Discovery</h2>
            <p>Search for any commodity to see current market prices across India.</p>
            <p>Click on the commodity chips above or use the search bar to get started.</p>
          </div>
        )}
      </section>
    </div>
  )
}

export default PriceDiscovery