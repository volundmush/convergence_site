import { config } from '@keystone-6/core';
import { allowAll } from '@keystone-6/core/access';
import { lists } from './schema';
import express from 'express';

export default config({
  db: {
    provider: 'postgresql',
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/convergence_web',
  },
  lists,
  session: {
    secret: process.env.SESSION_SECRET || 'development-secret-key-change-in-production',
    data: 'role',
    get: ({ item }) => ({ isSignedIn: !!item, role: item?.role }),
  },
  storage: {
    images: {
      kind: 'local',
      type: 'image',
      storagePath: 'public/images',
      publicPath: '/images',
    },
    files: {
      kind: 'local',
      type: 'file',
      storagePath: 'public/files',
      publicPath: '/files',
    },
  },
  server: {
    cors: { origin: true, credentials: true },
    extendExpressApp: app => {
      app.set('trust proxy', true);
      app.use(
        '/images',
        express.static('public/images', { index: false, redirect: false, lastModified: false })
      )
      app.use(
        '/files',
        express.static('public/files', {
          setHeaders(res) {
            res.setHeader('Content-Type', 'application/octet-stream')
          },
          index: false,
          redirect: false,
          lastModified: false,
        })
      )
    },
  },
  ui: {
    basePath: '/',
    isAccessAllowed: allowAll,
  },
});
