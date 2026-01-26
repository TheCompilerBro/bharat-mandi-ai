import { ServiceRegistry, ServiceInstance } from './service-registry';
import { Logger } from '../utils/logger';

export type LoadBalancingStrategy = 'round-robin' | 'least-connections' | 'weighted-round-robin' | 'random';

export interface LoadBalancerConfig {
  strategy: LoadBalancingStrategy;
  healthCheckEnabled: boolean;
}

export class LoadBalancer {
  private serviceRegistry: ServiceRegistry;
  private logger: Logger;
  private config: LoadBalancerConfig;
  private roundRobinCounters: Map<string, number>;
  private connectionCounts: Map<string, number>;

  constructor(serviceRegistry?: ServiceRegistry, config?: Partial<LoadBalancerConfig>) {
    this.serviceRegistry = serviceRegistry || new ServiceRegistry();
    this.logger = new Logger('LoadBalancer');
    this.config = {
      strategy: 'round-robin',
      healthCheckEnabled: true,
      ...config
    };
    this.roundRobinCounters = new Map();
    this.connectionCounts = new Map();
  }

  public selectTarget(serviceName: string): string | null {
    const instances = this.config.healthCheckEnabled 
      ? this.serviceRegistry.getHealthyInstances(serviceName)
      : this.serviceRegistry.getAllServices()[serviceName] || [];

    if (instances.length === 0) {
      this.logger.warn(`No available instances for service: ${serviceName}`);
      return null;
    }

    let selectedInstance: ServiceInstance | null = null;

    switch (this.config.strategy) {
      case 'round-robin':
        selectedInstance = this.selectRoundRobin(serviceName, instances);
        break;
      case 'least-connections':
        selectedInstance = this.selectLeastConnections(instances);
        break;
      case 'weighted-round-robin':
        selectedInstance = this.selectWeightedRoundRobin(serviceName, instances);
        break;
      case 'random':
        selectedInstance = this.selectRandom(instances);
        break;
      default:
        selectedInstance = this.selectRoundRobin(serviceName, instances);
    }

    if (selectedInstance) {
      // Increment connection count for least-connections strategy
      const currentCount = this.connectionCounts.get(selectedInstance.id) || 0;
      this.connectionCounts.set(selectedInstance.id, currentCount + 1);

      this.logger.debug(`Selected instance for ${serviceName}`, {
        instanceId: selectedInstance.id,
        url: selectedInstance.url,
        strategy: this.config.strategy
      });

      return selectedInstance.url;
    }

    return null;
  }

  private selectRoundRobin(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    const currentIndex = this.roundRobinCounters.get(serviceName) || 0;
    const selectedInstance = instances[currentIndex % instances.length];
    
    this.roundRobinCounters.set(serviceName, currentIndex + 1);
    
    return selectedInstance;
  }

  private selectLeastConnections(instances: ServiceInstance[]): ServiceInstance {
    let selectedInstance = instances[0];
    let minConnections = this.connectionCounts.get(selectedInstance.id) || 0;

    for (const instance of instances) {
      const connections = this.connectionCounts.get(instance.id) || 0;
      if (connections < minConnections) {
        minConnections = connections;
        selectedInstance = instance;
      }
    }

    return selectedInstance;
  }

  private selectWeightedRoundRobin(serviceName: string, instances: ServiceInstance[]): ServiceInstance {
    // For simplicity, using equal weights. In a real implementation,
    // weights could be based on instance capacity, performance metrics, etc.
    const weights = instances.map(() => 1);
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    
    const currentIndex = this.roundRobinCounters.get(serviceName) || 0;
    const weightedIndex = currentIndex % totalWeight;
    
    let cumulativeWeight = 0;
    for (let i = 0; i < instances.length; i++) {
      cumulativeWeight += weights[i];
      if (weightedIndex < cumulativeWeight) {
        this.roundRobinCounters.set(serviceName, currentIndex + 1);
        return instances[i];
      }
    }

    // Fallback to first instance
    return instances[0];
  }

  private selectRandom(instances: ServiceInstance[]): ServiceInstance {
    const randomIndex = Math.floor(Math.random() * instances.length);
    return instances[randomIndex];
  }

  public releaseConnection(instanceId: string): void {
    const currentCount = this.connectionCounts.get(instanceId) || 0;
    if (currentCount > 0) {
      this.connectionCounts.set(instanceId, currentCount - 1);
    }
  }

  public getStatus(): Record<string, any> {
    return {
      strategy: this.config.strategy,
      healthCheckEnabled: this.config.healthCheckEnabled,
      roundRobinCounters: Object.fromEntries(this.roundRobinCounters),
      connectionCounts: Object.fromEntries(this.connectionCounts)
    };
  }

  public updateConfig(config: Partial<LoadBalancerConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Load balancer configuration updated', this.config);
  }

  public resetCounters(): void {
    this.roundRobinCounters.clear();
    this.connectionCounts.clear();
    this.logger.info('Load balancer counters reset');
  }
}