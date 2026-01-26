import axios from 'axios';
import { Logger } from '../utils/logger';
import { ServiceConfig } from './api-gateway';

export interface ServiceInstance {
  id: string;
  name: string;
  url: string;
  healthCheck: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  lastHealthCheck: Date;
  metadata: Record<string, any>;
}

export class ServiceRegistry {
  private services: Map<string, ServiceInstance[]>;
  private logger: Logger;
  private healthCheckInterval: NodeJS.Timeout | null;
  private readonly HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

  constructor() {
    this.services = new Map();
    this.logger = new Logger('ServiceRegistry');
    this.healthCheckInterval = null;
  }

  public register(config: ServiceConfig): void {
    const serviceInstance: ServiceInstance = {
      id: `${config.name}-${Date.now()}`,
      name: config.name,
      url: config.target,
      healthCheck: config.healthCheck,
      status: 'unknown',
      lastHealthCheck: new Date(),
      metadata: {
        timeout: config.timeout,
        retries: config.retries,
        registeredAt: new Date().toISOString()
      }
    };

    if (!this.services.has(config.name)) {
      this.services.set(config.name, []);
    }

    const instances = this.services.get(config.name)!;
    instances.push(serviceInstance);

    this.logger.info(`Service instance registered`, {
      service: config.name,
      instanceId: serviceInstance.id,
      url: config.target
    });

    // Perform initial health check
    this.performHealthCheck(serviceInstance);
  }

  public getHealthyInstances(serviceName: string): ServiceInstance[] {
    const instances = this.services.get(serviceName) || [];
    return instances.filter(instance => instance.status === 'healthy');
  }

  public getAllServices(): Record<string, ServiceInstance[]> {
    const result: Record<string, ServiceInstance[]> = {};
    for (const [serviceName, instances] of this.services.entries()) {
      result[serviceName] = instances;
    }
    return result;
  }

  public getHealthStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [serviceName, instances] of this.services.entries()) {
      const healthyCount = instances.filter(i => i.status === 'healthy').length;
      const totalCount = instances.length;
      
      status[serviceName] = {
        healthy: healthyCount,
        total: totalCount,
        status: healthyCount > 0 ? 'available' : 'unavailable',
        instances: instances.map(i => ({
          id: i.id,
          url: i.url,
          status: i.status,
          lastHealthCheck: i.lastHealthCheck
        }))
      };
    }
    
    return status;
  }

  public async startHealthChecks(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performAllHealthChecks();
    }, this.HEALTH_CHECK_INTERVAL);

    // Perform initial health checks
    await this.performAllHealthChecks();
    
    this.logger.info('Health checks started', {
      interval: this.HEALTH_CHECK_INTERVAL,
      services: Array.from(this.services.keys())
    });
  }

  public async stopHealthChecks(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    this.logger.info('Health checks stopped');
  }

  private async performAllHealthChecks(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const instances of this.services.values()) {
      for (const instance of instances) {
        promises.push(this.performHealthCheck(instance));
      }
    }

    await Promise.allSettled(promises);
  }

  private async performHealthCheck(instance: ServiceInstance): Promise<void> {
    try {
      const healthCheckUrl = `${instance.url}${instance.healthCheck}`;
      
      const response = await axios.get(healthCheckUrl, {
        timeout: 5000,
        validateStatus: (status) => status < 500 // Accept 2xx, 3xx, 4xx as healthy
      });

      const wasUnhealthy = instance.status === 'unhealthy';
      instance.status = 'healthy';
      instance.lastHealthCheck = new Date();

      if (wasUnhealthy) {
        this.logger.info(`Service instance recovered`, {
          service: instance.name,
          instanceId: instance.id,
          url: instance.url,
          responseStatus: response.status
        });
      }

    } catch (error: any) {
      const wasHealthy = instance.status === 'healthy';
      instance.status = 'unhealthy';
      instance.lastHealthCheck = new Date();

      if (wasHealthy) {
        this.logger.error(`Service instance became unhealthy`, {
          service: instance.name,
          instanceId: instance.id,
          url: instance.url,
          error: error.message
        });
      }
    }
  }

  public deregister(serviceName: string, instanceId?: string): void {
    const instances = this.services.get(serviceName);
    if (!instances) {
      return;
    }

    if (instanceId) {
      // Remove specific instance
      const index = instances.findIndex(i => i.id === instanceId);
      if (index !== -1) {
        const removed = instances.splice(index, 1)[0];
        this.logger.info(`Service instance deregistered`, {
          service: serviceName,
          instanceId: removed.id,
          url: removed.url
        });
      }
    } else {
      // Remove all instances of the service
      this.services.delete(serviceName);
      this.logger.info(`All instances of service deregistered`, {
        service: serviceName
      });
    }
  }
}