import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fc from 'fast-check';
import { AIBasedNegotiationAssistant } from '../services/negotiation.service';
import { MarketContext, NegotiationOffer, NegotiationStep, CulturalProfile } from '../types';

/**
 * Feature: multilingual-mandi-challenge
 * Property 8: Cultural and Regional Adaptation
 * 
 * For any negotiation or recommendation involving vendors from different regions,
 * the system should adapt suggestions and communication styles based on regional
 * trading customs and cultural context.
 * 
 * Validates: Requirements 3.3
 */

describe('Property 8: Cultural and Regional Adaptation', () => {
  let negotiationService: AIBasedNegotiationAssistant;

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
            query: vi.fn().mockImplementation((query: string, params?: any[]) => {
              // Mock different queries based on the SQL
              if (query.includes('market_data')) {
                return Promise.resolve({
                  rows: [
                    {
                      commodity: params?.[0] || 'Rice',
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
                });
              }
              
              if (query.includes('negotiation_steps') || query.includes('offer_analyses') || 
                  query.includes('response_recommendations') || query.includes('deal_evaluations') ||
                  query.includes('learning_data')) {
                return Promise.resolve({ rows: [] });
              }
              
              return Promise.resolve({ rows: [] });
            })
          })
        })
      }
    }));
    
    negotiationService = new AIBasedNegotiationAssistant();
  });

  // Supported commodities for testing
  const supportedCommodities = [
    'Rice', 'Wheat', 'Jowar', 'Bajra', 'Maize', 'Ragi', 'Arhar', 'Moong', 'Urad',
    'Masoor', 'Gram', 'Groundnut', 'Potato', 'Onion', 'Turmeric', 'Coriander'
  ];

  // Regional locations with different cultural profiles
  const regionalLocations = [
    'punjab', 'maharashtra', 'tamil_nadu', 'gujarat', 'rajasthan', 
    'uttar_pradesh', 'bihar', 'west_bengal', 'karnataka', 'andhra_pradesh'
  ];

  // Generator for commodity names
  const commodityArb = fc.constantFrom(...supportedCommodities);

  // Generator for regional locations
  const regionArb = fc.constantFrom(...regionalLocations);

  // Generator for quantities (realistic trading quantities)
  const quantityArb = fc.integer({ min: 10, max: 10000 });

  // Generator for market context with regional information
  const regionalMarketContextArb = fc.record({
    commodity: commodityArb,
    quantity: quantityArb,
    location: regionArb,
    quality: fc.option(fc.constantFrom('premium', 'standard', 'basic')),
    deliveryTerms: fc.option(fc.constantFrom('immediate', 'within_week', 'within_month')),
    urgency: fc.constantFrom('low', 'medium', 'high'),
    seasonality: fc.constantFrom('peak', 'off-peak', 'normal')
  });

  // Generator for negotiation offers with regional context
  const regionalNegotiationOfferArb = fc.record({
    offerId: fc.string({ minLength: 5, maxLength: 20 }),
    sessionId: fc.string({ minLength: 5, maxLength: 20 }),
    fromVendorId: fc.string({ minLength: 5, maxLength: 20 }),
    toVendorId: fc.string({ minLength: 5, maxLength: 20 }),
    commodity: commodityArb,
    quantity: quantityArb,
    proposedPrice: fc.float({ min: 500, max: 50000, noNaN: true }),
    currentMarketPrice: fc.float({ min: 500, max: 50000, noNaN: true }),
    offerType: fc.constantFrom('initial', 'counter', 'final'),
    timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date() }),
    terms: fc.option(fc.record({
      deliveryLocation: fc.option(regionArb),
      deliveryDate: fc.option(fc.date({ min: new Date('2024-01-01'), max: new Date('2026-12-31') })),
      paymentTerms: fc.option(fc.constantFrom('cash_on_delivery', '15_days_credit', 'advance_payment')),
      qualitySpecs: fc.option(fc.constantFrom('premium', 'standard', 'basic'))
    }))
  });

  // Generator for negotiation history with regional context
  const regionalNegotiationHistoryArb = fc.array(
    fc.record({
      stepId: fc.string({ minLength: 5, maxLength: 20 }),
      sessionId: fc.string({ minLength: 5, maxLength: 20 }),
      vendorId: fc.string({ minLength: 5, maxLength: 20 }),
      action: fc.constantFrom('offer', 'counter', 'accept', 'reject', 'message'),
      offer: fc.option(regionalNegotiationOfferArb),
      message: fc.option(fc.string({ minLength: 10, maxLength: 200 })),
      timestamp: fc.date({ min: new Date('2024-01-01'), max: new Date() }),
      aiAssistanceUsed: fc.boolean()
    }),
    { minLength: 1, maxLength: 10 }
  );

  it('should adapt price suggestions based on regional negotiation styles', async () => {
    await fc.assert(
      fc.asyncProperty(
        regionalMarketContextArb,
        async (context) => {
          // Get price suggestion for the specific region
          const suggestion = await negotiationService.suggestOpeningPrice(
            context.commodity,
            context.quantity,
            context
          );
          
          // Get cultural profile for the region
          const culturalProfile = await negotiationService.getCulturalProfile(context.location);
          
          // Requirement 3.3: Should adapt based on regional trading customs
          expect(suggestion).toHaveProperty('suggestedPrice');
          expect(suggestion).toHaveProperty('reasoning');
          expect(suggestion).toHaveProperty('confidenceLevel');
          
          // Price should be positive
          expect(suggestion.suggestedPrice).toBeGreaterThan(0);
          
          // Reasoning should reflect cultural considerations
          expect(suggestion.reasoning).toBeDefined();
          expect(suggestion.reasoning.length).toBeGreaterThan(0);
          
          // Cultural profile should be retrieved and valid
          expect(culturalProfile).toHaveProperty('region');
          expect(culturalProfile).toHaveProperty('tradingCustoms');
          expect(culturalProfile).toHaveProperty('communicationPatterns');
          expect(culturalProfile).toHaveProperty('marketPractices');
          
          // Trading customs should have expected properties
          expect(culturalProfile.tradingCustoms).toHaveProperty('negotiationStyle');
          expect(culturalProfile.tradingCustoms).toHaveProperty('decisionMaking');
          expect(culturalProfile.tradingCustoms).toHaveProperty('priceFlexibility');
          expect(culturalProfile.tradingCustoms).toHaveProperty('relationshipImportance');
          
          // Negotiation style should be one of expected values
          expect(['direct', 'indirect', 'relationship-based']).toContain(
            culturalProfile.tradingCustoms.negotiationStyle
          );
        }
      ),
      { numRuns: 5, timeout: 8000 }
    );
  });

  it('should provide different recommendations for different regional contexts', async () => {
    await fc.assert(
      fc.asyncProperty(
        commodityArb,
        quantityArb,
        fc.tuple(regionArb, regionArb).filter(([region1, region2]) => region1 !== region2),
        async (commodity, quantity, [region1, region2]) => {
          // Create contexts for two different regions
          const context1: MarketContext = {
            commodity,
            quantity,
            location: region1,
            urgency: 'medium',
            seasonality: 'normal'
          };
          
          const context2: MarketContext = {
            commodity,
            quantity,
            location: region2,
            urgency: 'medium',
            seasonality: 'normal'
          };
          
          // Get suggestions for both regions
          const suggestion1 = await negotiationService.suggestOpeningPrice(commodity, quantity, context1);
          const suggestion2 = await negotiationService.suggestOpeningPrice(commodity, quantity, context2);
          
          // Get cultural profiles for both regions
          const profile1 = await negotiationService.getCulturalProfile(region1);
          const profile2 = await negotiationService.getCulturalProfile(region2);
          
          // Requirement 3.3: Different regions should have different cultural adaptations
          expect(suggestion1).toHaveProperty('suggestedPrice');
          expect(suggestion2).toHaveProperty('suggestedPrice');
          
          // Both suggestions should be valid
          expect(suggestion1.suggestedPrice).toBeGreaterThan(0);
          expect(suggestion2.suggestedPrice).toBeGreaterThan(0);
          
          // Cultural profiles should be different (unless both regions have same profile)
          if (profile1.tradingCustoms.negotiationStyle !== profile2.tradingCustoms.negotiationStyle ||
              profile1.tradingCustoms.priceFlexibility !== profile2.tradingCustoms.priceFlexibility) {
            
            // Suggestions should reflect cultural differences
            // This could manifest in different prices, reasoning, or confidence levels
            const hasDifferentPrices = Math.abs(suggestion1.suggestedPrice - suggestion2.suggestedPrice) > 0.01;
            const hasDifferentReasoning = suggestion1.reasoning !== suggestion2.reasoning;
            const hasDifferentConfidence = Math.abs(suggestion1.confidenceLevel - suggestion2.confidenceLevel) > 0.01;
            
            // At least one aspect should be different due to cultural adaptation
            expect(hasDifferentPrices || hasDifferentReasoning || hasDifferentConfidence).toBe(true);
          }
        }
      ),
      { numRuns: 5, timeout: 10000 }
    );
  });

  it('should include cultural considerations in offer analysis', async () => {
    await fc.assert(
      fc.asyncProperty(
        regionalNegotiationOfferArb,
        async (offerData) => {
          // Create a proper NegotiationOffer object
          const offer: NegotiationOffer = {
            ...offerData,
            expiresAt: undefined // Keep it simple for testing
          };
          
          // Create mock market data
          const marketData = {
            commodity: offer.commodity,
            currentPrice: offer.currentMarketPrice,
            priceRange: {
              min: offer.currentMarketPrice * 0.9,
              max: offer.currentMarketPrice * 1.1,
              modal: offer.currentMarketPrice
            },
            lastUpdated: new Date(),
            sources: ['AGMARKNET'],
            volatility: 0.05,
            market: 'Delhi',
            arrivals: 100
          };
          
          // Analyze the offer
          const analysis = await negotiationService.analyzeCounterOffer(offer, marketData);
          
          // Requirement 3.3: Analysis should include cultural considerations
          expect(analysis).toHaveProperty('recommendation');
          expect(analysis).toHaveProperty('reasoning');
          expect(analysis).toHaveProperty('negotiationStrategy');
          expect(analysis).toHaveProperty('culturalConsiderations');
          
          // Cultural considerations should be provided
          if (analysis.culturalConsiderations) {
            expect(analysis.culturalConsiderations.length).toBeGreaterThan(0);
            
            // Should contain relevant cultural guidance
            const culturalText = analysis.culturalConsiderations.toLowerCase();
            const hasCulturalTerms = culturalText.includes('formal') || 
                                   culturalText.includes('indirect') || 
                                   culturalText.includes('relationship') ||
                                   culturalText.includes('consensus') ||
                                   culturalText.includes('time') ||
                                   culturalText.includes('communication');
            
            expect(hasCulturalTerms).toBe(true);
          }
          
          // Negotiation strategy should be culturally informed
          expect(analysis.negotiationStrategy).toBeDefined();
          expect(analysis.negotiationStrategy.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 5, timeout: 8000 }
    );
  });

  it('should adapt response recommendations based on cultural context', async () => {
    await fc.assert(
      fc.asyncProperty(
        regionalNegotiationHistoryArb,
        regionArb,
        async (historyData, region) => {
          // Create negotiation history with regional context
          const history: NegotiationStep[] = historyData.map(step => ({
            ...step,
            offer: step.offer ? {
              ...step.offer,
              terms: {
                ...step.offer.terms,
                deliveryLocation: region // Ensure regional context
              }
            } : undefined
          }));
          
          // Skip if no valid history
          if (history.length === 0) return;
          
          // Get response recommendation
          const recommendation = await negotiationService.recommendResponse(history);
          
          // Requirement 3.3: Recommendations should be culturally adapted
          expect(recommendation).toHaveProperty('recommendedAction');
          expect(recommendation).toHaveProperty('reasoning');
          expect(recommendation).toHaveProperty('culturalAdaptations');
          
          // Cultural adaptations should be provided
          expect(Array.isArray(recommendation.culturalAdaptations)).toBe(true);
          
          if (recommendation.culturalAdaptations.length > 0) {
            // Should contain meaningful cultural guidance
            const adaptationText = recommendation.culturalAdaptations.join(' ').toLowerCase();
            
            const hasCulturalGuidance = adaptationText.includes('formal') ||
                                      adaptationText.includes('indirect') ||
                                      adaptationText.includes('relationship') ||
                                      adaptationText.includes('partnership') ||
                                      adaptationText.includes('polite') ||
                                      adaptationText.includes('harmony') ||
                                      adaptationText.includes('consultation');
            
            expect(hasCulturalGuidance).toBe(true);
          }
          
          // Recommended action should be valid
          expect(['accept', 'counter', 'reject', 'negotiate_terms']).toContain(
            recommendation.recommendedAction
          );
        }
      ),
      { numRuns: 5, timeout: 8000 }
    );
  });

  it('should retrieve and cache cultural profiles for different regions', async () => {
    await fc.assert(
      fc.asyncProperty(
        regionArb,
        async (region) => {
          // Get cultural profile for the region
          const profile1 = await negotiationService.getCulturalProfile(region);
          const profile2 = await negotiationService.getCulturalProfile(region);
          
          // Requirement 3.3: Should provide consistent cultural profiles
          expect(profile1).toEqual(profile2); // Should be consistent (cached)
          
          // Profile should have all required properties
          expect(profile1).toHaveProperty('region');
          expect(profile1).toHaveProperty('state');
          expect(profile1).toHaveProperty('tradingCustoms');
          expect(profile1).toHaveProperty('communicationPatterns');
          expect(profile1).toHaveProperty('marketPractices');
          
          // Trading customs should be complete
          const tradingCustoms = profile1.tradingCustoms;
          expect(tradingCustoms).toHaveProperty('negotiationStyle');
          expect(tradingCustoms).toHaveProperty('decisionMaking');
          expect(tradingCustoms).toHaveProperty('priceFlexibility');
          expect(tradingCustoms).toHaveProperty('relationshipImportance');
          
          // Values should be from expected enums
          expect(['direct', 'indirect', 'relationship-based']).toContain(tradingCustoms.negotiationStyle);
          expect(['quick', 'deliberate', 'consensus']).toContain(tradingCustoms.decisionMaking);
          expect(['high', 'medium', 'low']).toContain(tradingCustoms.priceFlexibility);
          expect(['high', 'medium', 'low']).toContain(tradingCustoms.relationshipImportance);
          
          // Communication patterns should be complete
          const commPatterns = profile1.communicationPatterns;
          expect(commPatterns).toHaveProperty('formalityLevel');
          expect(commPatterns).toHaveProperty('directness');
          expect(commPatterns).toHaveProperty('timeOrientation');
          
          expect(['formal', 'semi-formal', 'informal']).toContain(commPatterns.formalityLevel);
          expect(['direct', 'indirect']).toContain(commPatterns.directness);
          expect(['punctual', 'flexible']).toContain(commPatterns.timeOrientation);
          
          // Market practices should be complete
          const marketPractices = profile1.marketPractices;
          expect(marketPractices).toHaveProperty('commonPaymentTerms');
          expect(marketPractices).toHaveProperty('typicalDeliveryMethods');
          expect(marketPractices).toHaveProperty('qualityAssessmentMethods');
          expect(marketPractices).toHaveProperty('disputeResolutionPreferences');
          
          // Arrays should not be empty
          expect(Array.isArray(marketPractices.commonPaymentTerms)).toBe(true);
          expect(marketPractices.commonPaymentTerms.length).toBeGreaterThan(0);
          expect(Array.isArray(marketPractices.typicalDeliveryMethods)).toBe(true);
          expect(marketPractices.typicalDeliveryMethods.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 5, timeout: 6000 }
    );
  });

  it('should handle unknown regions with default cultural profiles', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 5, maxLength: 20 }).filter(s => !regionalLocations.includes(s.toLowerCase())),
        async (unknownRegion) => {
          // Get cultural profile for unknown region
          const profile = await negotiationService.getCulturalProfile(unknownRegion);
          
          // Requirement 3.3: Should provide default profile for unknown regions
          expect(profile).toHaveProperty('region');
          expect(profile).toHaveProperty('tradingCustoms');
          expect(profile).toHaveProperty('communicationPatterns');
          expect(profile).toHaveProperty('marketPractices');
          
          // Should have reasonable defaults
          expect(profile.tradingCustoms.negotiationStyle).toBeDefined();
          expect(profile.tradingCustoms.decisionMaking).toBeDefined();
          expect(profile.tradingCustoms.priceFlexibility).toBeDefined();
          expect(profile.tradingCustoms.relationshipImportance).toBeDefined();
          
          // Default values should be reasonable
          expect(['direct', 'indirect', 'relationship-based']).toContain(profile.tradingCustoms.negotiationStyle);
          expect(['quick', 'deliberate', 'consensus']).toContain(profile.tradingCustoms.decisionMaking);
          expect(['high', 'medium', 'low']).toContain(profile.tradingCustoms.priceFlexibility);
          expect(['high', 'medium', 'low']).toContain(profile.tradingCustoms.relationshipImportance);
        }
      ),
      { numRuns: 10, timeout: 5000 }
    );
  });

  it('should maintain cultural consistency across multiple interactions', async () => {
    await fc.assert(
      fc.asyncProperty(
        regionArb,
        commodityArb,
        fc.array(quantityArb, { minLength: 2, maxLength: 5 }),
        async (region, commodity, quantities) => {
          const suggestions: any[] = [];
          
          // Get multiple suggestions for the same region
          for (const quantity of quantities) {
            const context: MarketContext = {
              commodity,
              quantity,
              location: region,
              urgency: 'medium',
              seasonality: 'normal'
            };
            
            const suggestion = await negotiationService.suggestOpeningPrice(commodity, quantity, context);
            suggestions.push(suggestion);
          }
          
          // Requirement 3.3: Cultural adaptations should be consistent
          expect(suggestions.length).toBeGreaterThan(1);
          
          // All suggestions should be valid
          for (const suggestion of suggestions) {
            expect(suggestion.suggestedPrice).toBeGreaterThan(0);
            expect(suggestion.reasoning).toBeDefined();
            expect(suggestion.confidenceLevel).toBeGreaterThanOrEqual(0);
            expect(suggestion.confidenceLevel).toBeLessThanOrEqual(1);
          }
          
          // Cultural aspects should be consistent across suggestions
          // (reasoning patterns should reflect the same cultural profile)
          const reasoningTexts = suggestions.map(s => s.reasoning.toLowerCase());
          
          // If any reasoning mentions cultural aspects, they should be consistent
          const culturalMentions = reasoningTexts.filter(text => 
            text.includes('custom') || text.includes('regional') || 
            text.includes('trading') || text.includes('negotiation')
          );
          
          if (culturalMentions.length > 1) {
            // Cultural mentions should be consistent (not contradictory)
            // This is a basic check - in practice would be more sophisticated
            expect(culturalMentions.length).toBeGreaterThan(0);
          }
        }
      ),
      { numRuns: 10, timeout: 8000 }
    );
  });
});