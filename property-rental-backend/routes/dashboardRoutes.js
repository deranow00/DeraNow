import express from 'express';
import { getOwnerDashboardStats, getRenterDashboardStats } from '../controllers/dashboardController.js';
import protect from '../middleware/authMiddleware.js';
const router = express.Router();

router.get('/owner', protect, getOwnerDashboardStats);
router.get('/renter', protect, getRenterDashboardStats);


export default router;
