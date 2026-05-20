import express from 'express';
import { adminLogin } from '../controllers/authController.js';
import { validateAdminLogin } from '../middlewares/validateRequest.js';
const router = express.Router();

router.post('/login', validateAdminLogin, adminLogin);

export default router;
