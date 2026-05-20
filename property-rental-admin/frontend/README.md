# Property Rental Admin Frontend

## E2E smoke tests

Playwright smoke coverage is added for:
- Admin login
- Bookings page
- Payments page (payouts area)
- Complaints page

### Setup

1. Copy `.env.e2e.example` values into your shell/session:
- `E2E_BASE_URL` (where admin frontend is running)
- `ADMIN_E2E_USERNAME`
- `ADMIN_E2E_PASSWORD`

2. Install dependencies:

```bash
npm install
npx playwright install chromium
```

### Run

```bash
npm run test:e2e
```

Optional:

```bash
npm run test:e2e:headed
npm run test:e2e:ui
```
