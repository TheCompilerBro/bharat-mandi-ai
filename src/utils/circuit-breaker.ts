export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  totalRequests: number;
  failureRate: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  nextRetryTime?: Date;
}

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private state: CircuitBreakerState;
  private failures: number;
  private successes: number;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private nextRetryTime?: Date;
  private monitoringWindow: { timestamp: Date; success: boolean }[];

  constructor(config: CircuitBreakerConfig) {
    this.config = config;
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.monitoringWindow = [];
  }

  public recordSuccess(): void {
    this.lastSuccessTime = new Date();
    this.successes++;
    this.addToMonitoringWindow(true);

    if (this.state === 'half-open') {
      // If we're in half-open state and got a success, close the circuit
      this.state = 'closed';
      this.failures = 0;
      this.nextRetryTime = undefined;
    }
  }

  public recordFailure(): void {
    this.lastFailureTime = new Date();
    this.failures++;
    this.addToMonitoringWindow(false);

    const failureRate = this.calculateFailureRate();
    
    if (this.state === 'closed' && failureRate >= this.config.failureThreshold) {
      // Open the circuit
      this.state = 'open';
      this.nextRetryTime = new Date(Date.now() + this.config.recoveryTimeout);
    } else if (this.state === 'half-open') {
      // If we're in half-open state and got a failure, go back to open
      this.state = 'open';
      this.nextRetryTime = new Date(Date.now() + this.config.recoveryTimeout);
    }
  }

  public isOpen(): boolean {
    if (this.state === 'closed') {
      return false;
    }

    if (this.state === 'open' && this.nextRetryTime && Date.now() >= this.nextRetryTime.getTime()) {
      // Transition to half-open state
      this.state = 'half-open';
      return false;
    }

    return this.state === 'open';
  }

  public getState(): CircuitBreakerState {
    // Update state if necessary
    this.isOpen();
    return this.state;
  }

  public getStats(): CircuitBreakerStats {
    const totalRequests = this.failures + this.successes;
    const failureRate = this.calculateFailureRate();

    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      totalRequests,
      failureRate,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      nextRetryTime: this.nextRetryTime
    };
  }

  public reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.nextRetryTime = undefined;
    this.monitoringWindow = [];
  }

  private addToMonitoringWindow(success: boolean): void {
    const now = new Date();
    this.monitoringWindow.push({ timestamp: now, success });

    // Remove entries older than monitoring period
    const cutoffTime = new Date(now.getTime() - this.config.monitoringPeriod);
    this.monitoringWindow = this.monitoringWindow.filter(
      entry => entry.timestamp >= cutoffTime
    );
  }

  private calculateFailureRate(): number {
    if (this.monitoringWindow.length === 0) {
      return 0;
    }

    const failures = this.monitoringWindow.filter(entry => !entry.success).length;
    return failures / this.monitoringWindow.length;
  }

  public updateConfig(config: Partial<CircuitBreakerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}