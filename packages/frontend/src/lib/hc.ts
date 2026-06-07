import { hc } from 'hono/client';
import type { AppType } from '@my-app/backend';

// API origin (approach B: frontend and backend on separate origins).
//  - Production: set VITE_API_URL to the deployed Worker origin,
//    e.g. https://my-app-backend.<account>.workers.dev  (no trailing /api).
//  - Dev: leave it unset; requests stay same-origin and go through the Vite proxy.
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

// credentials: 'include' so the cross-site `session` cookie is sent to the API.
const client = hc<AppType>(API_BASE || '/', {
  init: { credentials: 'include' },
});

export default client;
