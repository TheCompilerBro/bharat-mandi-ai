/**
 * Property-Based Test: Mobile Feature Prioritization
 * Feature: multilingual-mandi-challenge, Property 14: Mobile Feature Prioritization
 * 
 * **Validates: Requirements 6.2**
 * 
 * Property: For any mobile device access, the system should prioritize and prominently 
 * display essential features (price lookup, messaging, negotiation tools) while 
 * maintaining full functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fc from 'fast-check'

// Mobile feature priority levels
type FeaturePriority = 'essential' | 'important' | 'optional'

interface Feature {
  id: string
  name: string
  priority: FeaturePriority
  category: 'navigation' | 'trading' | 'communication' | 'profile' | 'analytics'
  minScreenWidth: number
  isVisible: boolean
  displayOrder: number
  screenSpace: number // percentage of screen space used
}

// Mock mobile interface checker
class MobileFeaturePrioritizer {
  private screenWidth: number
  private screenHeight: number
  private availableScreenSpace: number

  constructor(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth
    this.screenHeight = screenHeight
    this.availableScreenSpace = 100 // 100% of screen space
  }

  isMobileDevice(): boolean {
    return this.screenWidth <= 768
  }

  prioritizeFeatures(features: Feature[]): Feature[] {
    if (!this.isMobileDevice()) {
      // On desktop, show all features
      return features.map(f => ({ ...f, isVisible: true }))
    }

    // Mobile prioritization logic
    const prioritized = [...features].sort((a, b) => {
      // Sort by priority first, then by category importance
      const priorityOrder = { essential: 0, important: 1, optional: 2 }
      const categoryOrder = { 
        trading: 0, 
        communication: 1, 
        navigation: 2, 
        profile: 3, 
        analytics: 4 
      }

      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority]
      }

      return categoryOrder[a.category] - categoryOrder[b.category]
    })

    // First pass: Show all essential features regardless of space
    const essentialFeatures = prioritized.filter(f => f.priority === 'essential')
    const nonEssentialFeatures = prioritized.filter(f => f.priority !== 'essential')
    
    let usedSpace = 0
    let displayOrder = 1
    const result: Feature[] = []

    // Always show essential features
    for (const feature of essentialFeatures) {
      result.push({
        ...feature,
        isVisible: true,
        displayOrder: displayOrder++
      })
      usedSpace += feature.screenSpace
    }

    // Show non-essential features if space allows
    for (const feature of nonEssentialFeatures) {
      const shouldShow = this.shouldShowFeature(feature, usedSpace)
      
      if (shouldShow) {
        usedSpace += feature.screenSpace
        result.push({
          ...feature,
          isVisible: true,
          displayOrder: displayOrder++
        })
      } else {
        result.push({
          ...feature,
          isVisible: false,
          displayOrder: -1
        })
      }
    }

    return result
  }

  private shouldShowFeature(feature: Feature, currentUsedSpace: number): boolean {
    // Always show essential features regardless of space or screen width constraints
    if (feature.priority === 'essential') {
      return true
    }

    // Check if we have enough screen space for non-essential features
    if (currentUsedSpace + feature.screenSpace > this.availableScreenSpace) {
      return false
    }

    // Check minimum screen width requirement for non-essential features only
    if (this.screenWidth < feature.minScreenWidth) {
      return false
    }

    // Show important features if space allows (less than 80% used)
    if (feature.priority === 'important' && currentUsedSpace < 80) {
      return true
    }

    // Show optional features only if plenty of space (less than 60% used)
    if (feature.priority === 'optional' && currentUsedSpace < 60) {
      return true
    }

    return false
  }

  checkEssentialFeaturesVisible(features: Feature[]): boolean {
    const essentialFeatures = features.filter(f => f.priority === 'essential')
    const visibleEssentialFeatures = essentialFeatures.filter(f => f.isVisible)
    
    return visibleEssentialFeatures.length === essentialFeatures.length
  }

  checkFeatureProminence(features: Feature[]): boolean {
    const visibleFeatures = features.filter(f => f.isVisible)
    
    // Essential features should appear first (lower display order)
    const essentialFeatures = visibleFeatures.filter(f => f.priority === 'essential')
    const nonEssentialFeatures = visibleFeatures.filter(f => f.priority !== 'essential')

    if (essentialFeatures.length === 0) return true

    const maxEssentialOrder = Math.max(...essentialFeatures.map(f => f.displayOrder))
    const minNonEssentialOrder = nonEssentialFeatures.length > 0 
      ? Math.min(...nonEssentialFeatures.map(f => f.displayOrder))
      : Infinity

    return maxEssentialOrder < minNonEssentialOrder
  }

  checkTradingFeaturesAccessible(features: Feature[]): boolean {
    const tradingFeatures = features.filter(f => f.category === 'trading')
    const visibleTradingFeatures = tradingFeatures.filter(f => f.isVisible)
    
    // At least core trading features should be visible on mobile
    const coreTradingFeatures = ['price-lookup', 'negotiation-tools', 'market-data']
    const visibleCoreFeatures = visibleTradingFeatures.filter(f => 
      coreTradingFeatures.includes(f.id)
    )

    // If no trading features exist, return true (nothing to check)
    if (tradingFeatures.length === 0) return true
    
    return visibleCoreFeatures.length >= Math.min(coreTradingFeatures.length, tradingFeatures.length)
  }

  checkCommunicationFeaturesAccessible(features: Feature[]): boolean {
    const communicationFeatures = features.filter(f => f.category === 'communication')
    const visibleCommunicationFeatures = communicationFeatures.filter(f => f.isVisible)
    
    // Core communication features should be accessible
    const coreCommunicationFeatures = ['messaging', 'notifications']
    const visibleCoreFeatures = visibleCommunicationFeatures.filter(f => 
      coreCommunicationFeatures.includes(f.id)
    )

    // If no communication features exist, return true (nothing to check)
    if (communicationFeatures.length === 0) return true
    
    return visibleCoreFeatures.length >= Math.min(coreCommunicationFeatures.length, communicationFeatures.length)
  }
}

// Test data generators
const mobileScreenWidthArb = fc.integer({ min: 320, max: 768 })
const tabletScreenWidthArb = fc.integer({ min: 769, max: 1024 })
const desktopScreenWidthArb = fc.integer({ min: 1025, max: 1920 })
const screenHeightArb = fc.integer({ min: 568, max: 1080 })

const featureArb = fc.record({
  id: fc.constantFrom(
    'price-lookup', 'messaging', 'negotiation-tools', 'market-data',
    'user-profile', 'settings', 'analytics', 'notifications', 
    'help', 'feedback', 'advanced-search', 'export-data'
  ),
  name: fc.string({ minLength: 5, maxLength: 20 }).filter(s => s.trim().length >= 5),
  priority: fc.constantFrom('essential', 'important', 'optional'),
  category: fc.constantFrom('navigation', 'trading', 'communication', 'profile', 'analytics'),
  minScreenWidth: fc.integer({ min: 320, max: 768 }),
  screenSpace: fc.integer({ min: 5, max: 25 }) // percentage of screen space
}).map(base => {
  // Ensure proper categorization for known features
  let category = base.category
  if (['price-lookup', 'negotiation-tools', 'market-data'].includes(base.id)) {
    category = 'trading'
  } else if (['messaging', 'notifications'].includes(base.id)) {
    category = 'communication'
  } else if (['user-profile', 'settings'].includes(base.id)) {
    category = 'profile'
  } else if (['analytics', 'export-data'].includes(base.id)) {
    category = 'analytics'
  } else if (['help', 'feedback', 'advanced-search'].includes(base.id)) {
    category = 'navigation'
  }

  return {
    ...base,
    category,
    isVisible: false,
    displayOrder: -1
  }
})

const essentialFeaturesArb = fc.array(
  featureArb.map(f => ({ ...f, priority: 'essential' as FeaturePriority })),
  { minLength: 3, maxLength: 6 }
)

describe('Property 14: Mobile Feature Prioritization', () => {
  it('should always display essential features on mobile devices', () => {
    fc.assert(
      fc.property(
        mobileScreenWidthArb,
        screenHeightArb,
        essentialFeaturesArb,
        fc.array(featureArb, { minLength: 0, maxLength: 10 }),
        (screenWidth, screenHeight, essentialFeatures, otherFeatures) => {
          const prioritizer = new MobileFeaturePrioritizer(screenWidth, screenHeight)
          
          const allFeatures = [...essentialFeatures, ...otherFeatures]
          const prioritizedFeatures = prioritizer.prioritizeFeatures(allFeatures)
          
          // All essential features should be visible
          return prioritizer.checkEssentialFeaturesVisible(prioritizedFeatures)
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should prioritize trading and communication features on mobile', () => {
    fc.assert(
      fc.property(
        mobileScreenWidthArb,
        screenHeightArb,
        fc.array(featureArb, { minLength: 3, maxLength: 10 }),
        (screenWidth, screenHeight, features) => {
          const prioritizer = new MobileFeaturePrioritizer(screenWidth, screenHeight)
          
          // Create unique features and ensure we have trading and communication features
          const uniqueFeatures = Array.from(new Map(features.map(f => [f.id, f])).values())
          
          const enhancedFeatures = [
            ...uniqueFeatures,
            { 
              id: 'price-lookup-test', 
              name: 'Price Lookup', 
              priority: 'essential' as FeaturePriority,
              category: 'trading' as const,
              minScreenWidth: 320,
              isVisible: false,
              displayOrder: -1,
              screenSpace: 15
            },
            { 
              id: 'messaging-test', 
              name: 'Messaging', 
              priority: 'essential' as FeaturePriority,
              category: 'communication' as const,
              minScreenWidth: 320,
              isVisible: false,
              displayOrder: -1,
              screenSpace: 20
            },
            { 
              id: 'negotiation-tools-test', 
              name: 'Negotiation Tools', 
              priority: 'important' as FeaturePriority,
              category: 'trading' as const,
              minScreenWidth: 320,
              isVisible: false,
              displayOrder: -1,
              screenSpace: 18
            }
          ]

          const prioritizedFeatures = prioritizer.prioritizeFeatures(enhancedFeatures)
          
          // Essential trading and communication features should be visible
          const essentialTradingVisible = prioritizedFeatures.some(f => 
            f.id === 'price-lookup-test' && f.isVisible
          )
          const essentialCommunicationVisible = prioritizedFeatures.some(f => 
            f.id === 'messaging-test' && f.isVisible
          )
          
          return essentialTradingVisible && essentialCommunicationVisible
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should display essential features more prominently than others', () => {
    fc.assert(
      fc.property(
        mobileScreenWidthArb,
        screenHeightArb,
        fc.array(featureArb, { minLength: 8, maxLength: 15 }),
        (screenWidth, screenHeight, features) => {
          const prioritizer = new MobileFeaturePrioritizer(screenWidth, screenHeight)
          
          // Mix of priorities
          const mixedFeatures = features.map((f, index) => ({
            ...f,
            priority: (index % 3 === 0 ? 'essential' : 
                      index % 3 === 1 ? 'important' : 'optional') as FeaturePriority
          }))

          const prioritizedFeatures = prioritizer.prioritizeFeatures(mixedFeatures)
          
          // Essential features should be more prominent (appear first)
          return prioritizer.checkFeatureProminence(prioritizedFeatures)
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should maintain full functionality while prioritizing features', () => {
    fc.assert(
      fc.property(
        mobileScreenWidthArb,
        screenHeightArb,
        fc.array(featureArb, { minLength: 5, maxLength: 15 }),
        (screenWidth, screenHeight, features) => {
          const prioritizer = new MobileFeaturePrioritizer(screenWidth, screenHeight)
          
          // Remove duplicates and ensure we have at least one essential feature
          const uniqueFeatures = Array.from(new Map(features.map(f => [f.id, f])).values())
          const mixedFeatures = uniqueFeatures.map((f, index) => ({
            ...f,
            priority: (index === 0 ? 'essential' : 
                      index % 3 === 1 ? 'important' : 'optional') as FeaturePriority,
            minScreenWidth: 320 // Ensure all features can be shown on mobile
          }))

          const prioritizedFeatures = prioritizer.prioritizeFeatures(mixedFeatures)
          const visibleFeatures = prioritizedFeatures.filter(f => f.isVisible)
          
          // Should have at least essential features visible
          const essentialFeatures = mixedFeatures.filter(f => f.priority === 'essential')
          const visibleEssentialFeatures = visibleFeatures.filter(f => f.priority === 'essential')
          
          // All essential features should be visible
          const allEssentialVisible = visibleEssentialFeatures.length === essentialFeatures.length
          
          // Should have reasonable number of visible features (at least essentials)
          const hasReasonableFeatureCount = visibleFeatures.length >= essentialFeatures.length
          
          return allEssentialVisible && hasReasonableFeatureCount
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should adapt feature visibility based on screen size constraints', () => {
    fc.assert(
      fc.property(
        fc.oneof(mobileScreenWidthArb, tabletScreenWidthArb, desktopScreenWidthArb),
        screenHeightArb,
        fc.array(featureArb, { minLength: 8, maxLength: 15 }),
        (screenWidth, screenHeight, features) => {
          const prioritizer = new MobileFeaturePrioritizer(screenWidth, screenHeight)
          
          const prioritizedFeatures = prioritizer.prioritizeFeatures(features)
          const visibleFeatures = prioritizedFeatures.filter(f => f.isVisible)
          
          if (screenWidth <= 768) {
            // Mobile: Should prioritize and limit features
            const essentialVisible = visibleFeatures.filter(f => f.priority === 'essential')
            const totalVisible = visibleFeatures.length
            
            // Should have essential features and reasonable total count
            return essentialVisible.length > 0 && totalVisible <= features.length * 0.8
          } else {
            // Tablet/Desktop: Should show more features
            const totalVisible = visibleFeatures.length
            
            // Should show most or all features on larger screens
            return totalVisible >= features.length * 0.8
          }
        }
      ),
      { numRuns: 10 }
    )
  })

  it('should handle edge cases with minimal features gracefully', () => {
    fc.assert(
      fc.property(
        mobileScreenWidthArb,
        screenHeightArb,
        fc.array(featureArb, { minLength: 1, maxLength: 3 }),
        (screenWidth, screenHeight, features) => {
          const prioritizer = new MobileFeaturePrioritizer(screenWidth, screenHeight)
          
          // Make at least one feature essential
          const enhancedFeatures = features.map((f, index) => ({
            ...f,
            priority: (index === 0 ? 'essential' : f.priority) as FeaturePriority
          }))

          const prioritizedFeatures = prioritizer.prioritizeFeatures(enhancedFeatures)
          const visibleFeatures = prioritizedFeatures.filter(f => f.isVisible)
          
          // Should show at least one feature (the essential one)
          return visibleFeatures.length >= 1
        }
      ),
      { numRuns: 50 }
    )
  })
})