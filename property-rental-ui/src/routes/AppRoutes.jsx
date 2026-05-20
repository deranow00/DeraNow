import React, { useContext, useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from '../pages/login/Login';
import OwnerLayout from '../layouts/OwnerLayout';
import RenterLayout from '../layouts/RenterLayout';
import OwnerDashboard from '../pages/owner/Dashboard';
import MyProperties from '../pages/owner/MyProperties';
import RenterHome from '../pages/renter/Home';
import AddProperty from '../pages/owner/AddProperty';
import Bookings from '../pages/owner/Bookings';
import MyBookings from '../pages/renter/MyBookings';
import Listings from '../pages/renter/Listings';
import Favorites from '../pages/renter/Favorites';
import Register from '../pages/login/Register';
import ForgotPassword from '../pages/login/ForgotPassword';
import ResetPassword from '../pages/login/ResetPassword';
import Landing from '../pages/Landing';
import { AuthContext } from '../context/AuthContext';
import PropertyDetails from '../components/common/PropertyDetails';
import Messages from '../pages/owner/Messages';
import Message from '../pages/renter/Message';
import ComplaintPage from '../pages/renter/ComplaintPage';
import OwnerComplaint from '../pages/owner/OwnerComplaint';
import PaymentStatus from '../pages/owner/PaymentStatus';
import ComplaintHistory from '../pages/renter/ComplaintHistory';
import PaymentPage from '../pages/renter/PaymentPage';
import PaymentSuccess from '../pages/renter/PaymentSuccess';
import PaymentFailure from '../pages/renter/PaymentFailure';
import Settings from '../pages/common/Settings';
import Agreements from '../pages/common/Agreements';
import Profile from '../pages/common/Profile';
import DocumentCenter from '../pages/common/DocumentCenter';

function PrivateRoute({ children, role }) {
  const { user } = useContext(AuthContext);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== role) {
    const fallback = user.role === 'owner' || user.role === 'renter' ? `/${user.role}` : '/login';
    return <Navigate to={fallback} replace />;
  }

  return children;
}

function RootEntryRoute() {
  const { user } = useContext(AuthContext);
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 900;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth <= 900);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (user?.role === 'owner' || user?.role === 'renter') {
    return <Navigate to={`/${user.role}`} replace />;
  }

  return isMobileView ? <Navigate to="/login" replace /> : <Landing />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootEntryRoute />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password/:token" element={<ResetPassword />} />

      <Route
        path="/owner/*"
        element={
          <PrivateRoute role="owner">
            <OwnerLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<OwnerDashboard />} />
        <Route path="properties" element={<MyProperties />} />
        <Route path="add" element={<AddProperty />} />
        <Route path="requests" element={<Bookings />} />
        <Route path="messages" element={<Messages />} />
        <Route path="ocomplaint" element={<OwnerComplaint />} />
        <Route path="payment-status" element={<PaymentStatus />} />
        <Route path="agreements" element={<Agreements />} />
        <Route path="profile" element={<Profile />} />
        <Route path="documents" element={<DocumentCenter />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route
        path="/renter/*"
        element={
          <PrivateRoute role="renter">
            <RenterLayout />
          </PrivateRoute>
        }
      >
        <Route index element={<RenterHome />} />
        <Route path="bookings" element={<MyBookings />} />
        <Route path="listings" element={<Listings />} />
        <Route path="favorites" element={<Favorites />} />
        <Route path="message" element={<Message />} />
        <Route path="agreements" element={<Agreements />} />
        <Route path="profile" element={<Profile />} />
        <Route path="documents" element={<DocumentCenter />} />
        <Route path="complaint" element={<ComplaintPage />} />
        <Route path="complaint-history" element={<ComplaintHistory />} />
        <Route path="payments" element={<PaymentPage />} />
        <Route path="payment/success" element={<PaymentSuccess />} />
        <Route path="payment/failure" element={<PaymentFailure />} />
        <Route path="settings" element={<Settings />} />
      </Route>

      <Route path="/property/:id" element={<PropertyDetails />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
