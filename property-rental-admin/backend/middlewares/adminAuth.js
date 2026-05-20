import jwt from 'jsonwebtoken';
import Admin from '../models/Admin.js';
import { ROLE_PERMISSION_MAP } from '../models/Admin.js';

export const adminAuthMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = await Admin.findById(decoded.id);
    if (!req.admin || req.admin.isActive === false) throw new Error();
    next();
  } catch (err) {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

export const requireAdminPermission = (permission) => {
  return (req, res, next) => {
    const role = req.admin?.role || 'ops_admin';
    const rolePermissions = ROLE_PERMISSION_MAP[role] || [];
    const customPermissions = Array.isArray(req.admin?.permissions) ? req.admin.permissions : [];
    const merged = new Set([...rolePermissions, ...customPermissions]);

    if (merged.has('*') || merged.has(permission)) return next();
    return res.status(403).json({ error: 'Forbidden: missing permission' });
  };
};

export const requireAdminRole = (roles) => {
  const allowed = new Set(Array.isArray(roles) ? roles : [roles]);
  return (req, res, next) => {
    if (allowed.has(req.admin?.role)) return next();
    return res.status(403).json({ error: 'Forbidden: insufficient role' });
  };
};
