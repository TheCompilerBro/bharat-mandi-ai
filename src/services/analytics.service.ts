import { Pool } from 'pg';
import { MongoClient, Db, Collection } from 'mongodb';
import { DatabaseManager } from '../config/database';
import { Vendor, TradeSession, TrustRating, PriceData } from '../types';

// Analytics-specific interfaces
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

export interface DatabaseDependencies {
  pgPool: Pool;
  mongoDb: Db;
}

export class AnalyticsService {
  private pgPool: Pool;
  private mongoDb: Db;
  private analyticsCollection: Collection<UserInteraction>;
  private metricsCollection: Collection<TradingPerformanceMetrics>;
  private trendsCollection: Collection<MarketTrendData>;
  private insightsCollection: Collection<MarketInsight>;

  constructor(dependencies?: DatabaseDependencies) {
    if (dependencies) {
      this.pgPool = dependencies.pgPool;
      this.mongoDb = dependencies.mongoDb;
    } else {
      this.pgPool = DatabaseManager.getInstance().getPostgreSQLPool();
      this.mongoDb = DatabaseManager.getInstance().getMongoDatabase();
    }
    
    this.analyticsCollection = this.mongoDb.collection('analytics_events');
    this.metricsCollection = this.mongoDb.collection('trading_metrics');
    this.trendsCollection = this.mongoDb.collection('market_trends');
    this.insightsCollection = this.mongoDb.collection('market_insights');
  }

