export interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: {
    state: string;
    district: string;
    market: string;
    coordinates?: { lat: number; lng: number };
  };
  preferredLanguage: string;
  secondaryLanguages: string[];
  businessType: 'farmer' | 'trader' | 'wholesaler' | 'retailer';
  verificationStatus: 'pending' | 'verified' | 'rejected';
  trustScore: number;
  createdAt: Date;
  lastActive: Date;
}

export interface AuthPayload {
  vendorId: string;
  email: string;
  iat: number;
  exp: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  phone: string;
  location: {
    state: string;
    district: string;
    market: string;
  };
  preferredLanguage: string;
  businessType: 'farmer' | 'trader' | 'wholesaler' | 'retailer';
}

export interface DatabaseConfig {
  postgres: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  mongodb: {
    uri: string;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
  };
}

// Translation Service Types
export interface Language {
  code: string;
  name: string;
  nativeName: string;
}

export interface TranslationRequest {
  text: string;
  fromLang: string;
  toLang: string;
}

export interface LanguagePreference {
  vendorId: string;
  preferredLanguage: string;
  secondaryLanguages: string[];
  updatedAt: Date;
}

// Price Discovery Service Types
export interface PriceData {
  commodity: string;
  currentPrice: number;
  priceRange: { min: number; max: number; modal: number };
  lastUpdated: Date;
  sources: string[];
  volatility: number;
  market?: string;
  state?: string;
  arrivals?: number;
}

export interface PriceHistory {
  date: Date;
  price: number;
  arrivals: number;
  market: string;
}

export interface TrendAnalysis {
  commodity: string;
  trend: 'rising' | 'falling' | 'stable';
  changePercent: number;
  volatility: number;
  prediction: {
    nextWeek: number;
    confidence: number;
  };
}

export interface MarketData {
  id: string;
  commodity: string;
  market: string;
  state: string;
  date: Date;
  prices: {
    minimum: number;
    maximum: number;
    modal: number;
  };
  arrivals: number;
  source: string;
  dataQuality: 'high' | 'medium' | 'low';
}

export interface PriceAlert {
  id: string;
  vendorId: string;
  commodity: string;
  alertType: 'volatility' | 'price_threshold' | 'market_change';
  threshold: number;
  currentValue: number;
  message: string;
  createdAt: Date;
}

// Communication Service Types
export interface Message {
  id: string;
  senderId: string;
  content: string;
  originalLanguage: string;
  timestamp: Date;
  messageType: 'text' | 'price_quote' | 'negotiation_offer';
  sessionId: string;
  translations?: Record<string, string>; // language code -> translated text
  confidence?: number;
}

export interface TradeSession {
  id: string;
  participants: string[]; // vendor IDs
  commodity: string;
  status: 'active' | 'completed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  finalDeal?: {
    price: number;
    quantity: number;
    buyerId: string;
    sellerId: string;
  };
  metadata?: {
    location?: string;
    quality?: string;
    deliveryTerms?: string;
  };
}

export interface SessionParticipant {
  vendorId: string;
  joinedAt: Date;
  isActive: boolean;
  preferredLanguage: string;
  role: 'buyer' | 'seller' | 'observer';
}

export interface WebSocketConnection {
  id: string;
  vendorId: string;
  socketId: string;
  connectedAt: Date;
  lastActivity: Date;
  activeSessions: string[];
}

// Vendor Profile Service Types
export interface VendorProfileData {
  name: string;
  email: string;
  phone: string;
  location: {
    state: string;
    district: string;
    market: string;
    coordinates?: { lat: number; lng: number };
  };
  preferredLanguage: string;
  secondaryLanguages?: string[];
  businessType: 'farmer' | 'trader' | 'wholesaler' | 'retailer';
}

export interface VendorProfileUpdate {
  name?: string;
  phone?: string;
  location?: {
    state?: string;
    district?: string;
    market?: string;
    coordinates?: { lat: number; lng: number };
  };
  preferredLanguage?: string;
  secondaryLanguages?: string[];
  businessType?: 'farmer' | 'trader' | 'wholesaler' | 'retailer';
}

