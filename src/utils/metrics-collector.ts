export interface MetricLabels {
  [key: string]: string;
}

export interface CounterMetric {
  name: string;
  value: number;
  labels: MetricLabels;
  timestamp: Date;
}

export interface HistogramMetric {
  name: string;
  values: number[];
  labels: MetricLabels;
  timestamp: Date;
}

export interface GaugeMetric {
  name: string;
  value: number;
  labels: MetricLabels;
  timestamp: Date;
}

export class MetricsCollector {
  private counters: Map<string, CounterMetric>;
  private histograms: Map<string, HistogramMetric>;
  private gauges: Map<string, GaugeMetric>;

  constructor() {
    this.counters = new Map();
    this.histograms = new Map();
    this.gauges = new Map();
  }

  private getMetricKey(name: string, labels: MetricLabels = {}): string {
    const labelString = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');
    
    return labelString ? `${name}{${labelString}}` : name;
  }

  public incrementCounter(name: string, labels: MetricLabels = {}, increment: number = 1): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.counters.get(key);

    if (existing) {
      existing.value += increment;
      existing.timestamp = new Date();
    } else {
      this.counters.set(key, {
        name,
        value: increment,
        labels,
        timestamp: new Date()
      });
    }
  }

  public recordHistogram(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.getMetricKey(name, labels);
    const existing = this.histograms.get(key);

    if (existing) {
      existing.values.push(value);
      existing.timestamp = new Date();
      
      // Keep only last 1000 values to prevent memory issues
      if (existing.values.length > 1000) {
        existing.values = existing.values.slice(-1000);
      }
    } else {
      this.histograms.set(key, {
        name,
        values: [value],
        labels,
        timestamp: new Date()
      });
    }
  }

  public setGauge(name: string, value: number, labels: MetricLabels = {}): void {
    const key = this.getMetricKey(name, labels);
    
    this.gauges.set(key, {
      name,
      value,
      labels,
      timestamp: new Date()
    });
  }

  public getMetrics(): Record<string, any> {
    const result: Record<string, any> = {
      counters: {},
      histograms: {},
      gauges: {},
      timestamp: new Date().toISOString()
    };

    // Process counters
    for (const [key, metric] of this.counters.entries()) {
      result.counters[key] = {
        value: metric.value,
        labels: metric.labels,
        timestamp: metric.timestamp.toISOString()
      };
    }

    // Process histograms with statistics
    for (const [key, metric] of this.histograms.entries()) {
      const values = metric.values;
      const sorted = [...values].sort((a, b) => a - b);
      
      result.histograms[key] = {
        count: values.length,
        sum: values.reduce((sum, val) => sum + val, 0),
        min: Math.min(...values),
        max: Math.max(...values),
        mean: values.reduce((sum, val) => sum + val, 0) / values.length,
        p50: this.percentile(sorted, 0.5),
        p90: this.percentile(sorted, 0.9),
        p95: this.percentile(sorted, 0.95),
        p99: this.percentile(sorted, 0.99),
        labels: metric.labels,
        timestamp: metric.timestamp.toISOString()
      };
    }

    // Process gauges
    for (const [key, metric] of this.gauges.entries()) {
      result.gauges[key] = {
        value: metric.value,
        labels: metric.labels,
        timestamp: metric.timestamp.toISOString()
      };
    }

    return result;
  }

  private percentile(sortedValues: number[], percentile: number): number {
    if (sortedValues.length === 0) return 0;
    
    const index = Math.ceil(sortedValues.length * percentile) - 1;
    return sortedValues[Math.max(0, index)];
  }

  public resetMetrics(): void {
    this.counters.clear();
    this.histograms.clear();
    this.gauges.clear();
  }

  public getCounterValue(name: string, labels: MetricLabels = {}): number {
    const key = this.getMetricKey(name, labels);
    return this.counters.get(key)?.value || 0;
  }

  public getGaugeValue(name: string, labels: MetricLabels = {}): number {
    const key = this.getMetricKey(name, labels);
    return this.gauges.get(key)?.value || 0;
  }

  public getHistogramStats(name: string, labels: MetricLabels = {}): any {
    const key = this.getMetricKey(name, labels);
    const histogram = this.histograms.get(key);
    
    if (!histogram || histogram.values.length === 0) {
      return null;
    }

    const values = histogram.values;
    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      count: values.length,
      sum: values.reduce((sum, val) => sum + val, 0),
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((sum, val) => sum + val, 0) / values.length,
      p50: this.percentile(sorted, 0.5),
      p90: this.percentile(sorted, 0.9),
      p95: this.percentile(sorted, 0.95),
      p99: this.percentile(sorted, 0.99)
    };
  }
}