import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import path from 'path';

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../src/frontend')));

// Add request logging for debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', req.body);
  }
  next();
});

// Mock data for demonstration
const mockPriceData = [
  {
    id: '1',
    commodity: 'Rice',
    currentPrice: 2000,
    priceRange: { min: 1800, max: 2200, modal: 2000 },
    volatility: 5.2,
    lastUpdated: new Date(),
    sources: ['AGMARKNET']
  },
  {
    id: '2',
    commodity: 'Wheat',
    currentPrice: 2500,
    priceRange: { min: 2300, max: 2700, modal: 2500 },
    volatility: 3.8,
    lastUpdated: new Date(),
    sources: ['AGMARKNET']
  },
  {
    id: '3',
    commodity: 'Cotton',
    currentPrice: 5500,
    priceRange: { min: 5200, max: 5800, modal: 5500 },
    volatility: 8.1,
    lastUpdated: new Date(),
    sources: ['AGMARKNET']
  },
  {
    id: '4',
    commodity: 'Onion',
    currentPrice: 1200,
    priceRange: { min: 1000, max: 1400, modal: 1200 },
    volatility: 12.5,
    lastUpdated: new Date(),
    sources: ['AGMARKNET']
  },
  {
    id: '5',
    commodity: 'Potato',
    currentPrice: 800,
    priceRange: { min: 700, max: 900, modal: 800 },
    volatility: 6.3,
    lastUpdated: new Date(),
    sources: ['AGMARKNET']
  },
  {
    id: '6',
    commodity: 'Tomato',
    currentPrice: 1500,
    priceRange: { min: 1200, max: 1800, modal: 1500 },
    volatility: 15.2,
    lastUpdated: new Date(),
    sources: ['AGMARKNET']
  },
  {
    id: '7',
    commodity: 'Sugarcane',
    currentPrice: 350,
    priceRange: { min: 320, max: 380, modal: 350 },
    volatility: 4.1,
    lastUpdated: new Date(),
    sources: ['AGMARKNET']
  },
  {
    id: '8',
    commodity: 'Maize',
    currentPrice: 1800,
    priceRange: { min: 1650, max: 1950, modal: 1800 },
    volatility: 7.8,
    lastUpdated: new Date(),
    sources: ['AGMARKNET']
  },
  {
    id: '9',
    commodity: 'Turmeric',
    currentPrice: 8500,
    priceRange: { min: 8000, max: 9000, modal: 8500 },
    volatility: 9.2,
    lastUpdated: new Date(),
    sources: ['AGMARKNET']
  }
];

// API Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Multilingual MandiChallenge Demo',
    version: '1.0.0',
    message: 'Demo server running - databases not required'
  });
});

app.get('/api/v1/price-discovery/search', (req, res) => {
  const { q } = req.query;
  let results = mockPriceData;
  
  if (q && typeof q === 'string') {
    results = mockPriceData.filter(item => 
      item.commodity.toLowerCase().includes(q.toLowerCase())
    );
  }
  
  res.json({
    success: true,
    data: results,
    total: results.length
  });
});

app.get('/api/v1/translation/languages', (req, res) => {
  res.json({
    success: true,
    data: [
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
      { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
      { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
      { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
      { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
      { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
      { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
      { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' }
    ]
  });
});

app.post('/api/v1/translation/translate', (req, res) => {
  const { text, fromLang, toLang } = req.body;
  
  // Mock translation response
  res.json({
    success: true,
    data: {
      translatedText: `[Translated from ${fromLang} to ${toLang}] ${text}`,
      confidence: 0.95,
      originalText: text,
      fromLanguage: fromLang,
      toLanguage: toLang
    }
  });
});

// Test endpoint for frontend connectivity
app.get('/api/v1/test', (req, res) => {
  res.json({
    success: true,
    message: 'Frontend-Backend connection working!',
    timestamp: new Date().toISOString()
  });
});

// Mock authentication endpoints
app.post('/api/v1/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  // Demo credentials - accept any email/password for demo purposes
  if (email && password) {
    res.json({
      success: true,
      data: {
        token: 'demo-jwt-token-12345',
        refreshToken: 'demo-refresh-token-67890',
        user: {
          id: 'demo-user-1',
          email: email,
          name: 'Demo Vendor',
          vendorId: 'vendor-demo-1',
          preferredLanguage: 'en',
          businessType: 'trader'
        }
      },
      message: 'Login successful (demo mode)'
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'Email and password are required'
    });
  }
});

app.post('/api/v1/auth/register', (req, res) => {
  const { email, password, name, businessType } = req.body;
  
  if (email && password && name) {
    res.json({
      success: true,
      data: {
        token: 'demo-jwt-token-12345',
        user: {
          id: 'demo-user-new',
          email: email,
          name: name,
          vendorId: 'vendor-demo-new',
          preferredLanguage: 'en',
          businessType: businessType || 'trader'
        }
      },
      message: 'Registration successful (demo mode)'
    });
  } else {
    res.status(400).json({
      success: false,
      error: 'Email, password, and name are required'
    });
  }
});

app.post('/api/v1/auth/logout', (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful (demo mode)'
  });
});

// Mock vendor profile endpoint
app.get('/api/v1/vendors/profile/:vendorId', (req, res) => {
  res.json({
    success: true,
    data: {
      profile: {
        id: req.params.vendorId,
        name: 'Demo Vendor',
        email: 'demo@example.com',
        phone: '+91-9876543210',
        businessType: 'trader',
        location: {
          state: 'Maharashtra',
          district: 'Pune',
          market: 'Pune Mandi'
        },
        preferredLanguage: 'en',
        secondaryLanguages: ['hi', 'mr'],
        trustScore: 4.2,
        verificationStatus: 'verified',
        tradingHistory: {
          totalTrades: 156,
          successfulTrades: 148,
          averageRating: 4.2
        }
      }
    }
  });
});

// Serve React app for any non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API endpoint not found' });
  } else {
    res.json({
      message: 'Multilingual MandiChallenge Demo Server',
      version: '1.0.0',
      status: 'Running',
      endpoints: {
        health: '/health',
        priceSearch: '/api/v1/price-discovery/search?q=rice',
        languages: '/api/v1/translation/languages',
        translate: 'POST /api/v1/translation/translate',
        login: 'POST /api/v1/auth/login',
        register: 'POST /api/v1/auth/register'
      },
      demoCredentials: {
        note: 'Any email/password combination will work for demo login',
        examples: [
          { email: 'demo@example.com', password: 'password' },
          { email: 'vendor@mandi.com', password: '123456' },
          { email: 'test@test.com', password: 'demo' }
        ]
      },
      note: 'This is a demo server. Frontend should be served separately using Vite.'
    });
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Demo server running on port ${PORT}`);
  console.log(`📱 Environment: development (demo mode)`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api/v1`);
  console.log(`💡 This is a simplified demo without database dependencies`);
  console.log(`📊 Available endpoints:`);
  console.log(`   - Health: http://localhost:${PORT}/health`);
  console.log(`   - Price Search: http://localhost:${PORT}/api/v1/price-discovery/search?q=rice`);
  console.log(`   - Languages: http://localhost:${PORT}/api/v1/translation/languages`);
  console.log(`\n🎯 To start the frontend, run: npm run dev:frontend`);
});

export default app;