# Multilingual MandiChallenge

AI-powered multilingual trading platform for Indian markets that breaks down language barriers and provides real-time price discovery for local vendors.

## Features

- 🌐 **Multilingual Support**: Real-time translation for 10+ Indian languages
- 💰 **Price Discovery**: AI-powered market price analysis and recommendations
- 🤝 **Negotiation Assistant**: Smart negotiation support with cultural adaptation
- 🔒 **Secure Authentication**: JWT-based authentication with refresh tokens
- 📱 **Mobile-Responsive**: Optimized for mobile devices and low-bandwidth connections
- 🛡️ **Security**: Rate limiting, input validation, and comprehensive security middleware

## Tech Stack

- **Backend**: Node.js, TypeScript, Express.js
- **Databases**: PostgreSQL (structured data), MongoDB (documents), Redis (cache)
- **Authentication**: JWT with refresh tokens
- **Security**: Helmet, CORS, rate limiting, input validation
- **Testing**: Vitest, Supertest
- **External APIs**: Sarvam AI (translation), AGMARKNET (market data)

## Prerequisites

- Node.js 18+ 
- PostgreSQL 13+
- MongoDB 5+
- Redis 6+
- npm or yarn

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd multilingual-mandi-challenge
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Set up databases**
   
   **PostgreSQL:**
   ```bash
   # Create database
   createdb mandi_challenge
   
   # Run schema
   psql -d mandi_challenge -f src/database/schema.sql
   ```

   **MongoDB:**
   ```bash
   # MongoDB will create the database automatically when first accessed
   # Ensure MongoDB is running on localhost:27017
   ```

   **Redis:**
   ```bash
   # Ensure Redis is running on localhost:6379
   redis-server
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `POSTGRES_HOST` | PostgreSQL host | `localhost` |
| `POSTGRES_PORT` | PostgreSQL port | `5432` |
| `POSTGRES_DB` | PostgreSQL database | `mandi_challenge` |
| `POSTGRES_USER` | PostgreSQL user | `postgres` |
| `POSTGRES_PASSWORD` | PostgreSQL password | `password` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/mandi_challenge` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `JWT_SECRET` | JWT secret key | **Required in production** |
| `SARVAM_AI_API_KEY` | Sarvam AI API key | **Required for translation** |
| `AGMARKNET_API_KEY` | AGMARKNET API key | **Required for market data** |

## Usage

### Development

```bash
# Start development server with hot reload
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Production

```bash
# Build the application
npm run build

# Start production server
npm start
```

## API Endpoints

### Authentication

- `POST /api/v1/auth/register` - Register new vendor
- `POST /api/v1/auth/login` - Vendor login
- `POST /api/v1/auth/refresh` - Refresh access token
- `GET /api/v1/auth/profile` - Get vendor profile
- `POST /api/v1/auth/logout` - Logout (client-side token cleanup)

### Health Check

- `GET /api/v1/health` - Service health status

## Database Schema

### PostgreSQL Tables

- `vendors` - Vendor profiles and authentication
- `trade_sessions` - Trading session metadata
- `negotiations` - Negotiation history and outcomes
- `trust_ratings` - Vendor ratings and feedback
- `market_integrations` - External API configurations
- `verification_documents` - Vendor verification documents
- `refresh_tokens` - JWT refresh token management

### MongoDB Collections

- `messages` - Real-time messages with translations
- `market_data_raw` - Raw market data from various sources
- `analytics_events` - User interaction and system events

### Redis Cache

- `price_cache:{commodity}:{location}` - Current price data
- `translation_cache:{hash}` - Frequently used translations
- `session_state:{sessionId}` - Active session states
- `vendor_online:{vendorId}` - Online status tracking

## Security Features

- **Rate Limiting**: 100 requests per 15 minutes (general), 5 requests per 15 minutes (auth)
- **Input Validation**: Comprehensive validation using express-validator
- **Security Headers**: Helmet.js for security headers
- **CORS**: Configurable CORS policy
- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: bcrypt with configurable rounds
- **Request Size Limiting**: 10MB maximum request size

## Testing

The project includes comprehensive test coverage:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test auth.test.ts
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support and questions, please open an issue in the GitHub repository.