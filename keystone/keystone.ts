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
      // Log all requests
      app.use((req, res, next) => {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
        next();
      });
      // Serve Admin UI at /admin basePath
      const fs = require('fs');
      const path = require('path');
      const adminPath = path.join(process.cwd(), '.keystone/admin/.next');
      console.log(`[ADMIN] Checking for admin UI at: ${adminPath}`);
      if (fs.existsSync(adminPath)) {
        console.log(`[ADMIN] Found admin UI, serving...`);
        app.use('/admin', express.static(adminPath, { index: 'index.html' }));
        app.get('/admin*', (req, res) => {
          res.sendFile(path.join(adminPath, 'index.html'));
        });
      } else {
        console.error(`[ADMIN] ERROR: Admin UI directory not found at ${adminPath}`);
      }
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
    basePath: '/admin',
    isAccessAllowed: allowAll,
  },
});
