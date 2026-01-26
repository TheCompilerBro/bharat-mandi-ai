import { Pool } from 'pg';
import { MongoClient, Db, Collection } from 'mongodb';
import { DatabaseManager } from '../config/database';
import { AnalyticsService, WeeklyTradingSummary, AnalyticsExportData, MarketInsight } from './analytics.service';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ReportingService {
  generateWeeklyReport(vendorId: string): Promise<WeeklyTradingSummary>;
  exportTradingData(vendorId: string, format: 'csv' | 'json'): Promise<AnalyticsExportData>;
  scheduleWeeklyReports(): Promise<void>;
  deliverPersonalizedInsights(vendorId: string): Promise<void>;
}

export interface ReportSchedule {
  id: string;
  vendorId: string;
  reportType: 'weekly_summary' | 'monthly_performance' | 'market_insights';
  frequency: 'weekly' | 'monthly';
  nextRunDate: Date;
  isActive: boolean;
  deliveryMethod: 'email' | 'sms' | 'in_app';
  createdAt: Date;
}

export interface ReportDelivery {
  id: string;
  vendorId: string;
  reportType: string;
  deliveryMethod: string;
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  sentAt?: Date;
  deliveredAt?: Date;
  errorMessage?: string;
}

export interface ReportingDependencies {
  pgPool: Pool;
  mongoDb: Db;
  analyticsService: AnalyticsService;
}

export class MandiReportingService implements ReportingService {
  private pgPool: Pool;
  private mongoDb: Db;
  private analyticsService: AnalyticsService;
  private reportsCollection: Collection;
  private deliveryCollection: Collection;

  constructor(dependencies?: ReportingDependencies) {
    if (dependencies) {
      this.pgPool = dependencies.pgPool;
      this.mongoDb = dependencies.mongoDb;
      this.analyticsService = dependencies.analyticsService;
    } else {
      this.pgPool = DatabaseManager.getInstance().getPostgreSQLPool();
      this.mongoDb = DatabaseManager.getInstance().getMongoDatabase();
      this.analyticsService = new AnalyticsService();
    }
    
    this.reportsCollection = this.mongoDb.collection('report_schedules');
    this.deliveryCollection = this.mongoDb.collection('report_deliveries');
  }

