export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  component: string;
  message: string;
  metadata?: Record<string, any>;
}

export class Logger {
  private component: string;
  private logLevel: LogLevel;

  constructor(component: string, logLevel: LogLevel = 'info') {
    this.component = component;
    this.logLevel = logLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3
    };

    return levels[level] >= levels[this.logLevel];
  }

  private formatLog(level: LogLevel, message: string, metadata?: Record<string, any>): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      message,
      metadata
    };
  }

  private writeLog(logEntry: LogEntry): void {
    const logString = JSON.stringify(logEntry);
    
    switch (logEntry.level) {
      case 'debug':
        console.debug(logString);
        break;
      case 'info':
        console.info(logString);
        break;
      case 'warn':
        console.warn(logString);
        break;
      case 'error':
        console.error(logString);
        break;
    }
  }

  public debug(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog('debug')) {
      this.writeLog(this.formatLog('debug', message, metadata));
    }
  }

  public info(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog('info')) {
      this.writeLog(this.formatLog('info', message, metadata));
    }
  }

  public warn(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog('warn')) {
      this.writeLog(this.formatLog('warn', message, metadata));
    }
  }

  public error(message: string, metadata?: Record<string, any>): void {
    if (this.shouldLog('error')) {
      this.writeLog(this.formatLog('error', message, metadata));
    }
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }
}