export interface VerificationDocument {
  documentType: string;
  documentNumber: string;
  documentUrl: string;
}

export interface VerificationResult {
  success: boolean;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  message: string;
  verifiedBy?: string;
}

export interface TradingSummary {
  totalTrades: number;
  successfulTrades: number;
  averageRating: number;
  totalVolume: number;
  preferredCommodities: string[];
  lastTradeDate?: Date;
}

export interface TrustRating {
  id: string;
  raterId: string;
  ratedVendorId: string;
  sessionId: string;
  rating: number;
  deliveryRating?: number;
  communicationRating?: number;
  qualityRating?: number;
  feedback?: string;
  createdAt: Date;
}

export interface VendorSearchFilters {
  location?: { state?: string; district?: string; market?: string };
  businessType?: string;
  verificationStatus?: string;
  minTrustScore?: number;
  limit?: number;
  offset?: number;
}

// Rating and Feedback Service Types
export interface RatingSubmission {
  raterId: string;
  ratedVendorId: string;
  sessionId: string;
  rating: number;
  deliveryRating?: number;
  communicationRating?: number;
  qualityRating?: number;
  feedback?: string;
}

export interface RatingStats {
  averageRating: number;
  totalRatings: number;
  ratingDistribution: { [key: number]: number };
  averageDeliveryRating: number;
  averageCommunicationRating: number;
  averageQualityRating: number;
  recentRatings: TrustRating[];
}

export interface VendorReliabilityScore {
  vendorId: string;
  overallScore: number;
  ratingScore: number;
  completionRate: number;
  responseTime: number;
  verificationBonus: number;
  lastUpdated: Date;
}

// Negotiation Service Types
export interface MarketContext {
  commodity: string;
  quantity: number;
  location?: string;
  quality?: string;
  deliveryTerms?: string;
  urgency?: 'low' | 'medium' | 'high';
  seasonality?: 'peak' | 'off-peak' | 'normal';
}

export interface PriceSuggestion {
  suggestedPrice: number;
  reasoning: string;
  confidenceLevel: number;
  marketJustification: string;
  priceRange: {
    minimum: number;
    maximum: number;
    optimal: number;
  };
}

export interface NegotiationOffer {
  offerId: string;
  sessionId: string;
  fromVendorId: string;
  toVendorId: string;
  commodity: string;
  quantity: number;
  proposedPrice: number;
  currentMarketPrice: number;
  offerType: 'initial' | 'counter' | 'final';
  timestamp: Date;
  expiresAt?: Date;
  terms?: {
    deliveryLocation?: string;
    deliveryDate?: Date;
    paymentTerms?: string;
    qualitySpecs?: string;
  };
}

export interface OfferAnalysis {
  recommendation: 'accept' | 'counter' | 'reject';
  reasoning: string;
  marketDeviation: number; // percentage deviation from market price
  riskLevel: 'low' | 'medium' | 'high';
  suggestedCounterPrice?: number;
  negotiationStrategy: string;
  culturalConsiderations?: string;
}

export interface NegotiationStep {
  stepId: string;
  sessionId: string;
  vendorId: string;
  action: 'offer' | 'counter' | 'accept' | 'reject' | 'message';
  offer?: NegotiationOffer;
  message?: string;
  timestamp: Date;
  aiAssistanceUsed: boolean;
}

export interface ResponseRecommendation {
  recommendedAction: 'accept' | 'counter' | 'reject' | 'negotiate_terms';
  suggestedPrice?: number;
  reasoning: string;
  negotiationTactics: string[];
  culturalAdaptations: string[];
  riskAssessment: {
    level: 'low' | 'medium' | 'high';
    factors: string[];
  };
}

export interface DealEvaluation {
  dealQuality: 'excellent' | 'good' | 'fair' | 'poor';
  marketComparison: number; // percentage compared to market price
  profitMargin: number;
  riskFactors: string[];
  learningPoints: string[];
  overallScore: number; // 0-100
}

