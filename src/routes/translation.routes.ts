import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { SarvamTranslationService } from '../services/translation.service';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const translationService = new SarvamTranslationService();

// Validation middleware
const translateValidation = [
  body('text').notEmpty().withMessage('Text is required').isLength({ max: 5000 }).withMessage('Text too long'),
  body('fromLang').notEmpty().withMessage('Source language is required').isLength({ min: 2, max: 5 }),
  body('toLang').notEmpty().withMessage('Target language is required').isLength({ min: 2, max: 5 }),
];

const detectLanguageValidation = [
  body('text').notEmpty().withMessage('Text is required').isLength({ max: 1000 }).withMessage('Text too long'),
];

// POST /api/v1/translation/translate
router.post('/translate', authenticateToken, translateValidation, async (req: Request, res: Response): Promise<void> => {
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

    const { text, fromLang, toLang } = req.body;

    const result = await translationService.translateMessage(text, fromLang, toLang);

    // Check if confidence is below threshold (Requirement 1.5)
    if (result.confidence < 0.85) {
      res.status(200).json({
        ...result,
        warning: 'Low confidence translation - manual review recommended',
        requiresReview: true
      });
      return;
    }

    res.json(result);

  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({
      error: 'Translation failed',
      code: 'TRANSLATION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/v1/translation/detect-language
router.post('/detect-language', authenticateToken, detectLanguageValidation, async (req: Request, res: Response): Promise<void> => {
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

    const { text } = req.body;

    const result = await translationService.detectLanguage(text);

    res.json(result);

  } catch (error) {
    console.error('Language detection error:', error);
    res.status(500).json({
      error: 'Language detection failed',
      code: 'DETECTION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/v1/translation/languages
router.get('/languages', async (req: Request, res: Response) => {
  try {
    const languages = await translationService.getAvailableLanguages();
    res.json({ languages });

  } catch (error) {
    console.error('Get languages error:', error);
    res.status(500).json({
      error: 'Failed to retrieve languages',
      code: 'LANGUAGES_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/v1/translation/validate
router.post('/validate', authenticateToken, [
  body('original').notEmpty().withMessage('Original text is required'),
  body('translated').notEmpty().withMessage('Translated text is required'),
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

    const { original, translated } = req.body;

    const result = await translationService.validateTranslation(original, translated);

    res.json(result);

  } catch (error) {
    console.error('Translation validation error:', error);
    res.status(500).json({
      error: 'Translation validation failed',
      code: 'VALIDATION_ERROR',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;