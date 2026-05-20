import mongoose from 'mongoose';

const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['super_admin', 'ops_admin', 'finance_admin', 'support_admin', 'readonly_admin'],
    default: 'ops_admin',
  },
  permissions: {
    type: [String],
    default: [],
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  displayName: {
    type: String,
    default: '',
  },
}, { timestamps: true });

adminSchema.index({ role: 1, isActive: 1 });

export const ROLE_PERMISSION_MAP = {
  super_admin: ['*'],
  ops_admin: [
    'workflow:read',
    'workflow:write',
    'sla:read',
    'reconciliation:read',
    'exports:run',
    'rules:read',
    'notes:read',
    'notes:write',
    'audit:read',
  ],
  finance_admin: [
    'payments:read',
    'payments:write',
    'reconciliation:read',
    'exports:run',
    'sla:read',
    'audit:read',
  ],
  support_admin: [
    'workflow:read',
    'complaints:write',
    'notes:read',
    'notes:write',
    'audit:read',
  ],
  readonly_admin: [
    'workflow:read',
    'sla:read',
    'reconciliation:read',
    'rules:read',
    'notes:read',
    'audit:read',
  ],
};

export const PERMISSION_CATALOG = [
  'workflow:read',
  'workflow:write',
  'sla:read',
  'reconciliation:read',
  'exports:run',
  'rules:read',
  'notes:read',
  'notes:write',
  'audit:read',
  'payments:read',
  'payments:write',
  'complaints:write',
];

export default mongoose.model('Admin', adminSchema);
