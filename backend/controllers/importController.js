const { validationResult } = require('express-validator');
const config = require('../config');
const { parseOcr } = require('../services/import/parse');
const { flagDuplicates } = require('../services/import/duplicates');

/**
 * Screenshot import, server side. The browser has already run OCR; this turns
 * its lines into draft transactions. Nothing is stored.
 *
 * The request body is the text of someone's bank screenshot. It is never
 * logged, and neither is anything derived from it — errors are logged by name
 * and code only, because a database error message can quote a value.
 */
const importController = {
  async parse(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array().map(({ path, msg }) => ({ path, msg })) });
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
      console.error('Import parse error:', { userId: req.user.userId, error: error.name, code: error.code });
      return res.status(500).json({ error: 'Server error' });
    }
  },
};

module.exports = importController;
