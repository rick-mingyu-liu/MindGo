import express from 'express';
import aiController = require('../controllers/aiController');
import { aiPlanningRetired } from '../controllers/retiredFeatures';
import auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Retired operations bypass their former input validation and all providers.
router.post('/plan', aiPlanningRetired);
router.post('/budget-recommendations', aiPlanningRetired);
router.post('/investment-advice', aiPlanningRetired);
router.get('/plans', aiController.getPlanHistory);
router.get('/plans/:id', aiController.getPlan);

export = router;
