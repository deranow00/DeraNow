export const validateAdminLogin = (req, res, next) => {
  const { username, password } = req.body || {};
  if (!username || String(username).trim().length < 2) {
    return res.status(400).json({ error: 'Username is required' });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  return next();
};
