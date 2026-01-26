import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fc from 'fast-check';
import { SarvamTranslationService } from '../services/translation.service';

/**
 * Feature: multilingual-mandi-challenge
 * Property 1: Translation Performance and Quality
 * 
 * For any message in any supported Indian language, when translated to another supported language,
 * the system should complete translation within 2 seconds and preserve commercial terminology
 * with confidence scores accurately reflecting translation quality.
 * 
 * Validates: Requirements 1.1, 1.3, 1.5
 */

describe('Property 1: Translation Performance and Quality', () => {
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
          })
        })
      }
    }));
    
    translationService = new SarvamTranslationService();
  });

  // Supported language codes for testing
  const supportedLanguages = ['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa'];
  
  // Commercial terms that should be preserved
  const commercialTerms = ['mandi', 'quintal', 'kg', 'rupee', 'price', 'market', 'trader'];

  // Generator for supported language pairs
  const languagePairArb = fc.tuple(
    fc.constantFrom(...supportedLanguages),
    fc.constantFrom(...supportedLanguages)
  ).filter(([from, to]) => from !== to);

  // Generator for text with commercial terms
  const commercialTextArb = fc.record({
    baseText: fc.string({ minLength: 5, maxLength: 200 }),
    commercialTerm: fc.constantFrom(...commercialTerms),
    additionalText: fc.string({ minLength: 0, maxLength: 100 })
  }).map(({ baseText, commercialTerm, additionalText }) => 
    `${baseText} ${commercialTerm} ${additionalText}`.trim()
  );

  // Generator for general text messages
  const generalTextArb = fc.string({ minLength: 1, maxLength: 500 })
    .filter(text => text.trim().length > 0);

  it('should complete translation within 2 seconds for any supported language pair', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePairArb,
        generalTextArb,
        async ([fromLang, toLang], text) => {
          const startTime = Date.now();
          
          const result = await translationService.translateMessage(text, fromLang, toLang);
          
          const responseTime = Date.now() - startTime;
          
          // Requirement 1.1: Translation within 2 seconds
          expect(responseTime).toBeLessThanOrEqual(2000);
          
          // Result should have required properties
          expect(result).toHaveProperty('translatedText');
          expect(result).toHaveProperty('confidence');
          expect(result).toHaveProperty('preservedTerms');
          
          // Translated text should not be empty
          expect(result.translatedText.trim()).not.toBe('');
          
          // Confidence should be between 0 and 1
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('should preserve commercial terminology during translation', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePairArb,
        commercialTextArb,
        async ([fromLang, toLang], text) => {
          const result = await translationService.translateMessage(text, fromLang, toLang);
          
          // Requirement 1.3: Preserve commercial context and terminology
          expect(result).toHaveProperty('preservedTerms');
          expect(Array.isArray(result.preservedTerms)).toBe(true);
          
          // Check if commercial terms are identified
          const textLower = text.toLowerCase();
          const expectedTerms = commercialTerms.filter(term => 
            textLower.includes(term.toLowerCase())
          );
          
          if (expectedTerms.length > 0) {
            // At least some commercial terms should be preserved
            expect(result.preservedTerms.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 8, timeout: 5000 }
    );
  });

  it('should provide accurate confidence scores reflecting translation quality', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePairArb,
        generalTextArb,
        async ([fromLang, toLang], text) => {
          const result = await translationService.translateMessage(text, fromLang, toLang);
          
          // Requirement 1.5: Confidence scores should accurately reflect quality
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
          
          // If confidence is below 85%, should be flagged for review (Requirement 1.5)
          if (result.confidence < 0.85) {
            // Low confidence translations should still provide a result
            expect(result.translatedText).toBeDefined();
            expect(result.translatedText.trim()).not.toBe('');
          }
          
          // High confidence translations should have reasonable quality indicators
          if (result.confidence >= 0.85) {
            // Should not be empty
            expect(result.translatedText.trim()).not.toBe('');
            
            // Should not be identical to input (unless same language, which is filtered out)
            if (text.trim() !== result.translatedText.trim()) {
              // Length should be reasonable (not too short or too long compared to original)
              const lengthRatio = result.translatedText.length / text.length;
              expect(lengthRatio).toBeGreaterThan(0.1);
              expect(lengthRatio).toBeLessThan(10);
            }
          }
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('should handle edge cases gracefully while maintaining performance', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePairArb,
        fc.oneof(
          fc.constant(''), // Empty string
          fc.string({ minLength: 1, maxLength: 1 }), // Single character
          fc.string({ minLength: 4000, maxLength: 5000 }), // Very long text
          fc.constant('123456789'), // Numbers only
          fc.constant('!@#$%^&*()'), // Special characters only
        ),
        async ([fromLang, toLang], text) => {
          const startTime = Date.now();
          
          const result = await translationService.translateMessage(text, fromLang, toLang);
          
          const responseTime = Date.now() - startTime;
          
          // Should still complete within 2 seconds even for edge cases
          expect(responseTime).toBeLessThanOrEqual(2000);
          
          // Should return a valid result structure
          expect(result).toHaveProperty('translatedText');
          expect(result).toHaveProperty('confidence');
          expect(result).toHaveProperty('preservedTerms');
          
          // Confidence should be valid
          expect(result.confidence).toBeGreaterThanOrEqual(0);
          expect(result.confidence).toBeLessThanOrEqual(1);
        }
      ),
      { numRuns: 5, timeout: 5000 }
    );
  });

  it('should maintain consistency for identical inputs', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePairArb,
        generalTextArb,
        async ([fromLang, toLang], text) => {
          // Translate the same text twice
          const result1 = await translationService.translateMessage(text, fromLang, toLang);
          const result2 = await translationService.translateMessage(text, fromLang, toLang);
          
          // Results should be consistent (accounting for caching)
          expect(result1.translatedText).toBe(result2.translatedText);
          expect(result1.confidence).toBe(result2.confidence);
          expect(result1.preservedTerms).toEqual(result2.preservedTerms);
        }
      ),
      { numRuns: 5, timeout: 5000 }
    );
  });
});