export interface NegotiationHistory {
  sessionId: string;
  participants: string[];
  commodity: string;
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  steps: NegotiationStep[];
  finalDeal?: {
    agreedPrice: number;
    marketPriceAtTime: number;
    dealQuality: string;
    buyerSatisfaction?: number;
    sellerSatisfaction?: number;
  };
  culturalContext: {
    region: string;
    tradingCustoms: string[];
    communicationStyle: string;
  };
}

export interface CulturalProfile {
  region: string;
  state: string;
  tradingCustoms: {
    negotiationStyle: 'direct' | 'indirect' | 'relationship-based';
    decisionMaking: 'quick' | 'deliberate' | 'consensus';
    priceFlexibility: 'high' | 'medium' | 'low';
    relationshipImportance: 'high' | 'medium' | 'low';
  };
  communicationPatterns: {
    formalityLevel: 'formal' | 'semi-formal' | 'informal';
    directness: 'direct' | 'indirect';
    timeOrientation: 'punctual' | 'flexible';
  };
  marketPractices: {
    commonPaymentTerms: string[];
    typicalDeliveryMethods: string[];
    qualityAssessmentMethods: string[];
    disputeResolutionPreferences: string[];
  };
}

export interface LearningData {
  sessionId: string;
  outcome: 'successful' | 'failed' | 'partial';
  marketConditions: {
    volatility: number;
    demand: 'high' | 'medium' | 'low';
    supply: 'high' | 'medium' | 'low';
    seasonality: 'peak' | 'off-peak' | 'normal';
  };
  negotiationMetrics: {
    duration: number; // minutes
    numberOfOffers: number;
    priceMovement: number; // percentage change from initial to final
    aiAccuracy: number; // how close AI suggestions were to final price
  };
  participantFeedback: {
    vendorId: string;
    satisfactionScore: number; // 1-5
    aiHelpfulness: number; // 1-5
    suggestions: string[];
  }[];
}

// Analytics and Reporting Types
export interface UserInteraction {
  id: string;
  vendorId: string;
  sessionId?: string;
  action: 'login' | 'logout' | 'price_lookup' | 'message_sent' | 'negotiation_start' | 'deal_completed' | 'profile_view';
  details: Record<string, any>;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface TradingPerformanceMetrics {
  vendorId: string;
  period: 'daily' | 'weekly' | 'monthly';
  startDate: Date;
  endDate: Date;
  totalTrades: number;
  successfulTrades: number;
  totalVolume: number;
  averagePrice: number;
  profitMargin: number;
  commodities: string[];
  averageNegotiationTime: number; // in minutes
  successRate: number; // percentage
}

export interface MarketTrendData {
  commodity: string;
  region: string;
  trendDirection: 'rising' | 'falling' | 'stable';
  changePercent: number;
  volatility: number;
  demandLevel: 'high' | 'medium' | 'low';
  supplyLevel: 'high' | 'medium' | 'low';
  seasonalFactor: number;
  predictedPrice: number;
  confidence: number;
  analysisDate: Date;
}

export interface WeeklyTradingSummary {
  vendorId: string;
  weekStartDate: Date;
  weekEndDate: Date;
  totalTrades: number;
  successfulTrades: number;
  totalVolume: number;
  averagePrice: number;
  profitMargin: number;
  topCommodities: Array<{ commodity: string; volume: number; profit: number }>;
  marketPerformance: {
    bestPerformingCommodity: string;
    worstPerformingCommodity: string;
    averageNegotiationTime: number;
  };
  recommendations: string[];
  generatedAt: Date;
}

export interface MarketInsight {
  id: string;
  vendorId: string;
  insightType: 'price_opportunity' | 'market_trend' | 'seasonal_advice' | 'performance_tip';
  title: string;
  message: string;
  actionable: boolean;
  priority: 'low' | 'medium' | 'high';
  relatedCommodities: string[];
  validUntil: Date;
  createdAt: Date;
  delivered: boolean;
  deliveredAt?: Date;
}

export interface AnalyticsExportData {
  vendorId: string;
  exportType: 'trading_history' | 'performance_metrics' | 'market_insights' | 'complete_profile';
  data: any;
  format: 'csv' | 'json';
  generatedAt: Date;
  downloadUrl?: string;
}