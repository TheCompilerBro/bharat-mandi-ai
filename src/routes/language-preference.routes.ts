import { Router, Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import { LanguagePreferenceService } from '../services/language-preference.service';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const languagePreferenceService = new LanguagePreferenceService();

// Validation middleware
const setPreferenceValidation = [
  body('preferredLanguage')
    .notEmpty()
    .withMessage('Preferred language is required')
    .isIn(['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as'])
    .withMessage('Invalid preferred language code'),
  body('secondaryLanguages')
    .optional()
    .isArray()
    .withMessage('Secondary languages must be an array')
    .custom((languages: string[]) => {
      const supportedLanguages = ['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as'];
      const invalidLanguages = languages.filter(lang => !supportedLanguages.includes(lang));
      if (invalidLanguages.length > 0) {
        throw new Error(`Invalid secondary language codes: ${invalidLanguages.join(', ')}`);
      }
      return true;
    })
];

const updatePreferenceValidation = [
  body('preferredLanguage')
    .optional()
    .isIn(['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as'])
    .withMessage('Invalid preferred language code'),
  body('secondaryLanguages')
    .optional()
    .isArray()
    .withMessage('Secondary languages must be an array')
    .custom((languages: string[]) => {
      const supportedLanguages = ['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as'];
      const invalidLanguages = languages.filter(lang => !supportedLanguages.includes(lang));
      if (invalidLanguages.length > 0) {
        throw new Error(`Invalid secondary language codes: ${invalidLanguages.join(', ')}`);
      }
      return true;
    })
];

// POST /api/v1/language-preferences - Set language preferences
router.post('/', authenticateToken, setPreferenceValidation, async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
      return;
    }

    const vendorId = req.vendor!.vendorId;
    const { preferredLanguage, secondaryLanguages } = req.body;

    const preference = await languagePreferenceService.setLanguagePreference({
      vendorId,
      preferredLanguage,
      secondaryLanguages
    });

    res.status(201).json({
      message: 'Language preference set successfully',
      preference
    });

  } catch (error) {
    console.error('Set language preference error:', error);
    res.status(500).json({
      error: 'Failed to set language preference',
      code: 'PREFERENCE_SET_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/v1/language-preferences - Get current user's language preferences
router.get('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendorId = req.vendor!.vendorId;

    const preference = await languagePreferenceService.getLanguagePreference(vendorId);

    if (!preference) {
      res.status(404).json({
        error: 'Language preference not found',
        code: 'PREFERENCE_NOT_FOUND',
        message: 'No language preference set for this vendor'
      });
      return;
    }

    res.json({ preference });

  } catch (error) {
    console.error('Get language preference error:', error);
    res.status(500).json({
      error: 'Failed to get language preference',
      code: 'PREFERENCE_GET_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/v1/language-preferences - Update language preferences
router.put('/', authenticateToken, updatePreferenceValidation, async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
      return;
    }

    const vendorId = req.vendor!.vendorId;
    const updates = req.body;

    const preference = await languagePreferenceService.updateLanguagePreference(vendorId, updates);

    if (!preference) {
      res.status(404).json({
        error: 'Language preference not found',
        code: 'PREFERENCE_NOT_FOUND',
        message: 'No language preference found to update'
      });
      return;
    }

    res.json({
      message: 'Language preference updated successfully',
      preference
    });

  } catch (error) {
    console.error('Update language preference error:', error);
    res.status(500).json({
      error: 'Failed to update language preference',
      code: 'PREFERENCE_UPDATE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/v1/language-preferences - Delete language preferences
router.delete('/', authenticateToken, async (req: Request, res: Response): Promise<void> => {
  try {
    const vendorId = req.vendor!.vendorId;

    const deleted = await languagePreferenceService.deleteLanguagePreference(vendorId);

    if (!deleted) {
      res.status(404).json({
        error: 'Language preference not found',
        code: 'PREFERENCE_NOT_FOUND',
        message: 'No language preference found to delete'
      });
      return;
    }

    res.json({
      message: 'Language preference deleted successfully'
    });

  } catch (error) {
    console.error('Delete language preference error:', error);
    res.status(500).json({
      error: 'Failed to delete language preference',
      code: 'PREFERENCE_DELETE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/v1/language-preferences/stats - Get language preference statistics (admin only)
router.get('/stats', authenticateToken, async (req: Request, res: Response) => {
  try {
    const stats = await languagePreferenceService.getLanguagePreferenceStats();

    res.json({ stats });

  } catch (error) {
    console.error('Get language preference stats error:', error);
    res.status(500).json({
      error: 'Failed to get language preference statistics',
      code: 'PREFERENCE_STATS_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/v1/language-preferences/by-language/:languageCode - Get vendors by preferred language
router.get('/by-language/:languageCode', authenticateToken, [
  param('languageCode')
    .isIn(['hi', 'en', 'ta', 'te', 'bn', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'as'])
    .withMessage('Invalid language code')
], async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
      return;
    }

    const { languageCode } = req.params;

    const vendorIds = await languagePreferenceService.getVendorsByPreferredLanguage(languageCode);

    res.json({
      languageCode,
      vendorCount: vendorIds.length,
      vendorIds
    });

  } catch (error) {
    console.error('Get vendors by language error:', error);
    res.status(500).json({
      error: 'Failed to get vendors by preferred language',
      code: 'VENDORS_BY_LANGUAGE_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;