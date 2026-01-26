import { Pool } from 'pg';
import { MongoClient, Db } from 'mongodb';
import { createClient, RedisClientType } from 'redis';
import { DatabaseConfig } from '../types';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private pgPool: Pool | null = null;
  private mongoClient: MongoClient | null = null;
  private mongoDB: Db | null = null;
  private redisClient: RedisClientType | null = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async initializeConnections(config: DatabaseConfig): Promise<void> {
    try {
      // Initialize PostgreSQL connection
      await this.initializePostgreSQL(config.postgres);
      
      // Initialize MongoDB connection
      await this.initializeMongoDB(config.mongodb);
      
      // Initialize Redis connection
      await this.initializeRedis(config.redis);
      
      console.log('All database connections initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database connections:', error);
      throw error;
    }
  }

  private async initializePostgreSQL(config: DatabaseConfig['postgres']): Promise<void> {
    this.pgPool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    const client = await this.pgPool.connect();
    await client.query('SELECT NOW()');
    client.release();
    
    console.log('PostgreSQL connection established');
  }

  private async initializeMongoDB(config: DatabaseConfig['mongodb']): Promise<void> {
    this.mongoClient = new MongoClient(config.uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await this.mongoClient.connect();
    this.mongoDB = this.mongoClient.db();
    
    // Test connection
    await this.mongoDB.admin().ping();
    
    console.log('MongoDB connection established');
  }

  private async initializeRedis(config: DatabaseConfig['redis']): Promise<void> {
    this.redisClient = createClient({
      socket: {
        host: config.host,
        port: config.port,
      },
      password: config.password,
    });

    this.redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    await this.redisClient.connect();
    
    // Test connection
    await this.redisClient.ping();
    
    console.log('Redis connection established');
  }

  public getPostgreSQLPool(): Pool {
    if (!this.pgPool) {
      throw new Error('PostgreSQL connection not initialized');
    }
    return this.pgPool;
  }

  // Alias for backward compatibility
  public getPostgresClient(): Pool {
    return this.getPostgreSQLPool();
  }

  public getMongoDB(): Db {
    if (!this.mongoDB) {
      throw new Error('MongoDB connection not initialized');
    }
    return this.mongoDB;
  }

  // Alias for backward compatibility
  public getMongoDatabase(): Db {
    return this.getMongoDB();
  }

  public getRedisClient(): RedisClientType {
    if (!this.redisClient) {
      throw new Error('Redis connection not initialized');
    }
    return this.redisClient;
  }

  public async closeConnections(): Promise<void> {
    try {
      if (this.pgPool) {
        await this.pgPool.end();
        console.log('PostgreSQL connection closed');
      }

      if (this.mongoClient) {
        await this.mongoClient.close();
        console.log('MongoDB connection closed');
      }

      if (this.redisClient) {
        await this.redisClient.quit();
        console.log('Redis connection closed');
      }
    } catch (error) {
      console.error('Error closing database connections:', error);
    }
  }
}