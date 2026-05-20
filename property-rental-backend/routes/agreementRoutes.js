import express from 'express';
import protect from '../middleware/authMiddleware.js';
import {
  generateAgreement,
  getMyAgreements,
  getAgreementById,
  signAgreement,
} from '../controllers/agreementController.js';

const router = express.Router();

router.post('/generate/:bookingId', protect, generateAgreement);
router.get('/my', protect, getMyAgreements);
router.get('/:id', protect, getAgreementById);
router.post('/:id/sign', protect, signAgreement);

export default router;
