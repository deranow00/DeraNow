import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import AdminLayout from './components/AdminLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import OwnerRequests from './pages/OwnerRequests';
import KycRequests from './pages/KycRequests';
import Properties from './pages/Properties';
import Bookings from './pages/Bookings';
import Payments from './pages/Payments';
import Complaints from './pages/Complaints';
import Messages from './pages/Messages';
import Reviews from './pages/Reviews';
import Content from './pages/Content';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import Reports from './pages/Reports';
import AuditLogs from './pages/AuditLogs';
import RevenueCommand from './pages/RevenueCommand';
import OpsCenter from './pages/OpsCenter';
import ExportCenter from './pages/ExportCenter';
import AccessControl from './pages/AccessControl';
import RuleEngine from './pages/RuleEngine';
import AdminNotes from './pages/AdminNotes';
import DuplicateHub from './pages/DuplicateHub';
import DuplicateMergeHistory from './pages/DuplicateMergeHistory';
import SoftDeletedUsers from './pages/SoftDeletedUsers';

function isTokenValid(token) {
  if (!token) return false;
  try {
    const base64 = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/');
    if (!base64) return false;
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    if (!payload?.exp) return true;
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('adminToken');
  return isTokenValid(token) ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={(
            <ProtectedRoute>
              <AdminLayout />
            </ProtectedRoute>
          )}
        >
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/users" element={<Users />} />
          <Route path="/owner-requests" element={<OwnerRequests />} />
          <Route path="/kyc-requests" element={<KycRequests />} />
          <Route path="/properties" element={<Properties />} />
          <Route path="/bookings" element={<Bookings />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/complaints" element={<Complaints />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/reviews" element={<Reviews />} />
          <Route path="/content" element={<Content />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/revenue-command" element={<RevenueCommand />} />
          <Route path="/audit-logs" element={<AuditLogs />} />
          <Route path="/ops-center" element={<OpsCenter />} />
          <Route path="/export-center" element={<ExportCenter />} />
          <Route path="/access-control" element={<AccessControl />} />
          <Route path="/rule-engine" element={<RuleEngine />} />
          <Route path="/admin-notes" element={<AdminNotes />} />
          <Route path="/duplicate-hub" element={<DuplicateHub />} />
          <Route path="/duplicate-merge-history" element={<DuplicateMergeHistory />} />
          <Route path="/soft-deleted-users" element={<SoftDeletedUsers />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
