import { config } from '@keystone-6/core';
import { allowAll } from '@keystone-6/core/access';
import { lists } from './schema';

export default config({
  db: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/convergence_web',
  },
  lists,
  session: {
    secret: process.env.SESSION_SECRET || 'development-secret-key-change-in-production',
  },
  ui: {
    basePath: '/admin',
    isAccessAllowed: allowAll,
  },
});
