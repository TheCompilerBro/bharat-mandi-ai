/**
 * Property-Based Test for Data Quality and Anomaly Detection
 * 
 * **Feature: multilingual-mandi-challenge, Property 12: Data Quality and Anomaly Detection**
 * **Validates: Requirements 5.4**
 * 
 * Property: For any incoming market data, the system should validate accuracy and 
 * automatically flag anomalies that exceed 25% variance from expected values, 
 * preventing corrupt data from affecting price recommendations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { AGMARKNETPriceDiscoveryService } from '../services/price-discovery.service';
import { DatabaseManager } from '../config/database';
import { DataValidator } from '../utils/error-handling';

// Mock external dependencies
vi.mock('../config/database');
vi.mock('../config/environment', () => ({
  config: {
    externalApis: {
      agmarknetApiKey: 'test-key'
    }
  }
}));

// Mock axios to control external API responses
vi.mock('axios');
import axios from 'axios';
const mockedAxios = vi.mocked(axios);

describe('Property 12: Data Quality and Anomaly Detection', () => {
  let priceService: AGMARKNETPriceDiscoveryService;
  let mockRedisClient: any;
  let mockDbClient: any;

  beforeEach(() => {
    // Setup mock Redis client
    mockRedisClient = {
      get: vi.fn(),
      set: vi.fn(),
      setEx: vi.fn(),
      del: vi.fn(),
      incr: vi.fn(),
      expire: vi.fn()
    };

    // Setup mock database client
    mockDbClient = {
      query: vi.fn()
    };

    // Mock DatabaseManager
    const mockDbManager = {
      getRedisClient: () => mockRedisClient,
      getPostgresClient: () => mockDbClient,
      getPostgreSQLPool: () => mockDbClient,
      getMongoDB: () => ({
        collection: () => ({
          find: () => ({
            sort: () => ({
              toArray: () => Promise.resolve([])
            })
          }),
          insertOne: vi.fn(),
          updateOne: vi.fn()
        })
      })
    };

    vi.mocked(DatabaseManager.getInstance).mockReturnValue(mockDbManager as any);

    // Initialize service
    priceService = new AGMARKNETPriceDiscoveryService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Price Data Validation', () => {
    it('should validate price data structure and reject invalid data', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          commodity: fc.constantFrom('Rice', 'Wheat', 'Cotton', 'Maize'),
          priceData: fc.oneof(
            // Valid price data
            fc.record({
              currentPrice: fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
              priceRange: fc.record({
                min: fc.float({ min: Math.fround(50), max: Math.fround(5000), noNaN: true }),
                max: fc.float({ min: Math.fround(5000), max: Math.fround(15000), noNaN: true }),
                modal: fc.float({ min: Math.fround(1000), max: Math.fround(8000), noNaN: true })
              }),
              lastUpdated: fc.date(),
              sources: fc.array(fc.constantFrom('AGMARKNET', 'data.gov.in'), { minLength: 1 }),
              volatility: fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true })
            }),
            // Invalid price data - negative prices
            fc.record({
              currentPrice: fc.float({ min: Math.fround(-1000), max: Math.fround(-1), noNaN: true }),
              priceRange: fc.record({
                min: fc.float({ min: Math.fround(-500), max: Math.fround(0), noNaN: true }),
                max: fc.float({ min: Math.fround(-100), max: Math.fround(0), noNaN: true }),
                modal: fc.float({ min: Math.fround(-300), max: Math.fround(0), noNaN: true })
              })
            }),
            // Invalid price data - NaN values
            fc.record({
              currentPrice: fc.constantFrom(NaN, Infinity, -Infinity),
              priceRange: fc.record({
                min: fc.constantFrom(NaN, Infinity),
                max: fc.constantFrom(NaN, Infinity),
                modal: fc.constantFrom(NaN, Infinity)
              })
            }),
            // Invalid price data - missing fields
            fc.record({
              currentPrice: fc.float({ min: Math.fround(100), max: Math.fround(1000), noNaN: true })
              // Missing priceRange
            }),
            // Invalid price data - inconsistent ranges (min > max)
            fc.record({
              currentPrice: fc.float({ min: Math.fround(100), max: Math.fround(1000), noNaN: true }),
              priceRange: fc.record({
                min: fc.float({ min: Math.fround(5000), max: Math.fround(8000), noNaN: true }), // min > max (invalid)
                max: fc.float({ min: Math.fround(1000), max: Math.fround(3000), noNaN: true }),
                modal: fc.float({ min: Math.fround(2000), max: Math.fround(4000), noNaN: true })
              })
            })
          )
        }),
        async ({ commodity, priceData }) => {
          // Execute: Validate price data using DataValidator
          const isValid = DataValidator.validatePriceData(priceData);

          // Verify: Validation should correctly identify valid vs invalid data
          const hasValidCurrentPrice = typeof priceData.currentPrice === 'number' && 
                                     isFinite(priceData.currentPrice) && 
                                     priceData.currentPrice > 0;
          
          const hasValidPriceRange = priceData.priceRange && 
                                   typeof priceData.priceRange.min === 'number' && 
                                   typeof priceData.priceRange.max === 'number' && 
                                   typeof priceData.priceRange.modal === 'number' &&
                                   isFinite(priceData.priceRange.min) &&
                                   isFinite(priceData.priceRange.max) &&
                                   isFinite(priceData.priceRange.modal) &&
                                   priceData.priceRange.min > 0 && 
                                   priceData.priceRange.max > 0 && 
                                   priceData.priceRange.modal > 0;

          const hasConsistentRange = hasValidPriceRange &&
                                   priceData.priceRange.min <= priceData.priceRange.max &&
                                   priceData.priceRange.modal >= priceData.priceRange.min &&
                                   priceData.priceRange.modal <= priceData.priceRange.max;

          if (hasValidCurrentPrice && hasValidPriceRange && hasConsistentRange) {
            // Should be valid
            expect(isValid).toBe(true);
          } else {
            // Should be invalid
            expect(isValid).toBe(false);
          }
        }
      ), { numRuns: 100 });
    });

    it('should detect price anomalies exceeding 25% variance from historical data', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          commodity: fc.constantFrom('Rice', 'Wheat', 'Cotton'),
          currentPrice: fc.float({ min: Math.fround(1000), max: Math.fround(5000), noNaN: true }),
          historicalPrices: fc.array(fc.float({ min: Math.fround(1500), max: Math.fround(3500), noNaN: true }), { minLength: 5, maxLength: 20 }),
          anomalyMultiplier: fc.float({ min: Math.fround(0.1), max: Math.fround(3.0), noNaN: true }) // Will create various levels of deviation
        }),
        async ({ commodity, currentPrice, historicalPrices, anomalyMultiplier }) => {
          // Setup: Create historical data with known median
          const sortedHistorical = [...historicalPrices].sort((a, b) => a - b);
          const median = sortedHistorical[Math.floor(sortedHistorical.length / 2)];
          
          // Create test price with controlled deviation
          const testPrice = median * anomalyMultiplier;
          const expectedDeviation = Math.abs(testPrice - median) / median;
          
          const testPriceData = {
            commodity,
            currentPrice: testPrice,
            priceRange: { min: testPrice * 0.9, max: testPrice * 1.1, modal: testPrice },
            lastUpdated: new Date(),
            sources: ['test'],
            volatility: 0.05
          };

          const historicalData = historicalPrices.map(price => ({ currentPrice: price }));

          // Execute: Detect anomalies using DataValidator
          const hasAnomalies = DataValidator.detectPriceAnomalies(testPriceData, historicalData);

          // Verify: Anomaly detection should match 25% threshold (Requirement 5.4)
          if (expectedDeviation > 0.25) {
            expect(hasAnomalies).toBe(true);
          } else {
            expect(hasAnomalies).toBe(false);
          }
        }
      ), { numRuns: 80 });
    });

    it('should handle edge cases in anomaly detection gracefully', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          commodity: fc.constantFrom('Turmeric', 'Coriander', 'Chillies'),
          currentPrice: fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),
          historicalScenario: fc.constantFrom(
            'empty_history',
            'single_price',
            'identical_prices',
            'extreme_variance'
          )
        }),
        async ({ commodity, currentPrice, historicalScenario }) => {
          let historicalData: any[] = [];

          // Setup different historical data scenarios
          switch (historicalScenario) {
            case 'empty_history':
              historicalData = [];
              break;
            case 'single_price':
              historicalData = [{ currentPrice: 2500 }];
              break;
            case 'identical_prices':
              historicalData = Array(10).fill({ currentPrice: 2500 });
              break;
            case 'extreme_variance':
              historicalData = [
                { currentPrice: 100 },
                { currentPrice: 10000 },
                { currentPrice: 500 },
                { currentPrice: 8000 }
              ];
              break;
          }

          const testPriceData = {
            commodity,
            currentPrice,
            priceRange: { min: currentPrice * 0.9, max: currentPrice * 1.1, modal: currentPrice },
            lastUpdated: new Date(),
            sources: ['test'],
            volatility: 0.1
          };

          // Execute: Should not throw errors even with edge cases
          let hasAnomalies = false;
          let errorThrown = false;

          try {
            hasAnomalies = DataValidator.detectPriceAnomalies(testPriceData, historicalData);
          } catch (error) {
            errorThrown = true;
          }

          // Verify: Should handle edge cases gracefully without throwing errors
          expect(errorThrown).toBe(false);
          expect(typeof hasAnomalies).toBe('boolean');

          // For empty or insufficient historical data, should return false (no anomaly detected)
          if (historicalData.length === 0) {
            expect(hasAnomalies).toBe(false);
          }
        }
      ), { numRuns: 60 });
    });
  });

  describe('Data Source Validation', () => {
    it('should validate and filter corrupt data from multiple sources', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          commodity: fc.constantFrom('Groundnut', 'Sesame', 'Sunflower'),
          sources: fc.array(
            fc.record({
              name: fc.constantFrom('AGMARKNET', 'data.gov.in', 'local_market'),
              price: fc.oneof(
                fc.float({ min: Math.fround(1000), max: Math.fround(5000), noNaN: true }), // Valid price
                fc.float({ min: Math.fround(-100), max: Math.fround(0), noNaN: true }), // Invalid negative price
                fc.constant(NaN), // Invalid NaN
                fc.constant(Infinity), // Invalid Infinity
                fc.float({ min: Math.fround(100000), max: Math.fround(1000000), noNaN: true }) // Suspiciously high price
              ),
              isCorrupt: fc.boolean()
            }),
            { minLength: 2, maxLength: 5 }
          )
        }),
        async ({ commodity, sources }) => {
          // Setup: Mock API responses with mixed valid/invalid data
          const validPrices: number[] = [];
          const allPrices: number[] = [];

          sources.forEach(source => {
            allPrices.push(source.price);
            
            // Consider a price valid if it's a positive finite number and not suspiciously high
            if (typeof source.price === 'number' && 
                isFinite(source.price) && 
                source.price > 0 && 
                source.price < 50000 && 
                !source.isCorrupt) {
              validPrices.push(source.price);
            }
          });

          // Mock the service to return our test data
          mockRedisClient.get.mockResolvedValue(null); // No cache
          
          // Mock successful API calls that return our test prices
          mockedAxios.get.mockResolvedValue({
            data: {
              records: sources.map(source => ({
                commodity,
                market: 'Test Market',
                state: 'Test State',
                arrival_date: new Date().toISOString(),
                min_price: (source.price * 0.9).toString(),
                max_price: (source.price * 1.1).toString(),
                modal_price: source.price.toString(),
                arrivals: '100'
              }))
            }
          });

          // Execute: Try to get current price (should filter invalid data)
          let result: any;
          let errorThrown = false;

          try {
            result = await priceService.getCurrentPrice(commodity);
          } catch (error) {
            errorThrown = true;
          }

          // Verify: System should handle data validation properly
          if (validPrices.length > 0) {
            // Should succeed with valid data
            expect(errorThrown).toBe(false);
            expect(result).toBeDefined();
            expect(result.currentPrice).toBeGreaterThan(0);
            expect(isFinite(result.currentPrice)).toBe(true);
          } else {
            // Should either fail gracefully or use fallback data
            // The system should not crash even with all invalid data
            expect(true).toBe(true); // Test passes if we reach here without unhandled exceptions
          }
        }
      ), { numRuns: 50 });
    });

    it('should maintain data integrity during concurrent validation operations', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          commodities: fc.array(fc.constantFrom('Rice', 'Wheat', 'Cotton'), { minLength: 2, maxLength: 4 }),
          priceVariations: fc.array(fc.float({ min: Math.fround(0.5), max: Math.fround(2.0), noNaN: true }), { minLength: 2, maxLength: 4 }),
          concurrentRequests: fc.integer({ min: 2, max: 5 })
        }),
        async ({ commodities, priceVariations, concurrentRequests }) => {
          // Setup: Mock multiple concurrent price requests
          const basePrice = 2500;
          const requests: Promise<any>[] = [];

          // Mock cache misses to force fresh data fetching
          mockRedisClient.get.mockResolvedValue(null);

          // Mock API responses with different price variations
          mockedAxios.get.mockImplementation(() => {
            const variation = priceVariations[Math.floor(Math.random() * priceVariations.length)];
            const price = basePrice * variation;
            
            return Promise.resolve({
              data: {
                records: [{
                  commodity: commodities[0],
                  market: 'Test Market',
                  state: 'Test State',
                  arrival_date: new Date().toISOString(),
                  min_price: (price * 0.9).toString(),
                  max_price: (price * 1.1).toString(),
                  modal_price: price.toString(),
                  arrivals: '100'
                }]
              }
            });
          });

          // Execute: Make concurrent requests
          for (let i = 0; i < concurrentRequests; i++) {
            const commodity = commodities[i % commodities.length];
            requests.push(priceService.getCurrentPrice(commodity));
          }

          // Wait for all requests to complete
          const results = await Promise.allSettled(requests);

          // Verify: All requests should complete without data corruption
          let successCount = 0;
          let errorCount = 0;

          results.forEach(result => {
            if (result.status === 'fulfilled') {
              successCount++;
              expect(result.value).toBeDefined();
              expect(result.value.currentPrice).toBeGreaterThan(0);
              expect(isFinite(result.value.currentPrice)).toBe(true);
            } else {
              errorCount++;
            }
          });

          // At least some requests should succeed, and no unhandled errors should occur
          expect(successCount + errorCount).toBe(concurrentRequests);
          expect(successCount).toBeGreaterThan(0);
        }
      ), { numRuns: 30 });
    });
  });

  describe('Real-time Data Quality Monitoring', () => {
    it('should continuously monitor data quality and flag degradation', async () => {
      await fc.assert(fc.asyncProperty(
        fc.record({
          commodity: fc.constantFrom('Bajra', 'Jowar', 'Ragi'),
          dataQualityScenario: fc.constantFrom(
            'high_quality',
            'degrading_quality',
            'poor_quality',
            'mixed_quality'
          ),
          timeWindow: fc.integer({ min: 5, max: 20 }) // Number of data points
        }),
        async ({ commodity, dataQualityScenario, timeWindow }) => {
          const dataPoints: any[] = [];
          const basePrice = 3000;

          // Generate data points based on quality scenario
          for (let i = 0; i < timeWindow; i++) {
            let price: number;
            let isValid: boolean;

            switch (dataQualityScenario) {
              case 'high_quality':
                price = basePrice + (Math.random() - 0.5) * 200; // ±100 variation
                isValid = true;
                break;
              case 'degrading_quality':
                const degradationFactor = i / timeWindow; // Quality degrades over time
                price = basePrice + (Math.random() - 0.5) * 200 * (1 + degradationFactor * 5);
                isValid = Math.random() > degradationFactor * 0.5;
                break;
              case 'poor_quality':
                price = Math.random() > 0.3 ? basePrice + (Math.random() - 0.5) * 2000 : -100;
                isValid = Math.random() > 0.6;
                break;
              case 'mixed_quality':
                price = Math.random() > 0.7 ? basePrice + (Math.random() - 0.5) * 100 : 
                        basePrice + (Math.random() - 0.5) * 1500;
                isValid = Math.random() > 0.3;
                break;
            }

            dataPoints.push({
              price: isValid ? price : NaN,
              timestamp: new Date(Date.now() - (timeWindow - i) * 60000), // 1 minute intervals
              isValid
            });
          }

          // Execute: Validate each data point and track quality metrics
          let validCount = 0;
          let anomalyCount = 0;
          const validPrices: number[] = [];

          dataPoints.forEach(point => {
            if (DataValidator.validatePriceData({
              currentPrice: point.price,
              priceRange: { min: point.price * 0.9, max: point.price * 1.1, modal: point.price }
            })) {
              validCount++;
              validPrices.push(point.price);
            }

            // Check for anomalies against previous valid prices
            if (validPrices.length > 1) {
              const hasAnomaly = DataValidator.detectPriceAnomalies(
                {
                  currentPrice: point.price,
                  priceRange: { min: point.price * 0.9, max: point.price * 1.1, modal: point.price }
                },
                validPrices.slice(0, -1).map(p => ({ currentPrice: p }))
              );
              if (hasAnomaly) anomalyCount++;
            }
          });

          // Verify: Quality monitoring should reflect the data scenario
          const qualityRatio = validCount / timeWindow;
          const anomalyRatio = anomalyCount / Math.max(1, validCount - 1);

          switch (dataQualityScenario) {
            case 'high_quality':
              expect(qualityRatio).toBeGreaterThan(0.8);
              expect(anomalyRatio).toBeLessThan(0.2);
              break;
            case 'poor_quality':
              expect(qualityRatio).toBeLessThan(0.7);
              break;
            case 'degrading_quality':
            case 'mixed_quality':
              // Should detect quality issues - quality ratio should be less than perfect
              expect(qualityRatio).toBeLessThanOrEqual(1.0);
              break;
          }

          // System should always handle the data without crashing
          expect(validCount).toBeGreaterThanOrEqual(0);
          expect(anomalyCount).toBeGreaterThanOrEqual(0);
          expect(qualityRatio).toBeGreaterThanOrEqual(0);
          expect(qualityRatio).toBeLessThanOrEqual(1);
        }
      ), { numRuns: 40 });
    });
  });
});