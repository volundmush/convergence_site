import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
	try {
		// Check if home page already exists
		const existingHomePage = await prisma.page.findUnique({
			where: { slug: '/' },
		});

		if (existingHomePage) {
			console.log('Home page already exists, skipping seed');
			return;
		}

		// Create default home page
		const homePage = await prisma.page.create({
			data: {
				title: 'Home',
				slug: '/',
				status: 'published',
				content: 'Welcome to Convergence',
				publishedAt: new Date(),
			},
		});

		console.log('Default home page created:', homePage);
	} catch (error) {
		console.error('Error seeding database:', error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

main();
