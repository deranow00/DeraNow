import express from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  verifyEmailOtp,
  resendEmailOtp,
  forgotPassword,
  resetPassword,
} from '../controllers/authController.js';
import {
  validateEmailOtp,
  validateForgotPassword,
  validateLogin,
  validateRegister,
  validateResendEmailOtp,
  validateResetPassword,
} from '../middleware/validateRequest.js';

const router = express.Router();

router.post('/register', validateRegister, register);
router.post('/verify-email-otp', validateEmailOtp, verifyEmailOtp);
router.post('/resend-email-otp', validateResendEmailOtp, resendEmailOtp);
router.post('/login', validateLogin, login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.post('/forgot-password', validateForgotPassword, forgotPassword);
router.post('/reset-password/:token', validateResetPassword, resetPassword);

export default router;