  // Generate Weekly Trading Report (Requirement 8.1)
  async generateWeeklyReport(vendorId: string): Promise<WeeklyTradingSummary> {
    try {
      const summary = await this.analyticsService.generateWeeklyTradingSummary(vendorId);
      
      // Store the summary in database
      const client = await this.pgPool.connect();
      
      try {
        await client.query(`
          INSERT INTO weekly_trading_summaries (
            vendor_id, week_start_date, week_end_date, total_trades, 
            successful_trades, total_volume, average_price, profit_margin,
            top_commodities, market_performance, recommendations
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (vendor_id, week_start_date) 
          DO UPDATE SET
            total_trades = EXCLUDED.total_trades,
            successful_trades = EXCLUDED.successful_trades,
            total_volume = EXCLUDED.total_volume,
            average_price = EXCLUDED.average_price,
            profit_margin = EXCLUDED.profit_margin,
            top_commodities = EXCLUDED.top_commodities,
            market_performance = EXCLUDED.market_performance,
            recommendations = EXCLUDED.recommendations,
            generated_at = NOW()
        `, [
          vendorId,
          summary.weekStartDate,
          summary.weekEndDate,
          summary.totalTrades,
          summary.successfulTrades,
          summary.totalVolume,
          summary.averagePrice,
          summary.profitMargin,
          JSON.stringify(summary.topCommodities),
          JSON.stringify(summary.marketPerformance),
          summary.recommendations
        ]);

        return summary;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error generating weekly report:', error);
      throw error;
    }
  }

  // Export Trading Data in CSV/JSON format (Requirement 8.3)
  async exportTradingData(vendorId: string, format: 'csv' | 'json' = 'csv'): Promise<AnalyticsExportData> {
    try {
      // Create export request record
      const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const client = await this.pgPool.connect();
      
      try {
        // Record export request
        await client.query(`
          INSERT INTO data_export_requests (
            id, vendor_id, export_type, file_format, status, expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          exportId,
          vendorId,
          'complete_profile',
          format,
          'processing',
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // Expires in 7 days
        ]);

        // Generate export data
        const exportData = await this.analyticsService.exportVendorData(vendorId, 'complete_profile');
        
        let formattedData: string;
        let fileName: string;
        
        if (format === 'csv') {
          formattedData = this.generateCSVExport(exportData.data);
          fileName = `vendor_${vendorId}_export_${Date.now()}.csv`;
        } else {
          formattedData = JSON.stringify(exportData.data, null, 2);
          fileName = `vendor_${vendorId}_export_${Date.now()}.json`;
        }

        // In a real implementation, this would save to cloud storage (S3, etc.)
        // For now, we'll simulate the file path
        const filePath = `/exports/${fileName}`;
        const downloadUrl = `https://api.mandichallenge.com/exports/${fileName}`;

        // Update export request with completion
        await client.query(`
          UPDATE data_export_requests 
          SET status = 'completed', 
              file_path = $1, 
              download_url = $2,
              file_size_bytes = $3,
              completed_at = NOW()
          WHERE id = $4
        `, [filePath, downloadUrl, Buffer.byteLength(formattedData, 'utf8'), exportId]);

        // Return the export data with proper structure for property tests
        return {
          vendorId,
          exportType: 'complete_profile',
          data: exportData.data,
          format,
          generatedAt: new Date(),
          downloadUrl
        };
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error exporting trading data:', error);
      throw error;
    }
  }

  // Schedule Weekly Reports for All Active Vendors (Requirement 8.1)
  async scheduleWeeklyReports(): Promise<void> {
    try {
      const client = await this.pgPool.connect();
      
      try {
        // Get all active vendors who have opted in for weekly summaries
        const vendorsQuery = `
          SELECT v.id, v.email, v.name, vap.weekly_summary_enabled, vap.preferred_delivery_method
          FROM vendors v
          LEFT JOIN vendor_analytics_preferences vap ON v.id = vap.vendor_id
          WHERE v.verification_status = 'verified' 
            AND v.last_active >= NOW() - INTERVAL '30 days'
            AND (vap.weekly_summary_enabled IS NULL OR vap.weekly_summary_enabled = true)
        `;

        const vendorsResult = await client.query(vendorsQuery);
        const activeVendors = vendorsResult.rows;

        console.log(`Scheduling weekly reports for ${activeVendors.length} active vendors`);

        for (const vendor of activeVendors) {
          try {
            // Generate weekly report
            const summary = await this.generateWeeklyReport(vendor.id);
            
            // Deliver the report
            await this.deliverWeeklyReport(vendor, summary);
            
            console.log(`Weekly report generated and delivered for vendor ${vendor.id}`);
          } catch (error) {
            console.error(`Failed to generate weekly report for vendor ${vendor.id}:`, error);
          }
        }
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error scheduling weekly reports:', error);
      throw error;
    }
  }

  // Deliver Personalized Market Insights (Requirement 8.5)
  async deliverPersonalizedInsights(vendorId: string): Promise<void> {
    try {
      // Generate fresh insights
      const insights = await this.analyticsService.generatePersonalizedInsights(vendorId);
      
      if (insights.length === 0) {
        console.log(`No new insights generated for vendor ${vendorId}`);
        return;
      }

      const client = await this.pgPool.connect();
      
      try {
        // Get vendor's delivery preferences
        const preferencesQuery = `
          SELECT preferred_delivery_method, insight_notifications_enabled
          FROM vendor_analytics_preferences 
          WHERE vendor_id = $1
        `;
        
        const preferencesResult = await client.query(preferencesQuery, [vendorId]);
        const preferences = preferencesResult.rows[0] || { 
          preferred_delivery_method: 'email', 
          insight_notifications_enabled: true 
        };

        if (!preferences.insight_notifications_enabled) {
          console.log(`Insights delivery disabled for vendor ${vendorId}`);
          return;
        }

        // Deliver each insight
        for (const insight of insights) {
          await this.deliverInsight(vendorId, insight, preferences.preferred_delivery_method);
        }

        // Mark insights as delivered in analytics service
        await this.analyticsService.deliverInsights(vendorId);

      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error delivering personalized insights:', error);
      throw error;
    }
  }

  // Get Historical Reports for a Vendor
  async getVendorReports(vendorId: string, limit: number = 10): Promise<WeeklyTradingSummary[]> {
    try {
      const client = await this.pgPool.connect();
      
      try {
        const query = `
          SELECT 
            vendor_id as "vendorId",
            week_start_date as "weekStartDate",
            week_end_date as "weekEndDate",
            total_trades as "totalTrades",
            successful_trades as "successfulTrades",
            total_volume as "totalVolume",
            average_price as "averagePrice",
            profit_margin as "profitMargin",
            top_commodities as "topCommodities",
            market_performance as "marketPerformance",
            recommendations,
            generated_at as "generatedAt"
          FROM weekly_trading_summaries
          WHERE vendor_id = $1
          ORDER BY week_start_date DESC
          LIMIT $2
        `;

        const result = await client.query(query, [vendorId, limit]);
        
        return result.rows.map(row => ({
          ...row,
          weekStartDate: new Date(row.weekStartDate),
          weekEndDate: new Date(row.weekEndDate),
          generatedAt: new Date(row.generatedAt),
          topCommodities: typeof row.topCommodities === 'string' ? 
            JSON.parse(row.topCommodities) : row.topCommodities,
          marketPerformance: typeof row.marketPerformance === 'string' ? 
            JSON.parse(row.marketPerformance) : row.marketPerformance
        }));
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting vendor reports:', error);
      throw error;
    }
  }

  // Get Export History for a Vendor
  async getExportHistory(vendorId: string): Promise<any[]> {
    try {
      const client = await this.pgPool.connect();
      
      try {
        const query = `
          SELECT 
            id,
            export_type,
            file_format,
            status,
            download_url,
            file_size_bytes,
            requested_at,
            completed_at,
            expires_at,
            error_message
          FROM data_export_requests
          WHERE vendor_id = $1
          ORDER BY requested_at DESC
        `;

        const result = await client.query(query, [vendorId]);
        return result.rows;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error getting export history:', error);
      throw error;
    }
  }

  // Private helper methods
  private async deliverWeeklyReport(vendor: any, summary: WeeklyTradingSummary): Promise<void> {
    try {
      const deliveryId = `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // In a real implementation, this would send actual emails/SMS
      console.log(`Delivering weekly report to ${vendor.email}:`);
      console.log(`- Total Trades: ${summary.totalTrades}`);
      console.log(`- Success Rate: ${((summary.successfulTrades / summary.totalTrades) * 100).toFixed(1)}%`);
      console.log(`- Top Commodity: ${summary.topCommodities[0]?.commodity || 'None'}`);
      
      // Log delivery attempt
      await this.deliveryCollection.insertOne({
        id: deliveryId,
        vendorId: vendor.id,
        reportType: 'weekly_summary',
        deliveryMethod: vendor.preferred_delivery_method || 'email',
        status: 'delivered',
        sentAt: new Date(),
        deliveredAt: new Date()
      });

    } catch (error) {
      console.error(`Error delivering weekly report to vendor ${vendor.id}:`, error);
      
      // Log delivery failure
      await this.deliveryCollection.insertOne({
        id: `delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        vendorId: vendor.id,
        reportType: 'weekly_summary',
        deliveryMethod: vendor.preferred_delivery_method || 'email',
        status: 'failed',
        sentAt: new Date(),
        errorMessage: error.message
      });
    }
  }

  private async deliverInsight(vendorId: string, insight: MarketInsight, deliveryMethod: string): Promise<void> {
    try {
      const deliveryId = `insight_delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // In a real implementation, this would send actual notifications
      console.log(`Delivering insight to vendor ${vendorId} via ${deliveryMethod}:`);
      console.log(`- Title: ${insight.title}`);
      console.log(`- Message: ${insight.message}`);
      console.log(`- Priority: ${insight.priority}`);
      
      const client = await this.pgPool.connect();
      
      try {
        // Log insight delivery
        await client.query(`
          INSERT INTO insight_delivery_log (
            id, vendor_id, insight_id, delivery_method, 
            delivery_status, delivered_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          deliveryId,
          vendorId,
          insight.id,
          deliveryMethod,
          'delivered',
          new Date()
        ]);
      } finally {
        client.release();
      }

    } catch (error) {
      console.error(`Error delivering insight to vendor ${vendorId}:`, error);
      
      const client = await this.pgPool.connect();
      
      try {
        // Log delivery failure
        await client.query(`
          INSERT INTO insight_delivery_log (
            id, vendor_id, insight_id, delivery_method, 
            delivery_status, error_message
          ) VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          `insight_delivery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          vendorId,
          insight.id,
          deliveryMethod,
          'failed',
          error.message
        ]);
      } finally {
        client.release();
      }
    }
  }

  private generateCSVExport(data: any): string {
    try {
      if (!data || typeof data !== 'object') {
        return '';
      }

      let csvContent = '';

      // Export vendor profile
      if (data.profile) {
        csvContent += 'VENDOR PROFILE\n';
        csvContent += this.objectToCSV([data.profile]);
        csvContent += '\n\n';
      }

      // Export trading history
      if (data.tradingHistory && Array.isArray(data.tradingHistory)) {
        csvContent += 'TRADING HISTORY\n';
        csvContent += this.objectToCSV(data.tradingHistory);
        csvContent += '\n\n';
      }

      // Export performance metrics
      if (data.performanceMetrics && Array.isArray(data.performanceMetrics)) {
        csvContent += 'PERFORMANCE METRICS\n';
        csvContent += this.objectToCSV(data.performanceMetrics);
        csvContent += '\n\n';
      }

      // Export market insights
      if (data.marketInsights && Array.isArray(data.marketInsights)) {
        csvContent += 'MARKET INSIGHTS\n';
        csvContent += this.objectToCSV(data.marketInsights);
        csvContent += '\n\n';
      }

      return csvContent;
    } catch (error) {
      console.error('Error generating CSV export:', error);
      return 'Error generating CSV export';
    }
  }

  private objectToCSV(objects: any[]): string {
    if (!objects || objects.length === 0) {
      return '';
    }

    // Get all unique keys from all objects
    const allKeys = new Set<string>();
    objects.forEach(obj => {
      Object.keys(obj).forEach(key => allKeys.add(key));
    });

    const headers = Array.from(allKeys);
    
    // Create CSV header
    const csvHeaders = headers.join(',');
    
    // Create CSV rows
    const csvRows = objects.map(obj => {
      return headers.map(header => {
        const value = obj[header];
        
        // Handle different data types
        if (value === null || value === undefined) {
          return '';
        }
        
        if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        
        if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        
        return value.toString();
      }).join(',');
    });

    return [csvHeaders, ...csvRows].join('\n');
  }

  // Cleanup expired exports and old data
  async cleanupExpiredData(): Promise<void> {
    try {
      const client = await this.pgPool.connect();
      
      try {
        // Run the cleanup function
        await client.query('SELECT cleanup_expired_exports()');
        console.log('Expired data cleanup completed');
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error during data cleanup:', error);
    }
  }
}