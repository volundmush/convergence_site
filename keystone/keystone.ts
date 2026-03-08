import { config } from '@keystone-6/core';
import { allowAll } from '@keystone-6/core/access';
import { lists } from './schema';
import express from 'express';
import { runSeed } from './lib/seedService';

export default config({
	db: {
		provider: 'postgresql',
		url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/convergence_web',
	},
	lists,
	session: {
		secret: process.env.SESSION_SECRET || 'development-secret-key-change-in-production',
		data: 'authenticated',
		get: ({ item }) => ({ isSignedIn: !!item, bittype: item?.bittype }),
	},
	storage: {
		images: {
			kind: 'local',
			type: 'image',
			storagePath: 'public/images',
			publicPath: '/images',
		},
		publicPages: ['/no-access'],
		files: {
			kind: 'local',
			type: 'file',
			storagePath: 'public/files',
			publicPath: '/files',
		},
	},
	server: {
		cors: { origin: true, credentials: true },
		extendExpressApp: (app, commonContext) => {
			app.set('trust proxy', true);
			const cookieParser = require('cookie-parser');
			app.use(cookieParser());
			// Custom session middleware to validate JWT from auth cookie
			app.use((req, res, next) => {
				const token = req.cookies?.auth;
				if (token) {
					try {
						const parts = token.split('.');
						const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
						req.session = {
							isSignedIn: true,
							bittype: payload.bittype,
							accountName: payload.accountName,
							characterName: payload.characterName,
							item: { authenticated: true }
						};
					} catch (e) {
						// Invalid token, continue without session
					}
				}
				next();
			});
			// Log all requests
			app.use((req, res, next) => {
				console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
				next();
			});

			app.use(
				'/images',
				express.static('public/images', { index: false, redirect: false, lastModified: false })
			);
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
			);

			// Seed endpoint - POST /seed to run after system is up
			app.post('/seed', async (req, res) => {
				try {
					const context = commonContext.sudo();
					const result = await runSeed(context);
					res.json({ success: true, message: 'Seed completed successfully' });
				} catch (error: any) {
					console.error('[Seed] Error:', error);
					res.status(500).json({ success: false, error: error.message });
				}
			});
		},
	},
	ui: {
		basePath: '/admin',
		isAccessAllowed: (context) => {
			// Allow if user is signed in
			if (context.session?.isSignedIn) {
				return true;
			}
			
			// Allow anonymous access from internal network
			const req = context.req as any;
			if (req) {
				const ip = req.ip || req.connection?.remoteAddress || '';
				const isInternal = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(ip);
				if (isInternal) {
					console.log('[Admin Access] Allowed from internal IP:', ip);
					return true;
				}
			}
			
			console.log('[Admin Access] Denied - not authenticated and not from internal network');
			return false;
		},
	},
});
