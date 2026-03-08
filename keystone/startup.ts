import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

async function waitForKeystone(maxAttempts = 30): Promise<void> {
	let attempt = 0;
	let waitTime = 1000;

	console.log('⏳ Waiting for Keystone to be ready...');

	while (attempt < maxAttempts) {
		try {
			const response = await fetch('http://localhost:3000/admin', { method: 'HEAD' });
			if (response.ok || response.status === 403) {
				console.log('✅ Keystone is ready');
				return;
			}
		} catch {
			// Connection failed, continue waiting
		}

		attempt++;
		if (attempt < maxAttempts) {
			console.log(`  Attempt ${attempt}/${maxAttempts} (waiting ${waitTime}ms)...`);
			await new Promise((resolve) => setTimeout(resolve, waitTime));
			waitTime = Math.min(waitTime * 2, 8000);
		}
	}

	throw new Error('Keystone failed to start after maximum attempts');
}

async function runSeed(): Promise<void> {
	console.log('🌱 Running seed...');

	try {
		const response = await fetch('http://localhost:3000/seed', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
		});

		if (!response.ok) {
			throw new Error(`Seed endpoint returned ${response.status}`);
		}

		console.log('✅ Seed completed successfully');
	} catch (error) {
		console.error('⚠️  Seed endpoint failed:', error instanceof Error ? error.message : error);
		console.log('Continuing anyway...');
	}
}

async function main(): Promise<void> {
	console.log('🔄 Syncing Prisma schema to database...');

	// Run prisma db push
	await new Promise<void>((resolve, reject) => {
		const prisma = spawn('pnpm', ['prisma', 'db', 'push', '--skip-generate'], {
			stdio: 'inherit',
			shell: true,
		});

		prisma.on('close', (code) => {
			if (code === 0) {
				console.log('✅ Database schema synced');
				resolve();
			} else {
				reject(new Error(`Prisma db push failed with code ${code}`));
			}
		});
	});

	console.log('🚀 Starting Keystone...');

	// Start Keystone
	const keystone = spawn('pnpm', ['start'], {
		stdio: 'inherit',
		shell: true,
	});

	// Wait for it to be healthy, then seed
	try {
		await waitForKeystone();
		await runSeed();
	} catch (error) {
		console.error('❌ Error during startup:', error instanceof Error ? error.message : error);
		keystone.kill();
		process.exit(1);
	}

	// Keep the process running
	await new Promise(() => {
		// Never resolves - keeps the startup process alive
	});
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
