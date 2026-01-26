import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fc from 'fast-check';
import { AGMARKNETPriceDiscoveryService } from '../services/price-discovery.service';
import { SarvamTranslationService } from '../services/translation.service';

/**
 * Feature: multilingual-mandi-challenge
 * Property 4: Required Information Completeness
 * 
 * For any system response (price displays, vendor profiles, trading reports, negotiation suggestions),
 * all required information fields specified in the requirements should be present and populated with valid data.
 * 
 * Validates: Requirements 2.3, 4.2, 4.3, 8.1, 8.2
 */

describe('Property 4: Required Information Completeness', () => {
  let priceDiscoveryService: AGMARKNETPriceDiscoveryService;
  let translationService: SarvamTranslationService;

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
            query: vi.fn().mockImplementation((query, params) => {
              // Helper function to ensure valid numeric strings
              const toValidNumericString = (value: number): string => {
                const validValue = Math.max(0.01, Math.round(value * 100) / 100); // Ensure positive and round to 2 decimals
                return validValue.toString();
              };

              // Generate mock data based on query type
              if (query.includes('market_data') && query.includes('ORDER BY date DESC')) {
                // Price history query - generate multiple rows
                const rows = [];
                const basePrice = 2500;
                const requestedDays = params && params.length > 0 ? parseInt(params[1]) || 30 : 30;
                const numRows = Math.min(requestedDays, 30); // Limit to reasonable number
                
                for (let i = 0; i < numRows; i++) {
                  // Ensure valid positive prices with proper validation
                  const priceVariation = (Math.random() - 0.5) * 200;
                  const price = Math.max(1000, basePrice + priceVariation);
                  const minPrice = Math.max(500, price * 0.9);
                  const maxPrice = price * 1.1;
                  const arrivals = Math.max(1, 100 + Math.floor(Math.random() * 200));
                  const volatility = Math.max(0.01, 0.02 + Math.random() * 0.08);
                  
                  rows.push({
                    commodity: params ? params[0] : 'Rice',
                    market: 'Delhi',
                    date: new Date(Date.now() - i * 24 * 60 * 60 * 1000),
                    modal_price: toValidNumericString(price),
                    min_price: toValidNumericString(minPrice),
                    max_price: toValidNumericString(maxPrice),
                    arrivals: Math.floor(arrivals).toString(),
                    sources: '["AGMARKNET"]',
                    volatility: toValidNumericString(volatility)
                  });
                }
                return Promise.resolve({ rows });
              }
              
              // Default single row response
              const priceVariation = Math.random() * 500;
              const basePrice = Math.max(1000, 2500 + priceVariation);
              const minPrice = Math.max(500, basePrice * 0.9);
              const maxPrice = basePrice * 1.1;
              const arrivals = Math.max(1, 100 + Math.floor(Math.random() * 200));
              const volatility = Math.max(0.01, 0.02 + Math.random() * 0.08);
              
              return Promise.resolve({ 
                rows: [
                  {
                    commodity: params ? params[0] : 'Rice',
                    market: 'Delhi',
                    date: new Date(),
                    modal_price: toValidNumericString(basePrice),
                    min_price: toValidNumericString(minPrice),
                    max_price: toValidNumericString(maxPrice),
                    arrivals: Math.floor(arrivals).toString(),
                    sources: '["AGMARKNET"]',
                    volatility: toValidNumericString(volatility)
                  }
                ]
              });
            })
          })
        })
      }
    }));
    
    priceDiscoveryService = new AGMARKNETPriceDiscoveryService();
    translationService = new SarvamTranslationService();
  });

  // Supported commodities for testing
  const supportedCommodities = [
    'Rice', 'Wheat', 'Jowar', 'Bajra', 'Maize', 'Ragi', 'Arhar', 'Moong', 'Urad',
    'Masoor', 'Gram', 'Groundnut', 'Potato', 'Onion', 'Turmeric', 'Coriander'
  ];

  // Supported languages for testing
  const supportedLanguages = ['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa'];

  // Generator for commodity names
  const commodityArb = fc.constantFrom(...supportedCommodities);

  // Generator for language pairs
  const languagePairArb = fc.tuple(
    fc.constantFrom(...supportedLanguages),
    fc.constantFrom(...supportedLanguages)
  ).filter(([from, to]) => from !== to);

  // Generator for text messages
  const textArb = fc.string({ minLength: 1, maxLength: 200 });

  // Generator for location names
  const locationArb = fc.option(fc.constantFrom('Delhi', 'Mumbai', 'Chennai', 'Kolkata', 'Bangalore'));

  it('should return complete price data with all required fields for any commodity', async () => {
    await fc.assert(
      fc.asyncProperty(
        commodityArb,
        locationArb,
        async (commodity, location) => {
          const priceData = await priceDiscoveryService.getCurrentPrice(commodity, location || undefined);

          // Requirement 2.3: Price displays must show price ranges, average prices, and trending information
          expect(priceData).toHaveProperty('commodity');
          expect(priceData).toHaveProperty('currentPrice');
          expect(priceData).toHaveProperty('priceRange');
          expect(priceData).toHaveProperty('lastUpdated');
          expect(priceData).toHaveProperty('sources');
          expect(priceData).toHaveProperty('volatility');

          // Validate data types and values
          expect(typeof priceData.commodity).toBe('string');
          expect(priceData.commodity.trim()).not.toBe('');
          
          expect(typeof priceData.currentPrice).toBe('number');
          expect(priceData.currentPrice).toBeGreaterThan(0);
          
          // Price range completeness
          expect(priceData.priceRange).toHaveProperty('min');
          expect(priceData.priceRange).toHaveProperty('max');
          expect(priceData.priceRange).toHaveProperty('modal');
          
          expect(typeof priceData.priceRange.min).toBe('number');
          expect(typeof priceData.priceRange.max).toBe('number');
          expect(typeof priceData.priceRange.modal).toBe('number');
          
          expect(priceData.priceRange.min).toBeGreaterThan(0);
          expect(priceData.priceRange.max).toBeGreaterThanOrEqual(priceData.priceRange.min);
          expect(priceData.priceRange.modal).toBeGreaterThanOrEqual(priceData.priceRange.min);
          expect(priceData.priceRange.modal).toBeLessThanOrEqual(priceData.priceRange.max);

          // Timestamp validation
          expect(priceData.lastUpdated).toBeInstanceOf(Date);
          expect(priceData.lastUpdated.getTime()).toBeLessThanOrEqual(Date.now());

          // Sources validation
          expect(Array.isArray(priceData.sources)).toBe(true);
          expect(priceData.sources.length).toBeGreaterThan(0);
          priceData.sources.forEach(source => {
            expect(typeof source).toBe('string');
            expect(source.trim()).not.toBe('');
          });

          // Volatility validation
          expect(typeof priceData.volatility).toBe('number');
          expect(priceData.volatility).toBeGreaterThanOrEqual(0);
        }
      ),
      { numRuns: 30, timeout: 10000 }
    );
  });

  it('should return complete trend analysis with all required fields for any commodity', async () => {
    await fc.assert(
      fc.asyncProperty(
        commodityArb,
        async (commodity) => {
          const trendData = await priceDiscoveryService.getPriceTrends(commodity);

          // Requirement 2.3: Trending analysis must be complete
          expect(trendData).toHaveProperty('commodity');
          expect(trendData).toHaveProperty('trend');
          expect(trendData).toHaveProperty('changePercent');
          expect(trendData).toHaveProperty('volatility');
          expect(trendData).toHaveProperty('prediction');

          // Validate data types and values
          expect(typeof trendData.commodity).toBe('string');
          expect(trendData.commodity.trim()).not.toBe('');
          
          expect(['rising', 'falling', 'stable']).toContain(trendData.trend);
          
          expect(typeof trendData.changePercent).toBe('number');
          expect(isFinite(trendData.changePercent)).toBe(true);
          
          expect(typeof trendData.volatility).toBe('number');
          expect(trendData.volatility).toBeGreaterThanOrEqual(0);
          expect(isFinite(trendData.volatility)).toBe(true);

          // Prediction completeness
          expect(trendData.prediction).toHaveProperty('nextWeek');
          expect(trendData.prediction).toHaveProperty('confidence');
          
          expect(typeof trendData.prediction.nextWeek).toBe('number');
          expect(trendData.prediction.nextWeek).toBeGreaterThanOrEqual(0);
          expect(isFinite(trendData.prediction.nextWeek)).toBe(true);
          
          expect(typeof trendData.prediction.confidence).toBe('number');
          expect(trendData.prediction.confidence).toBeGreaterThanOrEqual(0);
          expect(trendData.prediction.confidence).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 25, timeout: 10000 }
    );
  });

  it('should return complete translation results with all required fields for any text and language pair', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePairArb,
        textArb,
        async ([fromLang, toLang], text) => {
          const translationResult = await translationService.translateMessage(text, fromLang, toLang);

          // Translation result completeness
          expect(translationResult).toHaveProperty('translatedText');
          expect(translationResult).toHaveProperty('confidence');
          expect(translationResult).toHaveProperty('preservedTerms');

          // Validate data types and values
          expect(typeof translationResult.translatedText).toBe('string');
          expect(translationResult.translatedText.trim()).not.toBe('');
          
          expect(typeof translationResult.confidence).toBe('number');
          expect(translationResult.confidence).toBeGreaterThanOrEqual(0);
          expect(translationResult.confidence).toBeLessThanOrEqual(1);
          
          expect(Array.isArray(translationResult.preservedTerms)).toBe(true);
          translationResult.preservedTerms.forEach(term => {
            expect(typeof term).toBe('string');
            expect(term.trim()).not.toBe('');
          });

          // Optional fields validation if present
          if (translationResult.alternativeTranslations) {
            expect(Array.isArray(translationResult.alternativeTranslations)).toBe(true);
            translationResult.alternativeTranslations.forEach(alt => {
              expect(typeof alt).toBe('string');
              expect(alt.trim()).not.toBe('');
            });
          }
        }
      ),
      { numRuns: 40, timeout: 10000 }
    );
  });

  it('should return complete price history with all required fields for any commodity and time period', async () => {
    await fc.assert(
      fc.asyncProperty(
        commodityArb,
        fc.integer({ min: 1, max: 90 }),
        async (commodity, days) => {
          const historyData = await priceDiscoveryService.getPriceHistory(commodity, days);

          // History data should be an array
          expect(Array.isArray(historyData)).toBe(true);

          // Each history entry should have complete information
          historyData.forEach((entry, index) => {
            expect(entry).toHaveProperty('date');
            expect(entry).toHaveProperty('price');
            expect(entry).toHaveProperty('arrivals');
            expect(entry).toHaveProperty('market');

            // Validate data types and values
            expect(entry.date).toBeInstanceOf(Date);
            expect(entry.date.getTime()).toBeLessThanOrEqual(Date.now());
            
            expect(typeof entry.price).toBe('number');
            expect(Number.isNaN(entry.price)).toBe(false);
            expect(isFinite(entry.price)).toBe(true);
            expect(entry.price).toBeGreaterThan(0);
            
            expect(typeof entry.arrivals).toBe('number');
            expect(Number.isNaN(entry.arrivals)).toBe(false);
            expect(isFinite(entry.arrivals)).toBe(true);
            expect(entry.arrivals).toBeGreaterThanOrEqual(0);
            
            expect(typeof entry.market).toBe('string');
            expect(entry.market.trim()).not.toBe('');
          });
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  it('should return complete price range analysis with all required fields for any commodity', async () => {
    await fc.assert(
      fc.asyncProperty(
        commodityArb,
        fc.integer({ min: 7, max: 60 }),
        async (commodity, days) => {
          const rangeData = await priceDiscoveryService.calculatePriceRanges(commodity, days);

          // Range analysis completeness
          expect(rangeData).toHaveProperty('current');
          expect(rangeData).toHaveProperty('historical');
          expect(rangeData).toHaveProperty('volatilityLevel');

          // Current range validation
          expect(rangeData.current).toHaveProperty('min');
          expect(rangeData.current).toHaveProperty('max');
          expect(rangeData.current).toHaveProperty('modal');
          
          expect(typeof rangeData.current.min).toBe('number');
          expect(typeof rangeData.current.max).toBe('number');
          expect(typeof rangeData.current.modal).toBe('number');
          
          expect(rangeData.current.min).toBeGreaterThan(0);
          expect(rangeData.current.max).toBeGreaterThanOrEqual(rangeData.current.min);
          expect(rangeData.current.modal).toBeGreaterThanOrEqual(rangeData.current.min);
          expect(rangeData.current.modal).toBeLessThanOrEqual(rangeData.current.max);

          // Historical range validation
          expect(rangeData.historical).toHaveProperty('min');
          expect(rangeData.historical).toHaveProperty('max');
          expect(rangeData.historical).toHaveProperty('average');
          
          expect(typeof rangeData.historical.min).toBe('number');
          expect(typeof rangeData.historical.max).toBe('number');
          expect(typeof rangeData.historical.average).toBe('number');
          
          expect(Number.isNaN(rangeData.historical.min)).toBe(false);
          expect(Number.isNaN(rangeData.historical.max)).toBe(false);
          expect(Number.isNaN(rangeData.historical.average)).toBe(false);
          expect(isFinite(rangeData.historical.min)).toBe(true);
          expect(isFinite(rangeData.historical.max)).toBe(true);
          expect(isFinite(rangeData.historical.average)).toBe(true);
          expect(rangeData.historical.min).toBeGreaterThan(0);
          expect(rangeData.historical.max).toBeGreaterThanOrEqual(rangeData.historical.min);
          expect(rangeData.historical.average).toBeGreaterThan(0);

          // Volatility level validation
          expect(['low', 'medium', 'high']).toContain(rangeData.volatilityLevel);
        }
      ),
      { numRuns: 20, timeout: 10000 }
    );
  });

  it('should return complete language detection results with all required fields for any text', async () => {
    await fc.assert(
      fc.asyncProperty(
        textArb,
        async (text) => {
          const detectionResult = await translationService.detectLanguage(text);

          // Language detection completeness
          expect(detectionResult).toHaveProperty('detectedLanguage');
          expect(detectionResult).toHaveProperty('confidence');

          // Validate data types and values
          expect(typeof detectionResult.detectedLanguage).toBe('string');
          expect(detectionResult.detectedLanguage.trim()).not.toBe('');
          expect(detectionResult.detectedLanguage.length).toBeGreaterThanOrEqual(2);
          expect(detectionResult.detectedLanguage.length).toBeLessThanOrEqual(5);
          
          expect(typeof detectionResult.confidence).toBe('number');
          expect(detectionResult.confidence).toBeGreaterThanOrEqual(0);
          expect(detectionResult.confidence).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 30, timeout: 10000 }
    );
  });

  it('should return complete available languages list with all required information', async () => {
    const languages = await translationService.getAvailableLanguages();

    // Languages list completeness
    expect(Array.isArray(languages)).toBe(true);
    expect(languages.length).toBeGreaterThan(0);

    // Each language entry should have complete information
    languages.forEach(language => {
      expect(language).toHaveProperty('code');
      expect(language).toHaveProperty('name');
      expect(language).toHaveProperty('nativeName');

      // Validate data types and values
      expect(typeof language.code).toBe('string');
      expect(language.code.trim()).not.toBe('');
      expect(language.code.length).toBeGreaterThanOrEqual(2);
      expect(language.code.length).toBeLessThanOrEqual(5);
      
      expect(typeof language.name).toBe('string');
      expect(language.name.trim()).not.toBe('');
      
      expect(typeof language.nativeName).toBe('string');
      expect(language.nativeName.trim()).not.toBe('');
    });

    // Should include major Indian languages (Requirement coverage)
    const languageCodes = languages.map(l => l.code);
    expect(languageCodes).toContain('hi'); // Hindi
    expect(languageCodes).toContain('en'); // English
    expect(languageCodes).toContain('ta'); // Tamil
    expect(languageCodes).toContain('te'); // Telugu
    expect(languageCodes).toContain('bn'); // Bengali
  });

  it('should return complete translation validation results with all required fields', async () => {
    await fc.assert(
      fc.asyncProperty(
        textArb,
        textArb,
        async (original, translated) => {
          const validationResult = await translationService.validateTranslation(original, translated);

          // Validation result completeness
          expect(validationResult).toHaveProperty('isValid');
          expect(validationResult).toHaveProperty('confidence');

          // Validate data types and values
          expect(typeof validationResult.isValid).toBe('boolean');
          
          expect(typeof validationResult.confidence).toBe('number');
          expect(validationResult.confidence).toBeGreaterThanOrEqual(0);
          expect(validationResult.confidence).toBeLessThanOrEqual(1);

          // Optional issues field validation if present
          if (validationResult.issues) {
            expect(Array.isArray(validationResult.issues)).toBe(true);
            validationResult.issues.forEach(issue => {
              expect(typeof issue).toBe('string');
              expect(issue.trim()).not.toBe('');
            });
          }
        }
      ),
      { numRuns: 25, timeout: 10000 }
    );
  });
});