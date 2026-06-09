import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { applySeo, DEFAULT_DESCRIPTION, DEFAULT_TITLE } from '../../utils/seo';
import { seoLocationBySlug } from '../../data/seoLocations';

const routeSeo = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    robots: 'index, follow, max-image-preview:large',
  },
  '/login': {
    title: 'Login | DeraNow',
    description: 'Sign in to DeraNow to manage rental listings, visits, bookings, payments, documents, and messages.',
    robots: 'noindex, follow',
  },
  '/register': {
    title: 'Create Account | DeraNow',
    description: 'Create a DeraNow account as a renter or owner to search verified rentals or manage property listings.',
    robots: 'noindex, follow',
  },
  '/forgot-password': {
    title: 'Reset Password | DeraNow',
    description: 'Request a secure password reset link for your DeraNow account.',
    robots: 'noindex, nofollow',
  },
};

export default function SeoManager() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const privateAppRoute = path.startsWith('/owner') || path.startsWith('/renter');
    const resetRoute = path.startsWith('/reset-password');
    const propertyRoute = path.startsWith('/property/');
    const seoLandingPage = seoLocationBySlug[path.replace(/^\/+/, '').replace(/\/+$/, '')];

    if (seoLandingPage) {
      applySeo({
        title: seoLandingPage.title,
        description: seoLandingPage.description,
        path,
        robots: 'index, follow, max-image-preview:large',
      });
      return;
    }

    if (propertyRoute) {
      applySeo({
        title: 'Rental Property Details | DeraNow',
        description: 'View verified rental property details, photos, pricing, visit charges, and booking information on DeraNow.',
        path,
        robots: 'index, follow, max-image-preview:large',
      });
      return;
    }

    if (privateAppRoute || resetRoute) {
      applySeo({
        title: 'DeraNow App',
        description: 'DeraNow renter and owner dashboard.',
        path,
        robots: 'noindex, nofollow',
      });
      return;
    }

    applySeo({
      path,
      ...(routeSeo[path] || routeSeo['/']),
    });
  }, [location.pathname]);

  return null;
}
