import axios from 'axios';
import { DatabaseManager } from '../config/database';
import { config } from '../config/environment';
import { ErrorHandler, DataValidator, CircuitBreaker } from '../utils/error-handling';

export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export interface LanguageDetection {
  detectedLanguage: string;
  confidence: number;
}

export interface TranslationResult {
  translatedText: string;
  confidence: number;
  alternativeTranslations?: string[];
  preservedTerms: string[];
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  issues?: string[];
}

export interface TranslationCache {
  id: string;
  sourceText: string;
  sourceLang: string;
  targetLang: string;
  translatedText: string;
  confidence: number;
  context: 'general' | 'commercial' | 'negotiation';
  createdAt: Date;
  usageCount: number;
}

export interface TranslationService {
  translateMessage(text: string, fromLang: string, toLang: string): Promise<TranslationResult>;
  detectLanguage(text: string): Promise<LanguageDetection>;
  getAvailableLanguages(): Promise<Language[]>;
  validateTranslation(original: string, translated: string): Promise<ValidationResult>;
}

interface SarvamTranslationResponse {
  translated_text: string;
  confidence?: number;
  alternatives?: string[];
}

interface SarvamLanguageDetectionResponse {
  detected_language: string;
  confidence: number;
}

export class SarvamTranslationService implements TranslationService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.sarvam.ai/translate';
  private readonly dbManager: DatabaseManager;
  private readonly redisClient;
  private readonly errorHandler: ErrorHandler;
  private readonly circuitBreaker: CircuitBreaker;

  // Supported Indian languages with their codes
  private readonly supportedLanguages: Language[] = [
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
    { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
    { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
    { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া' }
  ];

  // Commercial terms that should be preserved during translation
  private readonly commercialTerms = [
    'mandi', 'quintal', 'kg', 'ton', 'rupee', 'paisa', 'wholesale', 'retail',
    'commission', 'broker', 'farmer', 'trader', 'market', 'price', 'rate',
    'quality', 'grade', 'moisture', 'delivery', 'payment', 'advance'
  ];

  constructor() {
    this.apiKey = config.externalApis.sarvamAiApiKey;
    this.dbManager = DatabaseManager.getInstance();
    this.redisClient = this.dbManager.getRedisClient();
    this.errorHandler = ErrorHandler.getInstance();
    this.circuitBreaker = new CircuitBreaker(5, 60000, 120000); // 5 failures, 1 min timeout, 2 min monitoring

    if (!this.apiKey) {
      console.warn('Sarvam AI API key not configured. Translation service will use fallback mode.');
    }
  }

  async translateMessage(text: string, fromLang: string, toLang: string): Promise<TranslationResult> {
    const context = {
      service: 'translation',
      operation: 'translateMessage',
      metadata: { fromLang, toLang, textLength: text.length }
    };

    return await this.errorHandler.withCacheFallback(
      this.generateCacheKey(text, fromLang, toLang),
      async () => {
        const startTime = Date.now();
        
        // Validate language support
        if (!this.isLanguageSupported(fromLang) || !this.isLanguageSupported(toLang)) {
          throw this.errorHandler.createError(
            `Unsupported language pair: ${fromLang} -> ${toLang}`,
            'UNSUPPORTED_LANGUAGE',
            context,
            undefined,
            'medium'
          );
        }

        // If same language, return original
        if (fromLang === toLang) {
          return {
            translatedText: text,
            confidence: 1.0,
            preservedTerms: []
          };
        }

        // Identify commercial terms to preserve
        const preservedTerms = this.identifyCommercialTerms(text);

        let translationResult: TranslationResult;

        if (this.apiKey) {
          // Use Sarvam AI API with circuit breaker and fallback
          translationResult = await this.errorHandler.handleExternalAPIFailure(
            () => this.circuitBreaker.execute(() => this.translateWithSarvamAI(text, fromLang, toLang, preservedTerms)),
            () => this.fallbackTranslation(text, fromLang, toLang, preservedTerms),
            context,
            { retryCount: 2, retryDelay: 1000 }
          );
        } else {
          // Fallback mode
          translationResult = await this.fallbackTranslation(text, fromLang, toLang, preservedTerms);
        }

        // Validate translation result
        const validation = DataValidator.validateTranslationData(translationResult);
        if (!validation) {
          throw this.errorHandler.createError(
            'Invalid translation result received',
            'INVALID_TRANSLATION_RESULT',
            context,
            undefined,
            'high'
          );
        }

        // Ensure response time is within 2 seconds (Requirement 1.1)
        const responseTime = Date.now() - startTime;
        if (responseTime > 2000) {
          console.warn(`Translation took ${responseTime}ms, exceeding 2s requirement`);
        }

        return translationResult;
      },
      context,
      { useCache: true, maxCacheAge: 24 * 60 * 60 * 1000 } // 24 hours cache
    );
  }

  async detectLanguage(text: string): Promise<LanguageDetection> {
    const context = {
      service: 'translation',
      operation: 'detectLanguage',
      metadata: { textLength: text.length }
    };

    try {
      if (this.apiKey) {
        return await this.errorHandler.handleExternalAPIFailure(
          () => this.circuitBreaker.execute(async () => {
            const response = await axios.post(
              `${this.baseUrl}/detect`,
              { text },
              {
                headers: {
                  'Authorization': `Bearer ${this.apiKey}`,
                  'Content-Type': 'application/json'
                },
                timeout: 2000
              }
            );

            const data = response.data as SarvamLanguageDetectionResponse;
            return {
              detectedLanguage: data.detected_language,
              confidence: data.confidence
            };
          }),
          () => this.fallbackLanguageDetection(text),
          context,
          { retryCount: 2, retryDelay: 500 }
        );
      } else {
        // Fallback language detection based on script
        return this.fallbackLanguageDetection(text);
      }
    } catch (error) {
      console.error('Language detection error:', error);
      
      // Return English as default fallback
      return {
        detectedLanguage: 'en',
        confidence: 0.1
      };
    }
  }

  async getAvailableLanguages(): Promise<Language[]> {
    return this.supportedLanguages;
  }

  async validateTranslation(original: string, translated: string): Promise<ValidationResult> {
    try {
      // Basic validation checks
      const issues: string[] = [];
      
      // Check if translation is not empty
      if (!translated || translated.trim().length === 0) {
        issues.push('Translation is empty');
      }

      // Check if translation is significantly different in length (may indicate issues)
      const lengthRatio = translated.length / original.length;
      if (lengthRatio < 0.3 || lengthRatio > 3.0) {
        issues.push('Translation length varies significantly from original');
      }

      // Check if commercial terms are preserved
      const originalTerms = this.identifyCommercialTerms(original);
      const translatedTerms = this.identifyCommercialTerms(translated);
      const missingTerms = originalTerms.filter(term => !translatedTerms.includes(term));
      
      if (missingTerms.length > 0) {
        issues.push(`Commercial terms may be lost: ${missingTerms.join(', ')}`);
      }

      // Calculate confidence based on validation results
      let confidence = 1.0;
      if (issues.length > 0) {
        confidence = Math.max(0.1, 1.0 - (issues.length * 0.2));
      }

      return {
        isValid: issues.length === 0,
        confidence,
        issues: issues.length > 0 ? issues : undefined
      };

    } catch (error) {
      console.error('Translation validation error:', error);
      return {
        isValid: false,
        confidence: 0.1,
        issues: ['Validation failed due to system error']
      };
    }
  }

  private async translateWithSarvamAI(
    text: string, 
    fromLang: string, 
    toLang: string, 
    preservedTerms: string[]
  ): Promise<TranslationResult> {
    try {
      const response = await axios.post(
        this.baseUrl,
        {
          input: text,
          source_language_code: fromLang,
          target_language_code: toLang,
          speaker_gender: 'Male',
          mode: 'formal',
          model: 'mayura:v1',
          enable_preprocessing: true
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 2000
        }
      );

      const data = response.data as SarvamTranslationResponse;
      return {
        translatedText: data.translated_text,
        confidence: data.confidence || 0.85,
        alternativeTranslations: data.alternatives,
        preservedTerms
      };

    } catch (error) {
      console.error('Sarvam AI translation error:', error);
      throw error;
    }
  }

  private async fallbackTranslation(
    text: string, 
    fromLang: string, 
    toLang: string, 
    preservedTerms: string[]
  ): Promise<TranslationResult> {
    // Implement proper fallback with timeout handling
    return new Promise((resolve, reject) => {
      // Set timeout for fallback operation (max 2 seconds to meet requirement)
      const timeoutId = setTimeout(() => {
        reject(new Error('Fallback translation timeout'));
      }, 2000);

      try {
        // Simple fallback - in a real implementation, this could use a local translation library
        // For now, we'll return a basic transformation with language indicators
        
        const fallbackTranslations: Record<string, Record<string, string>> = {
          'hi': {
            'en': `[EN] ${text}`, // Prefix to indicate translation
            'ta': `[TA] ${text}`,
            'te': `[TE] ${text}`,
            'bn': `[BN] ${text}`,
          },
          'en': {
            'hi': `[HI] ${text}`,
            'ta': `[TA] ${text}`,
            'te': `[TE] ${text}`,
            'bn': `[BN] ${text}`,
          },
          'ta': {
            'en': `[EN] ${text}`,
            'hi': `[HI] ${text}`,
            'te': `[TE] ${text}`,
            'bn': `[BN] ${text}`,
          },
          'te': {
            'en': `[EN] ${text}`,
            'hi': `[HI] ${text}`,
            'ta': `[TA] ${text}`,
            'bn': `[BN] ${text}`,
          },
          'bn': {
            'en': `[EN] ${text}`,
            'hi': `[HI] ${text}`,
            'ta': `[TA] ${text}`,
            'te': `[TE] ${text}`,
          }
        };

        const translatedText = fallbackTranslations[fromLang]?.[toLang] || `[${toLang.toUpperCase()}] ${text}`;

        // Immediately resolve to avoid timeout
        clearTimeout(timeoutId);
        resolve({
          translatedText,
          confidence: 0.6, // Lower confidence for fallback
          preservedTerms
        });
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  private fallbackLanguageDetection(text: string): LanguageDetection {
    // Basic script-based language detection
    const devanagariRegex = /[\u0900-\u097F]/;
    const tamilRegex = /[\u0B80-\u0BFF]/;
    const teluguRegex = /[\u0C00-\u0C7F]/;
    const bengaliRegex = /[\u0980-\u09FF]/;
    
    if (devanagariRegex.test(text)) {
      return { detectedLanguage: 'hi', confidence: 0.8 };
    } else if (tamilRegex.test(text)) {
      return { detectedLanguage: 'ta', confidence: 0.8 };
    } else if (teluguRegex.test(text)) {
      return { detectedLanguage: 'te', confidence: 0.8 };
    } else if (bengaliRegex.test(text)) {
      return { detectedLanguage: 'bn', confidence: 0.8 };
    } else {
      return { detectedLanguage: 'en', confidence: 0.7 };
    }
  }

  private isLanguageSupported(langCode: string): boolean {
    return this.supportedLanguages.some(lang => lang.code === langCode);
  }

  private identifyCommercialTerms(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    return this.commercialTerms.filter(term => 
      words.some(word => word.includes(term))
    );
  }

  private async getCachedTranslation(
    text: string, 
    fromLang: string, 
    toLang: string
  ): Promise<TranslationResult | null> {
    try {
      const cacheKey = this.generateCacheKey(text, fromLang, toLang);
      const cached = await this.redisClient.get(cacheKey);
      
      if (cached) {
        const result = JSON.parse(cached) as TranslationResult;
        
        // Update usage count
        await this.redisClient.incr(`${cacheKey}:usage`);
        
        return result;
      }
      
      return null;
    } catch (error) {
      console.error('Cache retrieval error:', error);
      return null;
    }
  }

  private async cacheTranslation(
    text: string, 
    fromLang: string, 
    toLang: string, 
    result: TranslationResult
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(text, fromLang, toLang);
      
      // Cache for 24 hours
      await this.redisClient.setEx(cacheKey, 86400, JSON.stringify(result));
      
      // Initialize usage count
      await this.redisClient.set(`${cacheKey}:usage`, '1', { EX: 86400 });
      
    } catch (error) {
      console.error('Cache storage error:', error);
    }
  }

  private generateCacheKey(text: string, fromLang: string, toLang: string): string {
    // Create a hash-like key for the translation
    const content = `${text}:${fromLang}:${toLang}`;
    return `translation:${Buffer.from(content).toString('base64').slice(0, 32)}`;
  }
}