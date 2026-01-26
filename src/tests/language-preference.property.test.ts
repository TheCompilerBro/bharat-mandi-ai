import { describe, it, expect, beforeAll, vi } from 'vitest';
import fc from 'fast-check';

/**
 * Feature: multilingual-mandi-challenge
 * Property 3: User Preference Persistence
 * 
 * For any vendor preference setting (language, notification preferences, display options),
 * once set, the preference should persist across all future sessions and system interactions
 * until explicitly changed.
 * 
 * Validates: Requirements 1.4
 */

// Mock the database manager before importing the service
const mockClient = {
  query: vi.fn(),
  release: vi.fn()
};

const mockPgPool = {
  connect: vi.fn().mockResolvedValue(mockClient)
};

vi.mock('../config/database', () => ({
  DatabaseManager: {
    getInstance: () => ({
      getPostgreSQLPool: () => mockPgPool
    })
  }
}));

// Import after mocking
import { LanguagePreferenceService } from '../services/language-preference.service';

describe('Property 3: User Preference Persistence', () => {
  let languagePreferenceService: LanguagePreferenceService;

  beforeAll(async () => {
    languagePreferenceService = new LanguagePreferenceService();
  });

  // Supported language codes for testing
  const supportedLanguages = ['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as'];

  // Generator for vendor IDs
  const vendorIdArb = fc.string({ minLength: 5, maxLength: 50 })
    .filter(id => id.trim().length > 0);

  // Generator for language preferences
  const languagePreferenceArb = fc.record({
    vendorId: vendorIdArb,
    preferredLanguage: fc.constantFrom(...supportedLanguages),
    secondaryLanguages: fc.array(fc.constantFrom(...supportedLanguages), { maxLength: 5 })
  });

  // Generator for preference updates
  const preferenceUpdateArb = fc.record({
    preferredLanguage: fc.option(fc.constantFrom(...supportedLanguages)),
    secondaryLanguages: fc.option(fc.array(fc.constantFrom(...supportedLanguages), { maxLength: 5 }))
  }).filter(update => update.preferredLanguage !== null || update.secondaryLanguages !== null);

  it('should persist language preferences across multiple retrieval operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePreferenceArb,
        async (preferenceData) => {
          const { vendorId, preferredLanguage, secondaryLanguages } = preferenceData;
          
          // Reset mocks
          mockClient.query.mockReset();
          
          const mockPreferenceRow = {
            vendor_id: vendorId,
            preferred_language: preferredLanguage,
            secondary_languages: secondaryLanguages,
            updated_at: new Date()
          };

          // Mock setting preference
          mockClient.query.mockResolvedValueOnce({
            rows: [mockPreferenceRow]
          });

          // Set the preference
          const setResult = await languagePreferenceService.setLanguagePreference({
            vendorId,
            preferredLanguage,
            secondaryLanguages
          });

          // Verify the preference was set correctly
          expect(setResult.vendorId).toBe(vendorId);
          expect(setResult.preferredLanguage).toBe(preferredLanguage);
          expect(setResult.secondaryLanguages).toEqual(secondaryLanguages);

          // Mock multiple retrieval operations
          mockClient.query.mockResolvedValue({
            rows: [mockPreferenceRow]
          });

          // Retrieve the preference multiple times to test persistence
          const retrieval1 = await languagePreferenceService.getLanguagePreference(vendorId);
          const retrieval2 = await languagePreferenceService.getLanguagePreference(vendorId);
          const retrieval3 = await languagePreferenceService.getLanguagePreference(vendorId);

          // All retrievals should return the same data (Requirement 1.4: persistence)
          expect(retrieval1).toEqual(retrieval2);
          expect(retrieval2).toEqual(retrieval3);
          expect(retrieval1?.preferredLanguage).toBe(preferredLanguage);
          expect(retrieval1?.secondaryLanguages).toEqual(secondaryLanguages);
        }
      ),
      { numRuns: 8, timeout: 5000 }
    );
  });

  it('should maintain preference consistency after updates until explicitly changed', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePreferenceArb,
        preferenceUpdateArb,
        async (initialPreference, updateData) => {
          const { vendorId, preferredLanguage, secondaryLanguages } = initialPreference;
          
          // Reset mocks
          mockClient.query.mockReset();
          
          // Mock initial preference setting
          const initialRow = {
            vendor_id: vendorId,
            preferred_language: preferredLanguage,
            secondary_languages: secondaryLanguages,
            updated_at: new Date()
          };

          mockClient.query.mockResolvedValueOnce({
            rows: [initialRow]
          });

          // Set initial preference
          await languagePreferenceService.setLanguagePreference({
            vendorId,
            preferredLanguage,
            secondaryLanguages
          });

          // Mock getting existing preference for update
          mockClient.query.mockResolvedValueOnce({
            rows: [initialRow]
          });

          // Calculate expected updated values
          const updatedPreferredLanguage = updateData.preferredLanguage || preferredLanguage;
          const updatedSecondaryLanguages = updateData.secondaryLanguages || secondaryLanguages;

          const updatedRow = {
            vendor_id: vendorId,
            preferred_language: updatedPreferredLanguage,
            secondary_languages: updatedSecondaryLanguages,
            updated_at: new Date()
          };

          // Mock update operation
          mockClient.query.mockResolvedValueOnce({
            rows: [updatedRow]
          });

          // Update the preference
          const updateResult = await languagePreferenceService.updateLanguagePreference(
            vendorId, 
            updateData
          );

          // Verify update was applied correctly
          expect(updateResult?.preferredLanguage).toBe(updatedPreferredLanguage);
          expect(updateResult?.secondaryLanguages).toEqual(updatedSecondaryLanguages);

          // Mock subsequent retrievals to return updated data
          mockClient.query.mockResolvedValue({
            rows: [updatedRow]
          });

          // Multiple retrievals after update should return consistent updated data
          const postUpdate1 = await languagePreferenceService.getLanguagePreference(vendorId);
          const postUpdate2 = await languagePreferenceService.getLanguagePreference(vendorId);

          expect(postUpdate1).toEqual(postUpdate2);
          expect(postUpdate1?.preferredLanguage).toBe(updatedPreferredLanguage);
          expect(postUpdate1?.secondaryLanguages).toEqual(updatedSecondaryLanguages);
        }
      ),
      { numRuns: 8, timeout: 5000 }
    );
  });

  it('should handle preference persistence for multiple vendors independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(languagePreferenceArb, { minLength: 2, maxLength: 5 })
          .filter(prefs => {
            // Ensure all vendor IDs are unique
            const vendorIds = prefs.map(p => p.vendorId);
            return new Set(vendorIds).size === vendorIds.length;
          }),
        async (multiplePreferences) => {
          // Reset mocks
          mockClient.query.mockReset();
          
          // Set preferences for all vendors
          for (const pref of multiplePreferences) {
            const mockRow = {
              vendor_id: pref.vendorId,
              preferred_language: pref.preferredLanguage,
              secondary_languages: pref.secondaryLanguages,
              updated_at: new Date()
            };

            mockClient.query.mockResolvedValueOnce({
              rows: [mockRow]
            });

            await languagePreferenceService.setLanguagePreference(pref);
          }

          // Verify each vendor's preferences persist independently
          for (const expectedPref of multiplePreferences) {
            const mockRow = {
              vendor_id: expectedPref.vendorId,
              preferred_language: expectedPref.preferredLanguage,
              secondary_languages: expectedPref.secondaryLanguages,
              updated_at: new Date()
            };

            mockClient.query.mockResolvedValueOnce({
              rows: [mockRow]
            });

            const retrievedPref = await languagePreferenceService.getLanguagePreference(
              expectedPref.vendorId
            );

            expect(retrievedPref?.vendorId).toBe(expectedPref.vendorId);
            expect(retrievedPref?.preferredLanguage).toBe(expectedPref.preferredLanguage);
            expect(retrievedPref?.secondaryLanguages).toEqual(expectedPref.secondaryLanguages);
          }
        }
      ),
      { numRuns: 5, timeout: 5000 }
    );
  });

  it('should maintain preference data integrity across system operations', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePreferenceArb,
        async (preferenceData) => {
          const { vendorId, preferredLanguage, secondaryLanguages } = preferenceData;
          
          // Reset mocks
          mockClient.query.mockReset();
          
          const mockRow = {
            vendor_id: vendorId,
            preferred_language: preferredLanguage,
            secondary_languages: secondaryLanguages,
            updated_at: new Date()
          };

          // Mock setting preference
          mockClient.query.mockResolvedValueOnce({
            rows: [mockRow]
          });

          const setResult = await languagePreferenceService.setLanguagePreference({
            vendorId,
            preferredLanguage,
            secondaryLanguages
          });

          // Verify data integrity: no data corruption or loss
          expect(setResult.vendorId).toBe(vendorId);
          expect(setResult.preferredLanguage).toBe(preferredLanguage);
          expect(Array.isArray(setResult.secondaryLanguages)).toBe(true);
          expect(setResult.secondaryLanguages).toEqual(secondaryLanguages);
          expect(setResult.updatedAt).toBeInstanceOf(Date);

          // Mock retrieval
          mockClient.query.mockResolvedValueOnce({
            rows: [mockRow]
          });

          const retrievedResult = await languagePreferenceService.getLanguagePreference(vendorId);

          // Data should remain identical after storage and retrieval
          expect(retrievedResult?.vendorId).toBe(setResult.vendorId);
          expect(retrievedResult?.preferredLanguage).toBe(setResult.preferredLanguage);
          expect(retrievedResult?.secondaryLanguages).toEqual(setResult.secondaryLanguages);
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('should handle preference deletion and ensure no persistence after deletion', async () => {
    await fc.assert(
      fc.asyncProperty(
        languagePreferenceArb,
        async (preferenceData) => {
          const { vendorId, preferredLanguage, secondaryLanguages } = preferenceData;
          
          // Reset mocks
          mockClient.query.mockReset();
          
          const mockRow = {
            vendor_id: vendorId,
            preferred_language: preferredLanguage,
            secondary_languages: secondaryLanguages,
            updated_at: new Date()
          };

          // Mock setting preference
          mockClient.query.mockResolvedValueOnce({
            rows: [mockRow]
          });

          await languagePreferenceService.setLanguagePreference({
            vendorId,
            preferredLanguage,
            secondaryLanguages
          });

          // Mock successful deletion
          mockClient.query.mockResolvedValueOnce({
            rowCount: 1
          });

          const deleteResult = await languagePreferenceService.deleteLanguagePreference(vendorId);
          expect(deleteResult).toBe(true);

          // Mock retrieval after deletion (should return no rows)
          mockClient.query.mockResolvedValueOnce({
            rows: []
          });

          const retrievalAfterDeletion = await languagePreferenceService.getLanguagePreference(vendorId);
          
          // Should not persist after deletion
          expect(retrievalAfterDeletion).toBeNull();
        }
      ),
      { numRuns: 5, timeout: 5000 }
    );
  });
});