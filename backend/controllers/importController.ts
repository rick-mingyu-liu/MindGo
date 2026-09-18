import { Request, Response } from 'express';
import { validationResult, FieldValidationError } from 'express-validator';
import config = require('../config');
import { parseOcr } from '../services/import/parse';
import { flagDuplicates } from '../services/import/duplicates';
import { errorSummary } from '../utils/errorSummary';

/**
 * Screenshot import, server side. The browser has already run OCR; this turns
 * its lines into draft transactions. Nothing is stored.
 *
 * The request body is the text of someone's bank screenshot. It is never
 * logged, and neither is anything derived from it — errors are logged by name
 * and code only, because a database error message can quote a value.
 */
const importController = {
  async parse(req: Request, res: Response) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // This file only ever validates with body()/query() chains, never
      // oneOf() or checkSchema(), so every error here is a field error and
      // carries .path — the wider ValidationError union express-validator's
      // .array() returns doesn't reflect that.
      return res.status(400).json({
        errors: (errors.array() as FieldValidationError[]).map(({ path, msg }) => ({ path, msg })),
      });
    }

    try {
      const { lines, image, today, model } = req.body;
      const result = parseOcr(
        { lines, image, today },
        { confidenceThreshold: config.import.confidenceThreshold }
      );

      const warnings = [...result.warnings];
      if (result.needsFallback) warnings.push('ai_fallback_unavailable');

      await flagDuplicates(req.user.userId, result.rows);

      return res.json({
        layout: result.layout,
        layoutConfidence: result.layoutConfidence,
        model,
        warnings,
        rows: result.rows,
        unparsedLines: result.unparsedLines,
      });
    } catch (error) {
      const userId = req.user.userId;
      console.error('Import parse error:', { userId, ...errorSummary(error) });
      return res.status(500).json({ error: 'Server error' });
    }
  },
};

export = importController;
