// Next.js 16 auto-loads this at client startup. It only calls the adapter's
// init — it does NOT import posthog-js directly, preserving the ESLint boundary.
import { initPosthog } from '@/lib/analytics/providers/posthog-client';

initPosthog();
