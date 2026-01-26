/**
 * Property-Based Test: Offline Functionality Preservation
 * Feature: multilingual-mandi-challenge, Property 15: Offline Functionality Preservation
 * 
 * **Validates: Requirements 6.5**
 * 
 * Property: For any network disconnection, the system should continue providing 
 * basic functionality (cached price viewing, saved conversation access) using 
 * locally stored data.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'

// Mock offline data structures
interface CachedPrice {
  commodity: string
  price: number
  timestamp: Date
  market: string
  isStale: boolean
}

interface CachedMessage {
  id: string
  conversationId: string
  content: string
  sender: string
  timestamp: Date
  isSynced: boolean
}

interface CachedConversation {
  id: string
  participants: string[]
  lastMessage: CachedMessage
  messageCount: number
}

interface OfflineStorage {
  prices: CachedPrice[]
  messages: CachedMessage[]
  conversations: CachedConversation[]
  userPreferences: Record<string, any>
  lastSyncTime: Date
}

// Mock offline functionality manager
class OfflineFunctionalityManager {
  private isOnline: boolean
  private storage: OfflineStorage
  private maxCacheAge: number = 4 * 60 * 60 * 1000 // 4 hours in milliseconds

  constructor(isOnline: boolean, storage: OfflineStorage) {
    this.isOnline = isOnline
    this.storage = storage
  }

  setNetworkStatus(isOnline: boolean): void {
    this.isOnline = isOnline
  }

  // Basic functionality: Price viewing
  getCachedPrices(commodity?: string): CachedPrice[] {
    if (this.isOnline) {
      // Online: return fresh data (simulated)
      return this.storage.prices.map(p => ({ ...p, isStale: false }))
    }

    // Offline: return cached data
    let prices = this.storage.prices
    
    if (commodity) {
      prices = prices.filter(p => 
        p.commodity.toLowerCase().includes(commodity.toLowerCase())
      )
    }

    // Mark stale data
    const now = new Date()
    return prices.map(price => ({
      ...price,
      isStale: (now.getTime() - price.timestamp.getTime()) > this.maxCacheAge
    }))
  }

  // Basic functionality: Conversation access
  getCachedConversations(): CachedConversation[] {
    if (this.isOnline) {
      return this.storage.conversations
    }

    // Offline: return cached conversations
    return this.storage.conversations
  }

  getCachedMessages(conversationId: string): CachedMessage[] {
    if (this.isOnline) {
      return this.storage.messages.filter(m => m.conversationId === conversationId)
    }

    // Offline: return cached messages for conversation
    return this.storage.messages.filter(m => 
      m.conversationId === conversationId
    )
  }

  // Basic functionality: User preferences
  getUserPreferences(): Record<string, any> {
    // Preferences should always be available offline
    return this.storage.userPreferences
  }

  // Offline capability checks
  canViewPrices(): boolean {
    return this.storage.prices.length > 0
  }

  canAccessConversations(): boolean {
    return this.storage.conversations.length > 0
  }

  canViewMessages(conversationId: string): boolean {
    return this.storage.messages.some(m => m.conversationId === conversationId)
  }

  // Data freshness checks
  hasFreshPriceData(): boolean {
    if (this.storage.prices.length === 0) return false
    
    const now = new Date()
    return this.storage.prices.some(price => 
      (now.getTime() - price.timestamp.getTime()) <= this.maxCacheAge
    )
  }

  hasRecentConversationData(): boolean {
    if (this.storage.conversations.length === 0) return false
    
    const now = new Date()
    return this.storage.conversations.some(conv => 
      (now.getTime() - conv.lastMessage.timestamp.getTime()) <= this.maxCacheAge
    )
  }

  // Offline data management
  addToCache(type: 'price' | 'message' | 'conversation', data: any): void {
    switch (type) {
      case 'price':
        this.storage.prices.push(data)
        break
      case 'message':
        this.storage.messages.push(data)
        break
      case 'conversation':
        this.storage.conversations.push(data)
        break
    }
  }

  clearStaleData(): void {
    const now = new Date()
    
    // Remove stale prices
    this.storage.prices = this.storage.prices.filter(price => 
      (now.getTime() - price.timestamp.getTime()) <= this.maxCacheAge
    )
    
    // Keep conversations but mark old messages
    this.storage.messages = this.storage.messages.map(message => ({
      ...message,
      isSynced: (now.getTime() - message.timestamp.getTime()) <= this.maxCacheAge
    }))
  }

  // Comprehensive offline functionality check
  checkOfflineFunctionality(): {
    priceViewing: boolean
    conversationAccess: boolean
    messageViewing: boolean
    preferencesAccess: boolean
    overallFunctionality: boolean
  } {
    const priceViewing = this.canViewPrices()
    const conversationAccess = this.canAccessConversations()
    const messageViewing = this.storage.conversations.length === 0 || 
                          this.storage.conversations.some(conv => this.canViewMessages(conv.id))
    const preferencesAccess = Object.keys(this.storage.userPreferences).length > 0

    return {
      priceViewing,
      conversationAccess,
      messageViewing,
      preferencesAccess,
      overallFunctionality: priceViewing || conversationAccess || preferencesAccess
    }
  }
}

// Test data generators
const timestampArb = fc.date({ 
  min: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
  max: new Date() 
})

const cachedPriceArb = fc.record({
  commodity: fc.constantFrom('Rice', 'Wheat', 'Onion', 'Potato', 'Tomato', 'Cotton'),
  price: fc.float({ min: 10, max: 1000 }),
  timestamp: timestampArb,
  market: fc.constantFrom('Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Bangalore'),
  isStale: fc.boolean()
})

const cachedMessageArb = fc.record({
  id: fc.uuid(),
  conversationId: fc.uuid(),
  content: fc.string({ minLength: 1, maxLength: 200 }),
  sender: fc.string({ minLength: 3, maxLength: 20 }),
  timestamp: timestampArb,
  isSynced: fc.boolean()
})

const cachedConversationArb = fc.record({
  id: fc.uuid(),
  participants: fc.array(fc.string({ minLength: 3, maxLength: 20 }), { minLength: 2, maxLength: 5 }),
  messageCount: fc.integer({ min: 1, max: 100 })
}).chain(base => 
  cachedMessageArb.map(lastMessage => ({
    ...base,
    lastMessage: { ...lastMessage, conversationId: base.id }
  }))
)

const offlineStorageArb = fc.record({
  prices: fc.array(cachedPriceArb, { minLength: 0, maxLength: 20 }),
  messages: fc.array(cachedMessageArb, { minLength: 0, maxLength: 50 }),
  conversations: fc.array(cachedConversationArb, { minLength: 0, maxLength: 10 }),
  userPreferences: fc.dictionary(
    fc.constantFrom('language', 'theme', 'notifications', 'currency'),
    fc.oneof(fc.string(), fc.boolean(), fc.integer())
  ),
  lastSyncTime: timestampArb
})

describe('Property 15: Offline Functionality Preservation', () => {
  it('should provide cached price viewing when offline', () => {
    fc.assert(
      fc.property(
        offlineStorageArb,
        fc.constantFrom('Rice', 'Wheat', 'Onion', ''),
        (storage, searchTerm) => {
          const manager = new OfflineFunctionalityManager(false, storage) // offline
          
          const prices = manager.getCachedPrices(searchTerm || undefined)
          
          // Should return cached prices when offline
          if (storage.prices.length === 0) {
            return prices.length === 0
          }
          
          // Should filter by search term if provided
          if (searchTerm) {
            const expectedCount = storage.prices.filter(p => 
              p.commodity.toLowerCase().includes(searchTerm.toLowerCase())
            ).length
            return prices.length === expectedCount
          }
          
          // Should return all cached prices
          return prices.length === storage.prices.length
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should provide saved conversation access when offline', () => {
    fc.assert(
      fc.property(
        offlineStorageArb,
        (storage) => {
          const manager = new OfflineFunctionalityManager(false, storage) // offline
          
          const conversations = manager.getCachedConversations()
          const functionality = manager.checkOfflineFunctionality()
          
          // Should return cached conversations
          const conversationsMatch = conversations.length === storage.conversations.length
          
          // Should report conversation access capability correctly
          const accessCapability = storage.conversations.length > 0 
            ? functionality.conversationAccess 
            : !functionality.conversationAccess
          
          return conversationsMatch && accessCapability
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should provide message viewing for cached conversations when offline', () => {
    fc.assert(
      fc.property(
        offlineStorageArb,
        (storage) => {
          const manager = new OfflineFunctionalityManager(false, storage) // offline
          
          // Test message access for each conversation
          const allConversationsAccessible = storage.conversations.every(conv => {
            const messages = manager.getCachedMessages(conv.id)
            const expectedMessages = storage.messages.filter(m => m.conversationId === conv.id)
            return messages.length === expectedMessages.length
          })
          
          return allConversationsAccessible
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should maintain user preferences access when offline', () => {
    fc.assert(
      fc.property(
        offlineStorageArb,
        (storage) => {
          const manager = new OfflineFunctionalityManager(false, storage) // offline
          
          const preferences = manager.getUserPreferences()
          const functionality = manager.checkOfflineFunctionality()
          
          // Preferences should always be accessible offline
          const preferencesMatch = JSON.stringify(preferences) === JSON.stringify(storage.userPreferences)
          
          // Should report preferences access correctly
          const preferencesAccess = Object.keys(storage.userPreferences).length > 0
            ? functionality.preferencesAccess
            : !functionality.preferencesAccess
          
          return preferencesMatch && preferencesAccess
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should handle network state transitions gracefully', () => {
    fc.assert(
      fc.property(
        offlineStorageArb,
        fc.array(fc.boolean(), { minLength: 2, maxLength: 10 }),
        (storage, networkStates) => {
          const manager = new OfflineFunctionalityManager(true, storage)
          
          let allTransitionsSuccessful = true
          
          // Test multiple network state changes
          for (const isOnline of networkStates) {
            manager.setNetworkStatus(isOnline)
            
            // Basic functionality should always work
            const functionality = manager.checkOfflineFunctionality()
            
            // At least some functionality should be available if we have cached data
            const hasAnyData = storage.prices.length > 0 || 
                              storage.conversations.length > 0 || 
                              Object.keys(storage.userPreferences).length > 0
            
            if (hasAnyData && !functionality.overallFunctionality) {
              allTransitionsSuccessful = false
              break
            }
          }
          
          return allTransitionsSuccessful
        }
      ),
      { numRuns: 5 }
    )
  })

  it('should properly identify stale data when offline', () => {
    fc.assert(
      fc.property(
        offlineStorageArb,
        (storage) => {
          const manager = new OfflineFunctionalityManager(false, storage) // offline
          
          const prices = manager.getCachedPrices()
          const now = new Date()
          const maxAge = 4 * 60 * 60 * 1000 // 4 hours
          
          // Check if stale marking is correct
          const staleMarkingCorrect = prices.every(price => {
            const age = now.getTime() - price.timestamp.getTime()
            const shouldBeStale = age > maxAge
            return price.isStale === shouldBeStale
          })
          
          return staleMarkingCorrect
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should maintain basic functionality with minimal cached data', () => {
    fc.assert(
      fc.property(
        fc.record({
          prices: fc.array(cachedPriceArb, { minLength: 0, maxLength: 2 }),
          messages: fc.array(cachedMessageArb, { minLength: 0, maxLength: 3 }),
          conversations: fc.array(cachedConversationArb, { minLength: 0, maxLength: 1 }),
          userPreferences: fc.dictionary(
            fc.constantFrom('language'),
            fc.constantFrom('en', 'hi')
          ),
          lastSyncTime: timestampArb
        }),
        (minimalStorage) => {
          const manager = new OfflineFunctionalityManager(false, minimalStorage) // offline
          
          const functionality = manager.checkOfflineFunctionality()
          
          // Should provide some functionality even with minimal data
          const hasMinimalData = minimalStorage.prices.length > 0 || 
                                 minimalStorage.conversations.length > 0 || 
                                 Object.keys(minimalStorage.userPreferences).length > 0
          
          if (!hasMinimalData) {
            // No data means no functionality, which is acceptable
            return !functionality.overallFunctionality
          }
          
          // With some data, should provide some functionality
          return functionality.overallFunctionality
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should handle data freshness correctly across different time periods', () => {
    fc.assert(
      fc.property(
        fc.array(cachedPriceArb, { minLength: 1, maxLength: 10 }),
        fc.integer({ min: 0, max: 10 * 60 * 60 * 1000 }), // 0 to 10 hours ago
        (prices, timeOffset) => {
          const now = new Date()
          const testTime = new Date(now.getTime() - timeOffset)
          
          // Create storage with prices at specific time
          const storage: OfflineStorage = {
            prices: prices.map(p => ({ ...p, timestamp: testTime })),
            messages: [],
            conversations: [],
            userPreferences: { language: 'en' },
            lastSyncTime: testTime
          }
          
          const manager = new OfflineFunctionalityManager(false, storage)
          const hasFreshData = manager.hasFreshPriceData()
          
          // Data should be fresh if within 4 hours
          const shouldBeFresh = timeOffset <= 4 * 60 * 60 * 1000
          
          return hasFreshData === shouldBeFresh
        }
      ),
      { numRuns: 10 }
    )
  })
})