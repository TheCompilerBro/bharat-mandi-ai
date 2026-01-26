import { Router } from 'express';
import authRoutes from './auth.routes';
import translationRoutes from './translation.routes';
import languagePreferenceRoutes from './language-preference.routes';
import priceDiscoveryRoutes from './price-discovery.routes';
import communicationRoutes from './communication.routes';
import vendorProfileRoutes from './vendor-profile.routes';
import ratingFeedbackRoutes from './rating-feedback.routes';
import negotiationRoutes from './negotiation.routes';
import analyticsRoutes from './analytics.routes';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Multilingual MandiChallenge API',
    version: '1.0.0',
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/translation', translationRoutes);
router.use('/language-preferences', languagePreferenceRoutes);
router.use('/price-discovery', priceDiscoveryRoutes);
router.use('/communication', communicationRoutes);
router.use('/vendors', vendorProfileRoutes);
router.use('/ratings', ratingFeedbackRoutes);
router.use('/negotiation', negotiationRoutes);
router.use('/analytics', analyticsRoutes);

export default router;