import { useEffect, useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { applySeo, SITE_URL } from '../utils/seo';
import { seoLocationBySlug, seoLocations } from '../data/seoLocations';
import './SeoRentalPage.css';

const featureCards = [
  {
    title: 'Reviewed rental listings',
    text: 'DeraNow focuses on approved public listings with photos, rent, property type, and owner information.',
  },
  {
    title: 'Approximate location first',
    text: 'Renters can see the area before booking a visit, while exact map details stay protected until the visit flow.',
  },
  {
    title: 'Visit and booking records',
    text: 'Visit booking, payment status, booking charges, messages, agreements, and documents stay organized.',
  },
];

function buildListingSearchUrl(page) {
  const params = new URLSearchParams();
  if (page.searchLabel) params.set('q', page.searchLabel);
  if (page.city && page.city !== 'Nepal') params.set('location', page.city);
  return `/renter/listings?${params.toString()}`;
}

export default function SeoRentalPage() {
  const { slug } = useParams();
  const page = seoLocationBySlug[slug];

  const jsonLd = useMemo(() => {
    if (!page) return '';
    return JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'WebPage',
          name: page.title,
          url: `${SITE_URL}/${page.slug}/`,
          description: page.description,
          isPartOf: {
            '@type': 'WebSite',
            name: 'DeraNow',
            url: SITE_URL,
          },
        },
        {
          '@type': 'FAQPage',
          mainEntity: [
            {
              '@type': 'Question',
              name: `How do I ${page.searchLabel}?`,
              acceptedAnswer: {
                '@type': 'Answer',
                text: `Open DeraNow, compare approved listings in ${page.area}, then create an account to book visits and manage booking records.`,
              },
            },
            {
              '@type': 'Question',
              name: 'Can I see the exact property location?',
              acceptedAnswer: {
                '@type': 'Answer',
                text: 'DeraNow shows approximate location publicly. Exact map location is available after the renter books a visit for that property.',
              },
            },
          ],
        },
      ],
    });
  }, [page]);

  useEffect(() => {
    if (!page) return;
    applySeo({
      title: page.title,
      description: page.description,
      path: `/${page.slug}/`,
      robots: 'index, follow, max-image-preview:large',
    });
  }, [page]);

  if (!page) return <Navigate to="/" replace />;

  const listingSearchUrl = buildListingSearchUrl(page);
  const relatedPages = seoLocations.filter((item) => item.slug !== page.slug).slice(0, 4);

  return (
    <main className="seo-rental-page">
      <script type="application/ld+json">{jsonLd}</script>
      <section className="seo-rental-hero">
        <div className="seo-rental-wrap seo-rental-hero-grid">
          <div>
            <Link className="seo-rental-brand" to="/">DeraNow</Link>
            <p className="seo-rental-eyebrow">Verified rental search</p>
            <h1>{page.h1}</h1>
            <p>{page.intro}</p>
            <div className="seo-rental-actions">
              <Link to={listingSearchUrl} className="seo-rental-primary">Browse rentals</Link>
              <Link to="/register" className="seo-rental-secondary">Create account</Link>
            </div>
          </div>
          <aside className="seo-rental-panel" aria-label="DeraNow rental tools">
            <h2>What DeraNow helps you compare</h2>
            <ul>
              <li>Monthly rent and property type</li>
              <li>Room, flat, and house photos</li>
              <li>Approximate area before visit booking</li>
              <li>Owner status, ratings, and communication</li>
              <li>Visit, booking, payment, and agreement records</li>
            </ul>
          </aside>
        </div>
      </section>

      <section className="seo-rental-section">
        <div className="seo-rental-wrap">
          <div className="seo-rental-section-head">
            <h2>Search rentals around {page.area}</h2>
            <p>
              DeraNow is built for renters who want clearer rental information before calling,
              visiting, or paying. Search by area, compare details, and continue from your
              renter dashboard when you are ready.
            </p>
          </div>
          <div className="seo-rental-area-list">
            {page.relatedAreas.map((area) => (
              <Link key={area} to={`/renter/listings?location=${encodeURIComponent(area)}`}>
                {area}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="seo-rental-section seo-rental-muted">
        <div className="seo-rental-wrap seo-rental-card-grid">
          {featureCards.map((card) => (
            <article className="seo-rental-card" key={card.title}>
              <h2>{card.title}</h2>
              <p>{card.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="seo-rental-section">
        <div className="seo-rental-wrap seo-rental-faq">
          <div>
            <h2>Common questions about {page.searchLabel}</h2>
            <p>Useful answers before you compare listings or book a visit through DeraNow.</p>
          </div>
          <div className="seo-rental-faq-list">
            <details open>
              <summary>Is DeraNow only for rooms?</summary>
              <p>No. DeraNow supports rooms, flats, apartments, and houses, while keeping “room” language clear for renters searching smaller spaces.</p>
            </details>
            <details>
              <summary>Why does DeraNow show approximate location first?</summary>
              <p>Approximate location helps renters understand the area while protecting exact property details until a visit is booked.</p>
            </details>
            <details>
              <summary>Can owners list property on DeraNow?</summary>
              <p>Yes. Owners can create an account, add property details and photos, manage visits, review bookings, and track rental records.</p>
            </details>
          </div>
        </div>
      </section>

      <section className="seo-rental-section seo-rental-related">
        <div className="seo-rental-wrap">
          <h2>Popular rental searches</h2>
          <div className="seo-rental-related-grid">
            {relatedPages.map((item) => (
              <Link key={item.slug} to={`/${item.slug}/`}>
                {item.searchLabel}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
