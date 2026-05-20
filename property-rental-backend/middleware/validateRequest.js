const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validate = (validator) => (req, res, next) => {
  try {
    const message = validator(req);
    if (message) {
      return res.status(400).json({ error: message });
    }
    return next();
  } catch {
    return res.status(400).json({ error: 'Invalid request payload' });
  }
};

export const validateRegister = validate((req) => {
  const { name, citizenshipNumber, email, password, role } = req.body || {};
  if (!name || String(name).trim().length < 2) return 'Name is required';
  if (!citizenshipNumber || String(citizenshipNumber).trim().length < 4) {
    return 'Citizenship number is required';
  }
  if (!email || !emailRegex.test(String(email).toLowerCase())) return 'Valid email is required';
  if (!password || String(password).length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (role && !['owner', 'renter'].includes(role)) return 'Invalid role';
  return '';
});

export const validateLogin = validate((req) => {
  const { email, password, role } = req.body || {};
  if (!email || !emailRegex.test(String(email).toLowerCase())) return 'Valid email is required';
  if (!password || String(password).length < 1) return 'Password is required';
  if (!role || !['owner', 'renter', 'admin'].includes(role)) return 'Role is required';
  return '';
});

export const validateForgotPassword = validate((req) => {
  const { email } = req.body || {};
  if (!email || !emailRegex.test(String(email).toLowerCase())) return 'Valid email is required';
  return '';
});

export const validateResetPassword = validate((req) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 8) return 'Password must be at least 8 characters';
  return '';
});

export const validateEmailOtp = validate((req) => {
  const { email, otp } = req.body || {};
  if (!email || !emailRegex.test(String(email).toLowerCase())) return 'Valid email is required';
  if (!otp || !/^\d{6}$/.test(String(otp).trim())) return 'Valid 6-digit OTP is required';
  return '';
});

export const validateResendEmailOtp = validate((req) => {
  const { email } = req.body || {};
  if (!email || !emailRegex.test(String(email).toLowerCase())) return 'Valid email is required';
  return '';
});
