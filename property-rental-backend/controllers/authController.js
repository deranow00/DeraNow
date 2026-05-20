import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import axios from 'axios';

const ACCESS_TOKEN_TTL = process.env.JWT_EXPIRES_IN || '1d';
const REFRESH_TOKEN_TTL_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_TTL_DAYS || 14));
const EMAIL_OTP_TTL_MINUTES = Math.max(1, Number(process.env.EMAIL_OTP_TTL_MINUTES || 10));
const EMAIL_OTP_RESEND_COOLDOWN_SECONDS = Math.max(
  5,
  Number(process.env.EMAIL_OTP_RESEND_COOLDOWN_SECONDS || 30)
);

const toPublicUser = (user) => ({
  _id: user._id,
  email: user.email,
  role: user.role,
  name: user.name,
  ownerVerificationStatus: user.ownerVerificationStatus,
});

const issueSessionTokens = async (user) => {
  const accessToken = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Persist session token material without re-validating the full user document.
  // This avoids login failures for legacy records that may not satisfy newer validators.
  await User.updateOne(
    { _id: user._id },
    {
      $set: { refreshTokenHash, refreshTokenExpiresAt },
    }
  );

  return { accessToken, refreshToken };
};

export const register = async (req, res) => {
  try {
    const { name, citizenshipNumber, email, password, role } = req.body;

    if (!name || !citizenshipNumber || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    if (role && !['owner', 'renter'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = await User.findOne({ email: normalizedEmail }).select(
      '+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationAttemptCount +emailVerificationLastSentAt'
    );
    if (existingUser) {
      if (existingUser.emailVerified !== false) {
        return res.status(400).json({ error: 'Email already in use' });
      }

      existingUser.name = String(name).trim();
      existingUser.citizenshipNumber = String(citizenshipNumber).trim();
      existingUser.password = await bcrypt.hash(password, 10);
      existingUser.role = role || 'renter';
      existingUser.emailVerified = false;
      existingUser.emailVerifiedAt = undefined;

      const code = createOtpCode();
      await setEmailOtpForUser(existingUser, code);

      let otpSent = false;
      try {
        otpSent = await sendEmailOtp({ toEmail: normalizedEmail, name: existingUser.name, code });
      } catch (mailErr) {
        console.error('register otp mail error:', mailErr.message);
      }

      return res.status(200).json({
        message: otpSent
          ? 'OTP sent to your email. Verify to activate account.'
          : 'Account pending verification. OTP mail failed to send, try resend.',
        verificationRequired: true,
        email: normalizedEmail,
        otpSent,
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      name,
      citizenshipNumber,
      email: normalizedEmail,
      password: hashedPassword,
      role: role || 'renter',
      emailVerified: false,
    });

    await newUser.save();

    const code = createOtpCode();
    await setEmailOtpForUser(newUser, code);

    let otpSent = false;
    try {
      otpSent = await sendEmailOtp({ toEmail: normalizedEmail, name: newUser.name, code });
    } catch (mailErr) {
      console.error('register otp mail error:', mailErr.message);
    }

    res.status(201).json({
      message: otpSent
        ? 'Registration successful. Please verify email with OTP.'
        : 'Registration successful, but OTP email failed. Please request resend.',
      verificationRequired: true,
      email: normalizedEmail,
      otpSent,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error during registration' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const user = await User.findOne({ email: String(email).trim().toLowerCase(), role });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });
    if (user.emailVerified === false) {
      return res.status(403).json({
        error: 'Email not verified. Please verify OTP sent to your email.',
        verificationRequired: true,
        email: user.email,
      });
    }

    const { accessToken, refreshToken } = await issueSessionTokens(user);

    res.json({
      token: accessToken,
      refreshToken,
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error('login error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

export const refreshToken = async (req, res) => {
  try {
    const rawRefreshToken = String(req.body?.refreshToken || '').trim();
    if (!rawRefreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    const user = await User.findOne({
      refreshTokenHash,
      refreshTokenExpiresAt: { $gt: new Date() },
    }).select('-password +refreshTokenHash +refreshTokenExpiresAt');
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    if (user.isActive === false) {
      return res.status(403).json({ error: 'Account is disabled. Contact support.' });
    }

    const session = await issueSessionTokens(user);
    return res.json({
      token: session.accessToken,
      refreshToken: session.refreshToken,
      user: toPublicUser(user),
    });
  } catch (err) {
    console.error('refreshToken error:', err);
    return res.status(500).json({ error: 'Failed to refresh session' });
  }
};

export const logout = async (req, res) => {
  try {
    const rawRefreshToken = String(req.body?.refreshToken || '').trim();
    if (!rawRefreshToken) {
      return res.json({ success: true });
    }
    const refreshTokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex');
    await User.findOneAndUpdate(
      { refreshTokenHash },
      {
        $unset: { refreshTokenHash: 1, refreshTokenExpiresAt: 1 },
      }
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('logout error:', err);
    return res.status(500).json({ error: 'Failed to logout' });
  }
};

export const verifyEmailOtp = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const otp = String(req.body?.otp || '').trim();
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email }).select(
      '+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationAttemptCount'
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) return res.json({ message: 'Email already verified' });
    if (!user.emailVerificationCodeHash || !user.emailVerificationExpiresAt) {
      return res.status(400).json({ error: 'No active OTP. Please resend OTP.' });
    }
    if (user.emailVerificationExpiresAt <= new Date()) {
      return res.status(400).json({ error: 'OTP expired. Please resend OTP.' });
    }
    if ((user.emailVerificationAttemptCount || 0) >= 8) {
      return res.status(429).json({ error: 'Too many invalid attempts. Please resend OTP.' });
    }

    const otpHash = crypto.createHash('sha256').update(otp).digest('hex');
    if (otpHash !== user.emailVerificationCodeHash) {
      user.emailVerificationAttemptCount = Number(user.emailVerificationAttemptCount || 0) + 1;
      await user.save();
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    user.emailVerificationAttemptCount = 0;
    await user.save();

    return res.json({ message: 'Email verified successfully' });
  } catch (err) {
    console.error('verifyEmailOtp error:', err);
    return res.status(500).json({ error: 'Failed to verify OTP' });
  }
};

export const resendEmailOtp = async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email }).select(
      '+emailVerificationCodeHash +emailVerificationExpiresAt +emailVerificationAttemptCount +emailVerificationLastSentAt'
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.emailVerified) return res.json({ message: 'Email already verified' });

    const now = Date.now();
    const lastSentAt = user.emailVerificationLastSentAt
      ? new Date(user.emailVerificationLastSentAt).getTime()
      : 0;
    const diffSeconds = Math.floor((now - lastSentAt) / 1000);
    if (lastSentAt && diffSeconds < EMAIL_OTP_RESEND_COOLDOWN_SECONDS) {
      return res.status(429).json({
        error: `Please wait ${EMAIL_OTP_RESEND_COOLDOWN_SECONDS - diffSeconds}s before requesting OTP again`,
      });
    }

    const code = createOtpCode();
    await setEmailOtpForUser(user, code);

    let otpSent = false;
    try {
      otpSent = await sendEmailOtp({ toEmail: email, name: user.name, code });
    } catch (mailErr) {
      console.error('resend otp mail error:', mailErr.message);
    }

    return res.json({
      message: otpSent ? 'OTP resent successfully' : 'OTP regenerated, but email delivery failed',
      otpSent,
    });
  } catch (err) {
    console.error('resendEmailOtp error:', err);
    return res.status(500).json({ error: 'Failed to resend OTP' });
  }
};

const createMailerTransport = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

const createOtpCode = () => `${Math.floor(100000 + Math.random() * 900000)}`;

const buildVerificationEmail = ({ name, code }) => {
  const safeName = name || 'User';
  return {
    subject: 'Verify your email for Property Rental',
    text: `Hi ${safeName},\n\nYour verification OTP is ${code}.\nIt expires in ${EMAIL_OTP_TTL_MINUTES} minutes.\n\nIf you did not request this, ignore this email.`,
    html: `
      <p>Hi ${safeName},</p>
      <p>Your verification OTP is:</p>
      <p style="font-size:24px;font-weight:700;letter-spacing:4px;">${code}</p>
      <p>It expires in ${EMAIL_OTP_TTL_MINUTES} minutes.</p>
      <p>If you did not request this, ignore this email.</p>
    `,
  };
};

const sendEmailOtp = async ({ toEmail, name, code }) => {
  const senderEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
  const { subject, text, html } = buildVerificationEmail({ name, code });

  const brevoApiKey = process.env.BREVO_API_KEY;
  if (brevoApiKey && senderEmail) {
    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { email: senderEmail },
        to: [{ email: toEmail }],
        subject,
        textContent: text,
        htmlContent: html,
      },
      {
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    return true;
  }

  const transporter = createMailerTransport();
  if (!transporter) {
    console.log(`[Email OTP] SMTP not configured. OTP for ${toEmail}: ${code}`);
    return false;
  }

  await transporter.sendMail({
    from: senderEmail,
    to: toEmail,
    subject,
    text,
    html,
  });
  return true;
};

const setEmailOtpForUser = async (user, code) => {
  user.emailVerificationCodeHash = crypto.createHash('sha256').update(String(code)).digest('hex');
  user.emailVerificationExpiresAt = new Date(Date.now() + EMAIL_OTP_TTL_MINUTES * 60 * 1000);
  user.emailVerificationLastSentAt = new Date();
  user.emailVerificationAttemptCount = 0;
  await user.save();
};

const sendResetPasswordEmail = async (toEmail, resetUrl) => {
  const brevoApiKey = process.env.BREVO_API_KEY;
  if (brevoApiKey) {
    const senderEmail = process.env.SMTP_FROM || process.env.SMTP_USER;
    if (!senderEmail) {
      throw new Error('Missing SMTP_FROM or SMTP_USER for Brevo sender email');
    }
    await axios.post(
      'https://api.brevo.com/v3/smtp/email',
      {
        sender: { email: senderEmail },
        to: [{ email: toEmail }],
        subject: 'Reset your Property Rental password',
        textContent: `Reset your password using this link: ${resetUrl}\nThis link expires in 15 minutes.`,
        htmlContent: `
          <p>We received a request to reset your password.</p>
          <p><a href="${resetUrl}">Click here to reset password</a></p>
          <p>This link expires in 15 minutes.</p>
          <p>If you did not request this, you can ignore this email.</p>
        `,
      },
      {
        headers: {
          'api-key': brevoApiKey,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );
    return true;
  }

  const transporter = createMailerTransport();
  if (!transporter) {
    console.log(`[Password Reset] SMTP not configured. Reset link for ${toEmail}: ${resetUrl}`);
    return false;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: toEmail,
    subject: 'Reset your Property Rental password',
    text: `Reset your password using this link: ${resetUrl}\nThis link expires in 15 minutes.`,
    html: `
      <p>We received a request to reset your password.</p>
      <p><a href="${resetUrl}">Click here to reset password</a></p>
      <p>This link expires in 15 minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });

  return true;
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({
        message: 'If an account with that email exists, a reset link has been sent.',
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const resetPasswordExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    user.resetPasswordTokenHash = resetTokenHash;
    user.resetPasswordExpiresAt = resetPasswordExpiresAt;
    await user.save();

    const baseUrl =
      process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173';
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password/${resetToken}`;

    let emailSent = false;
    try {
      emailSent = await sendResetPasswordEmail(user.email, resetUrl);
    } catch (mailErr) {
      // Do not fail forgot-password flow because of SMTP issues.
      console.error('forgotPassword mail send error:', mailErr.message);
    }

    return res.json({
      message: 'If an account with that email exists, a reset link has been sent.',
      ...(emailSent ? {} : { resetUrl }),
    });
  } catch (err) {
    console.error('forgotPassword error:', err);
    return res.status(500).json({ error: 'Failed to process forgot password request' });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) return res.status(400).json({ error: 'Reset token is required' });
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpiresAt: { $gt: new Date() },
    }).select('+resetPasswordTokenHash +resetPasswordExpiresAt');

    if (!user) {
      return res.status(400).json({ error: 'Reset link is invalid or expired' });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpiresAt = undefined;
    await user.save();

    return res.json({ message: 'Password reset successful. You can now log in.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
};
