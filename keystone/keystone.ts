import { config } from '@keystone-6/core';
import { allowAll } from '@keystone-6/core/access';
import { lists } from './schema';
import express from 'express';
import * as jose from 'jose';
import { runSeed } from './lib/seedService';
import cookieParser from 'cookie-parser';

export default config({
	db: {
		provider: 'postgresql',
		url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/convergence_web',
	},
	lists,
	session: {
		secret: process.env.SESSION_SECRET || 'development-secret-key-change-in-production',
		data: 'authenticated',
		get: ({ item }) => ({ isSignedIn: !!item }),
	},
	storage: {
		images: {
			kind: 'local',
			type: 'image',
			storagePath: '/app/keystone/public/images',
			publicPath: '/admin/public/images',
			generateUrl: (filename: string) => `/admin/public/images/${filename}`.replace(/\/+/g, '/'),
		},
		publicPages: ['/no-access'],
		files: {
			kind: 'local',
			type: 'file',
			storagePath: '/app/keystone/public/files',
			publicPath: '/admin/public/files',
			generateUrl: (filename: string) => `/admin/public/files/${filename}`.replace(/\/+/g, '/'),
		},
	},
	server: {
		cors: { origin: true, credentials: true },
		extendExpressApp: (app, commonContext) => {
			app.set('trust proxy', true);
			app.use(cookieParser());

			app.use(
				'/admin/public/images',
				express.static('/app/keystone/public/images', { index: false, redirect: false, lastModified: false })
			);
			app.use(
				'/admin/public/files',
				express.static('/app/keystone/public/files', {
					setHeaders(res) {
						res.setHeader('Content-Type', 'application/octet-stream')
					},
					index: false,
					redirect: false,
					lastModified: false,
				})
			);
			app.use(
				'/admin/public/files',
				(req, res, next) => {
					console.log('[Static Files] Request:', req.method, req.url, 'Full path:', req.path);
					express.static('/app/keystone/public/files', {
						setHeaders(res) {
							res.setHeader('Content-Type', 'application/octet-stream')
						},
						index: false,
						redirect: false,
						lastModified: false,
					})(req, res, next);
				}
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
		isAccessAllowed: async (context) => {
			const req = context.req as any;
			
			// Check JWT cookie
			if (req?.cookies?.auth) {
				try {
					const JWT_SECRET = process.env.JWT_SECRET || 'change-this-in-production';
					const jwtSecret = new TextEncoder().encode(JWT_SECRET);
					await jose.jwtVerify(req.cookies.auth, jwtSecret);
					return true;
				} catch (e) {
					// Invalid JWT, fall through
				}
			}
			
			// Allow anonymous access from internal network
			if (req) {
				// Check X-Forwarded-For header first (set by Traefik/proxies)
				const forwardedFor = req.headers?.['x-forwarded-for'] || '';
				// Check direct connection IP
				const directIp = req.ip || req.connection?.remoteAddress || '';
				
				let ip = forwardedFor.split(',')[0].trim() || directIp;
				
				// Strip IPv6 prefix if present (::ffff:x.x.x.x)
				ip = ip.replace(/^::ffff:/, '');
				
				// Match private IP ranges: 127.x, 10.x, 172.16-31.x, 192.168.x, ::1 (IPv6 localhost)
				const isInternal = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|::1)/.test(ip);
				
				// Allow health checks from any source
				const isHealthCheck = req.path === '/' && req.method === 'GET';
				
				if (isInternal || isHealthCheck) {
					return true;
				}
			}
			
			return false;
		},
		getAdditionalFiles: [
			async () => ({
				mode: 'write',
				outputPath: 'next.config.js',
				src: `const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ['../../admin'],
  basePath: '/admin',
}

module.exports = nextConfig`,
			}),
		],
	},
});
