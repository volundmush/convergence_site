import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
	try {
		// Check if home page already exists
	const existingHomePage = await prisma.page.findUnique({
		where: { slug: '' },
	});

		if (existingHomePage) {
			console.log('Home page already exists, skipping seed');
		} else {
			// Create default home page
			const homePage = await prisma.page.create({
			data: {
				title: 'Home',
				slug: '',
				status: 'published',
				content: {
					document: [
						{
							type: 'paragraph',
							children: [
								{
									text: 'Welcome to Convergence',
								}
							]
						}
					]
				},
				publishedAt: new Date(),
			},
		});

			console.log('Default home page created:', homePage);
		}

		// Check if main navigation already exists
		const existingMainNav = await prisma.navigation.findUnique({
			where: { slug: 'main' },
		});

		if (!existingMainNav) {
			// Create Main Navigation
			const mainNav = await prisma.navigation.create({
				data: {
					name: 'Main Navigation',
					slug: 'main',
					description: 'Primary navigation menu for the main website',
					isActive: true,
					items: {
						create: [
							{
								label: 'Home',
								url: '/',
								target: 'self',
								sort: 0,
								isActive: true,
								icon: 'home',
								cssClass: 'nav-home',
							},
							{
								label: 'Events',
								url: '/logs/',
								target: 'self',
								sort: 1,
								isActive: true,
								icon: 'calendar',
								cssClass: 'nav-events',
								children: {
									create: [
										{
											label: 'Logs',
											url: '/logs/',
											target: 'self',
											sort: 0,
											isActive: true,
										},
										{
											label: 'Upcoming',
											url: '/logs/upcoming/',
											target: 'self',
											sort: 1,
											isActive: true,
										},
									],
								},
							},
							{
								label: 'Policies and Guides',
								url: '#',
								target: 'self',
								sort: 2,
								isActive: true,
								icon: 'book-open',
								cssClass: 'nav-policies',
								children: {
									create: [
										{
											label: 'Game Rules',
											url: '/game_rules/',
											target: 'self',
											sort: 0,
											isActive: true,
										},
									],
								},
							},
							{
								label: 'Settings',
								url: '#',
								target: 'self',
								sort: 3,
								isActive: true,
								icon: 'cog',
								cssClass: 'nav-settings',
								children: {
									create: [
										{
											label: 'Characters',
											url: '/characters/',
											target: 'self',
											sort: 0,
											isActive: true,
										},
									],
								},
							},
						],
					},
				},
			});
			console.log('Main navigation created:', mainNav);
		}
	} catch (error) {
		console.error('Error seeding database:', error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

main();