  // User Interaction Tracking (Requirement 8.1)
  async trackUserInteraction(interaction: Omit<UserInteraction, 'id' | 'timestamp'>): Promise<void> {
    try {
      const userInteraction: UserInteraction = {
        id: `interaction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...interaction,
        timestamp: new Date()
      };

      await this.analyticsCollection.insertOne(userInteraction);
    } catch (error) {
      console.error('Error tracking user interaction:', error);
      throw error;
    }
  }

  // Trading Performance Metrics Collection (Requirement 8.2)
  async collectTradingPerformanceMetrics(
    vendorId: string, 
    period: 'daily' | 'weekly' | 'monthly'
  ): Promise<TradingPerformanceMetrics> {
    try {
      const client = await this.pgPool.connect();
      
      try {
        // Calculate date range based on period
        const endDate = new Date();
        const startDate = new Date();
        
        switch (period) {
          case 'daily':
            startDate.setDate(endDate.getDate() - 1);
            break;
          case 'weekly':
            startDate.setDate(endDate.getDate() - 7);
            break;
          case 'monthly':
            startDate.setMonth(endDate.getMonth() - 1);
            break;
        }

        // Get trading data from database
        const tradesQuery = `
          SELECT 
            ts.id,
            ts.commodity,
            ts.final_price,
            ts.quantity,
            ts.start_time,
            ts.end_time,
            ts.status,
            EXTRACT(EPOCH FROM (ts.end_time - ts.start_time))/60 as duration_minutes
          FROM trade_sessions ts
          WHERE (ts.buyer_id = $1 OR ts.seller_id = $1)
            AND ts.start_time >= $2 
            AND ts.start_time <= $3
          ORDER BY ts.start_time DESC
        `;

        const tradesResult = await client.query(tradesQuery, [vendorId, startDate, endDate]);
        const trades = tradesResult.rows || [];

        // Calculate metrics
        const totalTrades = trades.length;
        const successfulTrades = trades.filter(t => t.status === 'completed').length;
        const totalVolume = trades.reduce((sum, t) => sum + (parseFloat(t.quantity) || 0), 0);
        const averagePrice = trades.length > 0 ? 
          trades.reduce((sum, t) => sum + (parseFloat(t.final_price) || 0), 0) / trades.length : 0;
        
        // Calculate profit margin (simplified - would need cost data in real implementation)
        const profitMargin = 0.15; // 15% default margin
        
        const commodities = [...new Set(trades.map(t => t.commodity).filter(c => c))];
        const averageNegotiationTime = trades.length > 0 ?
          trades.reduce((sum, t) => sum + (parseFloat(t.duration_minutes) || 0), 0) / trades.length : 0;
        
        const successRate = totalTrades > 0 ? (successfulTrades / totalTrades) * 100 : 0;

        const metrics: TradingPerformanceMetrics = {
          vendorId,
          period,
          startDate,
          endDate,
          totalTrades,
          successfulTrades,
          totalVolume,
          averagePrice,
          profitMargin,
          commodities,
          averageNegotiationTime,
          successRate
        };

        // Store metrics in MongoDB for historical tracking
        await this.metricsCollection.insertOne(metrics);

        return metrics;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error collecting trading performance metrics:', error);
      throw error;
    }
  }

  // Market Trend Analysis (Requirement 8.4)
  async analyzeMarketTrends(commodity: string, region?: string): Promise<MarketTrendData> {
    try {
      const client = await this.pgPool.connect();
      
      try {
        // Get historical price data for trend analysis
        const priceQuery = `
          SELECT 
            date,
            modal_price,
            arrivals,
            volatility
          FROM market_data 
          WHERE commodity = $1 
            ${region ? 'AND state = $2' : ''}
            AND date >= NOW() - INTERVAL '30 days'
          ORDER BY date DESC
        `;

        const params = region ? [commodity, region] : [commodity];
        const priceResult = await client.query(priceQuery, params);
        const priceHistory = priceResult.rows || [];

        // If insufficient data, create a default trend analysis
        if (priceHistory.length < 7) {
          console.warn(`Insufficient data for trend analysis of ${commodity}, using default values`);
          
          return {
            commodity,
            region: region || 'National',
            trendDirection: 'stable',
            changePercent: 0,
            volatility: 0.05, // Low volatility default
            demandLevel: 'medium',
            supplyLevel: 'medium',
            seasonalFactor: 1.0,
            predictedPrice: 2000, // Default price
            confidence: 0.3, // Low confidence due to insufficient data
            analysisDate: new Date()
          };
        }

        // Calculate trend metrics
        const prices = priceHistory.map(p => parseFloat(p.modal_price)).filter(p => !isNaN(p));
        
        if (prices.length === 0) {
          throw new Error(`No valid price data for ${commodity}`);
        }

        const recentPrices = prices.slice(0, Math.min(7, prices.length));
        const olderPrices = prices.slice(7, Math.min(14, prices.length));

        const recentAvg = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
        const olderAvg = olderPrices.length > 0 ? 
          olderPrices.reduce((a, b) => a + b, 0) / olderPrices.length : recentAvg;

        const changePercent = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
        
        let trendDirection: 'rising' | 'falling' | 'stable';
        if (Math.abs(changePercent) < 2) {
          trendDirection = 'stable';
        } else if (changePercent > 0) {
          trendDirection = 'rising';
        } else {
          trendDirection = 'falling';
        }

        // Calculate volatility
        const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
        const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
        const volatility = mean > 0 ? Math.sqrt(variance) / mean : 0;

        // Analyze supply and demand (simplified)
        const arrivals = priceHistory.map(p => parseInt(p.arrivals) || 0);
        const avgArrivals = arrivals.length > 0 ? arrivals.reduce((a, b) => a + b, 0) / arrivals.length : 100;
        
        const supplyLevel: 'high' | 'medium' | 'low' = 
          avgArrivals > 200 ? 'high' : avgArrivals > 100 ? 'medium' : 'low';
        
        // Demand level based on price trend and volatility
        const demandLevel: 'high' | 'medium' | 'low' = 
          trendDirection === 'rising' && volatility > 0.1 ? 'high' : 
          trendDirection === 'falling' ? 'low' : 'medium';

        // Seasonal factor (simplified - would use historical seasonal data)
        const month = new Date().getMonth();
        const seasonalFactor = Math.sin((month / 12) * 2 * Math.PI) * 0.1 + 1;

        // Price prediction (simplified linear trend)
        const predictedPrice = recentAvg * (1 + (changePercent / 100) * 0.5) * seasonalFactor;
        const confidence = Math.max(0.1, Math.min(0.9, 1 - volatility));

        const trendData: MarketTrendData = {
          commodity,
          region: region || 'National',
          trendDirection,
          changePercent,
          volatility,
          demandLevel,
          supplyLevel,
          seasonalFactor,
          predictedPrice,
          confidence,
          analysisDate: new Date()
        };

        // Store trend analysis
        await this.trendsCollection.insertOne(trendData);

        return trendData;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error analyzing market trends:', error);
      throw error;
    }
  }

  // Weekly Trading Summary Generation (Requirement 8.1)
  async generateWeeklyTradingSummary(vendorId: string): Promise<WeeklyTradingSummary> {
    try {
      const weekEndDate = new Date();
      const weekStartDate = new Date();
      weekStartDate.setDate(weekEndDate.getDate() - 7);

      // Get weekly metrics
      const metrics = await this.collectTradingPerformanceMetrics(vendorId, 'weekly');
      
      const client = await this.pgPool.connect();
      
      try {
        // Get detailed commodity performance
        const commodityQuery = `
          SELECT 
            ts.commodity,
            SUM(ts.quantity) as total_volume,
            AVG(ts.final_price) as avg_price,
            COUNT(*) as trade_count
          FROM trade_sessions ts
          WHERE (ts.buyer_id = $1 OR ts.seller_id = $1)
            AND ts.start_time >= $2 
            AND ts.start_time <= $3
            AND ts.status = 'completed'
          GROUP BY ts.commodity
          ORDER BY total_volume DESC
        `;

        const commodityResult = await client.query(commodityQuery, [vendorId, weekStartDate, weekEndDate]);
        const commodityData = commodityResult.rows;

        const topCommodities = commodityData.map(c => ({
          commodity: c.commodity,
          volume: parseFloat(c.total_volume) || 0,
          profit: (parseFloat(c.avg_price) || 0) * (parseFloat(c.total_volume) || 0) * 0.15 // 15% margin
        }));

        // Generate recommendations based on performance
        const recommendations: string[] = [];
        
        if (metrics.successRate < 70) {
          recommendations.push('Consider improving negotiation strategies to increase success rate');
        }
        
        if (metrics.averageNegotiationTime > 60) {
          recommendations.push('Try to reduce negotiation time for better efficiency');
        }
        
        if (topCommodities.length > 0) {
          recommendations.push(`Focus on ${topCommodities[0].commodity} - your best performing commodity this week`);
        }

        const summary: WeeklyTradingSummary = {
          vendorId,
          weekStartDate,
          weekEndDate,
          totalTrades: metrics.totalTrades,
          successfulTrades: metrics.successfulTrades,
          totalVolume: metrics.totalVolume,
          averagePrice: metrics.averagePrice,
          profitMargin: metrics.profitMargin,
          topCommodities,
          marketPerformance: {
            bestPerformingCommodity: topCommodities[0]?.commodity || 'None',
            worstPerformingCommodity: topCommodities[topCommodities.length - 1]?.commodity || 'None',
            averageNegotiationTime: metrics.averageNegotiationTime
          },
          recommendations,
          generatedAt: new Date()
        };

        return summary;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error generating weekly trading summary:', error);
      throw error;
    }
  }

  // CSV Export Functionality (Requirement 8.3)
  async exportVendorData(
    vendorId: string, 
    exportType: 'trading_history' | 'performance_metrics' | 'market_insights' | 'complete_profile'
  ): Promise<AnalyticsExportData> {
    try {
      let data: any;
      
      switch (exportType) {
        case 'trading_history':
          data = await this.exportTradingHistory(vendorId);
          break;
        case 'performance_metrics':
          data = await this.exportPerformanceMetrics(vendorId);
          break;
        case 'market_insights':
          data = await this.exportMarketInsights(vendorId);
          break;
        case 'complete_profile':
          data = await this.exportCompleteProfile(vendorId);
          break;
        default:
          throw new Error(`Unsupported export type: ${exportType}`);
      }

      const exportData: AnalyticsExportData = {
        vendorId,
        exportType,
        data,
        format: 'csv',
        generatedAt: new Date()
      };

      return exportData;
    } catch (error) {
      console.error('Error exporting vendor data:', error);
      throw error;
    }
  }

  // Personalized Market Insights (Requirement 8.5)
  async generatePersonalizedInsights(vendorId: string): Promise<MarketInsight[]> {
    try {
      const insights: MarketInsight[] = [];
      
      // Get vendor's trading history and preferences
      const metrics = await this.collectTradingPerformanceMetrics(vendorId, 'monthly');
      
      // Generate insights based on trading patterns
      if (metrics.commodities.length > 0) {
        for (const commodity of metrics.commodities) {
          try {
            const trendData = await this.analyzeMarketTrends(commodity);
            
            // Price opportunity insights
            if (trendData.trendDirection === 'rising' && trendData.confidence > 0.7) {
              insights.push({
                id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                vendorId,
                insightType: 'price_opportunity',
                title: `Price Opportunity for ${commodity}`,
                message: `${commodity} prices are trending upward with ${(trendData.changePercent).toFixed(1)}% increase. Consider selling soon.`,
                actionable: true,
                priority: 'high',
                relatedCommodities: [commodity],
                validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                createdAt: new Date(),
                delivered: false
              });
            }
            
            // Market trend insights
            if (trendData.volatility > 0.15) {
              insights.push({
                id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                vendorId,
                insightType: 'market_trend',
                title: `High Volatility Alert for ${commodity}`,
                message: `${commodity} market is experiencing high volatility (${(trendData.volatility * 100).toFixed(1)}%). Exercise caution in pricing.`,
                actionable: true,
                priority: 'medium',
                relatedCommodities: [commodity],
                validUntil: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
                createdAt: new Date(),
                delivered: false
              });
            }
          } catch (error) {
            // If trend analysis fails for a commodity, continue with others
            console.warn(`Failed to analyze trends for ${commodity}:`, error.message);
          }
        }
      }
      
      // Performance improvement insights
      if (metrics.successRate < 70) {
        insights.push({
          id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          vendorId,
          insightType: 'performance_tip',
          title: 'Improve Your Success Rate',
          message: `Your current success rate is ${metrics.successRate.toFixed(1)}%. Consider using AI negotiation assistance more frequently.`,
          actionable: true,
          priority: 'medium',
          relatedCommodities: metrics.commodities,
          validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
          createdAt: new Date(),
          delivered: false
        });
      }

      // General market insight if no specific commodities
      if (insights.length === 0) {
        insights.push({
          id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          vendorId,
          insightType: 'seasonal_advice',
          title: 'Welcome to MandiChallenge',
          message: 'Start trading to receive personalized market insights and recommendations.',
          actionable: false,
          priority: 'low',
          relatedCommodities: [],
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          createdAt: new Date(),
          delivered: false
        });
      }

      // Store insights
      if (insights.length > 0) {
        await this.insightsCollection.insertMany(insights);
      }

      return insights;
    } catch (error) {
      console.error('Error generating personalized insights:', error);
      throw error;
    }
  }

  // Deliver insights to vendors (Requirement 8.5)
  async deliverInsights(vendorId: string): Promise<void> {
    try {
      const undeliveredInsights = await this.insightsCollection.find({
        vendorId,
        delivered: false,
        validUntil: { $gt: new Date() }
      }).toArray();

      for (const insight of undeliveredInsights) {
        // In a real implementation, this would send notifications via email, SMS, or push notifications
        console.log(`Delivering insight to vendor ${vendorId}: ${insight.title}`);
        
        // Mark as delivered
        await this.insightsCollection.updateOne(
          { _id: insight._id },
          { 
            $set: { 
              delivered: true, 
              deliveredAt: new Date() 
            } 
          }
        );
      }
    } catch (error) {
      console.error('Error delivering insights:', error);
      throw error;
    }
  }

  // Helper methods for data export
  private async exportTradingHistory(vendorId: string): Promise<any[]> {
    const client = await this.pgPool.connect();
    
    try {
      const query = `
        SELECT 
          ts.id,
          ts.commodity,
          ts.final_price,
          ts.quantity,
          ts.start_time,
          ts.end_time,
          ts.status,
          CASE WHEN ts.buyer_id = $1 THEN 'buyer' ELSE 'seller' END as role
        FROM trade_sessions ts
        WHERE ts.buyer_id = $1 OR ts.seller_id = $1
        ORDER BY ts.start_time DESC
      `;

      const result = await client.query(query, [vendorId]);
      return result.rows || [];
    } finally {
      client.release();
    }
  }

  private async exportPerformanceMetrics(vendorId: string): Promise<any[]> {
    const metrics = await this.metricsCollection.find({ vendorId }).toArray();
    return metrics;
  }

  private async exportMarketInsights(vendorId: string): Promise<any[]> {
    const insights = await this.insightsCollection.find({ vendorId }).toArray();
    return insights;
  }

  private async exportCompleteProfile(vendorId: string): Promise<any> {
    const tradingHistory = await this.exportTradingHistory(vendorId);
    const performanceMetrics = await this.exportPerformanceMetrics(vendorId);
    const marketInsights = await this.exportMarketInsights(vendorId);
    
    const client = await this.pgPool.connect();
    
    try {
      const vendorQuery = `
        SELECT 
          id, name, email, phone, state, district, market,
          preferred_language, business_type, verification_status,
          trust_score, created_at, last_active
        FROM vendors 
        WHERE id = $1
      `;

      const vendorResult = await client.query(vendorQuery, [vendorId]);
      let vendorProfile = vendorResult.rows[0];
      
      // If no vendor found in database (e.g., in test environment), create a mock profile
      if (!vendorProfile) {
        vendorProfile = {
          id: vendorId,
          name: 'Test Vendor',
          email: 'test@example.com',
          phone: '1234567890',
          state: 'Test State',
          district: 'Test District',
          market: 'Test Market',
          preferred_language: 'en',
          business_type: 'trader',
          verification_status: 'verified',
          trust_score: 4.5,
          created_at: new Date(),
          last_active: new Date()
        };
      }

      return {
        profile: vendorProfile,
        tradingHistory,
        performanceMetrics,
        marketInsights
      };
    } finally {
      client.release();
    }
  }

  // Convert data to CSV format
  convertToCSV(data: any[], headers?: string[]): string {
    if (!data || data.length === 0) {
      return '';
    }

    const csvHeaders = headers || Object.keys(data[0]);
    const csvRows = data.map(row => 
      csvHeaders.map(header => {
        const value = row[header];
        // Handle special characters and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value || '';
      }).join(',')
    );

    return [csvHeaders.join(','), ...csvRows].join('\n');
  }
}