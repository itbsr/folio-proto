import { hc } from 'hono/client';
import type { AppType } from '@my-app/backend';

// Use the current origin for the client, assuming Vite proxy in dev
// and same-domain in production.
const client = hc<AppType>('/');

export default client;
