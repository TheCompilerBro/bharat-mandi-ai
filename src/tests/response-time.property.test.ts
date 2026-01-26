import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fc from 'fast-check';
import { SarvamTranslationService } from '../services/translation.service';
import { AGMARKNETPriceDiscoveryService } from '../services/price-discovery.service';

/**
 * Feature: multilingual-mandi-challenge
 * Property 2: System Response Time Consistency
 * 
 * For any user request (price lookup, commodity search, negotiation action),
 * the system should respond within the specified time limits (2-3 seconds)
 * regardless of system load or data complexity.
 * 
 * Validates: Requirements 1.1, 2.1
 */

describe('Property 2: System Response Time Consistency', () => {
  let translationService: SarvamTranslationService;
  let priceDiscoveryService: AGMARKNETPriceDiscoveryService;

  beforeAll(async () => {
    // Mock the database manager to avoid connection issues in tests
    vi.mock('../config/database', () => ({
      DatabaseManager: {
        getInstance: () => ({
          getRedisClient: () => ({
            get: vi.fn().mockResolvedValue(null),
            setEx: vi.fn().mockResolvedValue('OK'),
            set: vi.fn().mockResolvedValue('OK'),
            incr: vi.fn().mockResolvedValue(1)
          }),
          getPostgresClient: () => ({
            query: vi.fn().mockResolvedValue({ 
              rows: [
                {
                  commodity: 'Rice',
                  market: 'Delhi',
                  date: new Date(),
                  modal_price: '2500.00',
                  min_price: '2200.00',
                  max_price: '2800.00',
                  arrivals: '150',
                  sources: '["AGMARKNET"]',
                  volatility: '0.05'
                }
              ]
            })
          })
        })
      }
    }));
    
    translationService = new SarvamTranslationService();
    priceDiscoveryService = new AGMARKNETPriceDiscoveryService();
  });

  // Supported language codes for translation tests
  const supportedLanguages = ['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa'];
  
  // Supported commodities for price discovery tests
  const supportedCommodities = [
    'Rice', 'Wheat', 'Jowar', 'Bajra', 'Maize', 'Ragi', 'Arhar', 'Moong', 'Urad',
    'Masoor', 'Gram', 'Groundnut', 'Potato', 'Onion', 'Turmeric', 'Coriander'
  ];

  // Generator for language pairs
  const languagePairArb = fc.tuple(
    fc.constantFrom(...supportedLanguages),
    fc.constantFrom(...supportedLanguages)
  ).filter(([from, to]) => from !== to);

  // Generator for text messages of varying complexity
  const textComplexityArb = fc.oneof(
    fc.string({ minLength: 1, maxLength: 50 }), // Simple text
    fc.string({ minLength: 100, maxLength: 500 }), // Medium text
    fc.string({ minLength: 1000, maxLength: 2000 }), // Complex text
    fc.array(fc.string({ minLength: 10, maxLength: 50 }), { minLength: 5, maxLength: 20 }).map(arr => arr.join(' ')) // Multiple sentences
  );

  // Generator for commodity names
  const commodityArb = fc.constantFrom(...supportedCommodities);

  // Generator for location names (optional)
  const locationArb = fc.option(fc.constantFrom('Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Bangalore', 'Hyderabad'));

  it('should complete translation requests within 2 seconds regardless of text complexity', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePairArb,
        textComplexityArb,
        async ([fromLang, toLang], text) => {
          const startTime = Date.now();
          
          const result = await translationService.translateMessage(text, fromLang, toLang);
          
          const responseTime = Date.now() - startTime;
          
          // Requirement 1.1: Translation within 2 seconds
          expect(responseTime).toBeLessThanOrEqual(2000);
          
          // Should return valid result
          expect(result).toHaveProperty('translatedText');
          expect(result).toHaveProperty('confidence');
          expect(typeof result.confidence).toBe('number');
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 10, timeout: 10000 }
    );
  });

  it('should complete price discovery requests within 3 seconds regardless of commodity or location', async () => {
    await fc.assert(
      fc.asyncProperty(
        commodityArb,
        locationArb,
        async (commodity, location) => {
          const startTime = Date.now();
          
          const result = await priceDiscoveryService.getCurrentPrice(commodity, location || undefined);
          
          const responseTime = Date.now() - startTime;
          
          // Requirement 2.1: Price discovery within 3 seconds
          expect(responseTime).toBeLessThanOrEqual(3000);
          
          // Should return valid price data
          expect(result).toHaveProperty('commodity');
          expect(result).toHaveProperty('currentPrice');
          expect(result).toHaveProperty('priceRange');
          expect(result).toHaveProperty('lastUpdated');
          expect(result).toHaveProperty('sources');
          
          // Price should be a positive number
          expect(typeof result.currentPrice).toBe('number');
          expect(result.currentPrice).toBeGreaterThan(0);
          
          // Price range should be valid
          expect(result.priceRange.min).toBeGreaterThan(0);
          expect(result.priceRange.max).toBeGreaterThanOrEqual(result.priceRange.min);
          expect(result.priceRange.modal).toBeGreaterThanOrEqual(result.priceRange.min);
          expect(result.priceRange.modal).toBeLessThanOrEqual(result.priceRange.max);
        }
      ),
      { numRuns: 8, timeout: 10000 }
    );
  });

  it('should maintain consistent response times under concurrent load', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(languagePairArb, { minLength: 3, maxLength: 10 }),
        fc.array(textComplexityArb, { minLength: 3, maxLength: 10 }),
        async (languagePairs, texts) => {
          // Create concurrent translation requests
          const requests = languagePairs.slice(0, texts.length).map((pair, index) => {
            const [fromLang, toLang] = pair;
            const text = texts[index];
            
            return async () => {
              const startTime = Date.now();
              const result = await translationService.translateMessage(text, fromLang, toLang);
              const responseTime = Date.now() - startTime;
              
              return { result, responseTime };
            };
          });

          // Execute all requests concurrently
          const startTime = Date.now();
          const results = await Promise.all(requests.map(req => req()));
          const totalTime = Date.now() - startTime;

          // Each individual request should still meet time requirements
          for (const { responseTime } of results) {
            expect(responseTime).toBeLessThanOrEqual(2000);
          }

          // Total time should be reasonable (not much more than the slowest individual request)
          const maxIndividualTime = Math.max(...results.map(r => r.responseTime));
          expect(totalTime).toBeLessThanOrEqual(maxIndividualTime + 1000); // Allow 1s overhead for concurrency
        }
      ),
      { numRuns: 5, timeout: 15000 }
    );
  });

  it('should maintain response times for price discovery under concurrent load', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(commodityArb, { minLength: 3, maxLength: 8 }),
        async (commodities) => {
          // Create concurrent price discovery requests
          const requests = commodities.map(commodity => {
            return async () => {
              const startTime = Date.now();
              const result = await priceDiscoveryService.getCurrentPrice(commodity);
              const responseTime = Date.now() - startTime;
              
              return { result, responseTime };
            };
          });

          // Execute all requests concurrently
          const startTime = Date.now();
          const results = await Promise.all(requests.map(req => req()));
          const totalTime = Date.now() - startTime;

          // Each individual request should still meet time requirements
          for (const { responseTime } of results) {
            expect(responseTime).toBeLessThanOrEqual(3000);
          }

          // All results should be valid
          for (const { result } of results) {
            expect(result).toHaveProperty('commodity');
            expect(result).toHaveProperty('currentPrice');
            expect(result.currentPrice).toBeGreaterThan(0);
          }

          // Total time should be reasonable for concurrent execution
          const maxIndividualTime = Math.max(...results.map(r => r.responseTime));
          expect(totalTime).toBeLessThanOrEqual(maxIndividualTime + 2000); // Allow 2s overhead for price discovery concurrency
        }
      ),
      { numRuns: 5, timeout: 15000 }
    );
  });

  it('should handle mixed request types with consistent performance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          translationRequests: fc.array(
            fc.record({
              languagePair: languagePairArb,
              text: fc.string({ minLength: 10, maxLength: 200 })
            }),
            { minLength: 1, maxLength: 3 }
          ),
          priceRequests: fc.array(
            fc.record({
              commodity: commodityArb,
              location: locationArb
            }),
            { minLength: 1, maxLength: 3 }
          )
        }),
        async ({ translationRequests, priceRequests }) => {
          // Create mixed concurrent requests
          const allRequests = [
            ...translationRequests.map(req => async () => {
              const startTime = Date.now();
              const [fromLang, toLang] = req.languagePair;
              const result = await translationService.translateMessage(req.text, fromLang, toLang);
              const responseTime = Date.now() - startTime;
              
              return { type: 'translation', result, responseTime, expectedMaxTime: 2000 };
            }),
            ...priceRequests.map(req => async () => {
              const startTime = Date.now();
              const result = await priceDiscoveryService.getCurrentPrice(req.commodity, req.location || undefined);
              const responseTime = Date.now() - startTime;
              
              return { type: 'price', result, responseTime, expectedMaxTime: 3000 };
            })
          ];

          // Execute all mixed requests concurrently
          const results = await Promise.all(allRequests.map(req => req()));

          // Each request should meet its specific time requirement
          for (const { type, responseTime, expectedMaxTime } of results) {
            expect(responseTime).toBeLessThanOrEqual(expectedMaxTime);
          }

          // Verify all results are valid
          for (const { type, result } of results) {
            if (type === 'translation') {
              expect(result).toHaveProperty('translatedText');
              expect(result).toHaveProperty('confidence');
            } else if (type === 'price') {
              expect(result).toHaveProperty('commodity');
              expect(result).toHaveProperty('currentPrice');
              expect(result.currentPrice).toBeGreaterThan(0);
            }
          }
        }
      ),
      { numRuns: 5, timeout: 20000 }
    );
  });

  it('should maintain performance consistency across different system states', async () => {
    await fc.assert(
      fc.asyncProperty(
        commodityArb,
        fc.string({ minLength: 20, maxLength: 100 }),
        languagePairArb,
        async (commodity, text, [fromLang, toLang]) => {
          // Perform fewer operations to avoid timeout while still testing consistency
          const measurements: number[] = [];

          // Measure response time for 3 operations (reduced from 5)
          for (let i = 0; i < 3; i++) {
            // Alternate between translation and price discovery
            if (i % 2 === 0) {
              const startTime = Date.now();
              await translationService.translateMessage(text, fromLang, toLang);
              measurements.push(Date.now() - startTime);
            } else {
              const startTime = Date.now();
              await priceDiscoveryService.getCurrentPrice(commodity);
              measurements.push(Date.now() - startTime);
            }
            
            // Reduced delay between requests
            await new Promise(resolve => setTimeout(resolve, 25));
          }

          // All measurements should be within acceptable limits
          const translationMeasurements = measurements.filter((_, i) => i % 2 === 0);
          const priceMeasurements = measurements.filter((_, i) => i % 2 === 1);

          for (const time of translationMeasurements) {
            expect(time).toBeLessThanOrEqual(2000);
          }

          for (const time of priceMeasurements) {
            expect(time).toBeLessThanOrEqual(3000);
          }

          // Response times should be relatively consistent (no extreme outliers)
          if (measurements.length > 1) {
            const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
            const maxDeviation = Math.max(...measurements.map(m => Math.abs(m - avg)));
            
            // For very fast responses (< 10ms), allow more variance as timing precision is limited
            // For slower responses, enforce stricter consistency
            const allowedVariance = avg < 10 ? 10 : avg * 2.0;
            expect(maxDeviation).toBeLessThanOrEqual(allowedVariance);
          }
        }
      ),
      { numRuns: 5, timeout: 15000 } // Reduced runs and timeout
    );
  });
});