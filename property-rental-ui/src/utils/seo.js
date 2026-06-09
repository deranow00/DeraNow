export const SITE_URL = 'https://deranow.com';
export const SITE_NAME = 'DeraNow';
export const SITE_ALTERNATE_NAME = 'Dera Now';
export const DEFAULT_IMAGE = `${SITE_URL}/property.png`;
export const DEFAULT_TITLE = 'DeraNow | Verified Rooms, Flats & Houses for Rent in Nepal';
export const DEFAULT_DESCRIPTION =
  'Find verified rooms, flats, and houses in Nepal with DeraNow, also searched as Dera Now. Book visits, manage payments, agreements, documents, and owner-renter communication in one place.';

const getOrCreateMeta = (selector, createAttributes) => {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    Object.entries(createAttributes).forEach(([key, value]) => element.setAttribute(key, value));
    document.head.appendChild(element);
  }
  return element;
};

const setMeta = (name, content) => {
  const element = getOrCreateMeta(`meta[name="${name}"]`, { name });
  element.setAttribute('content', content);
};

const setPropertyMeta = (property, content) => {
  const element = getOrCreateMeta(`meta[property="${property}"]`, { property });
  element.setAttribute('content', content);
};

const setCanonical = (url) => {
  let element = document.head.querySelector('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }
  element.setAttribute('href', url);
};

export const absoluteUrl = (path = '/') => {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalizedPath}`;
};

export const applySeo = ({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path = '/',
  image = DEFAULT_IMAGE,
  robots = 'index, follow, max-image-preview:large',
  type = 'website',
} = {}) => {
  const canonical = absoluteUrl(path);
  const imageUrl = absoluteUrl(image);

  document.title = title;
  setCanonical(canonical);
  setMeta('description', description);
  setMeta('robots', robots);
  setMeta('application-name', `${SITE_NAME} - ${SITE_ALTERNATE_NAME}`);
  setPropertyMeta('og:title', title);
  setPropertyMeta('og:description', description);
  setPropertyMeta('og:type', type);
  setPropertyMeta('og:url', canonical);
  setPropertyMeta('og:image', imageUrl);
  setPropertyMeta('og:site_name', SITE_NAME);
  setMeta('twitter:card', 'summary_large_image');
  setMeta('twitter:title', title);
  setMeta('twitter:description', description);
  setMeta('twitter:image', imageUrl);
};
