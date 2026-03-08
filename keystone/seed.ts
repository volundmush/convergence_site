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
								target: '_self',
								sort: 0,
								isActive: true,
								icon: 'home',
								cssClass: 'nav-home',
							},
							{
								label: 'Characters',
								url: '/characters',
								target: '_self',
								sort: 1,
								isActive: true,
								icon: 'users',
								cssClass: 'nav-characters',
							},
							{
								label: 'Logs',
								url: '/logs',
								target: '_self',
								sort: 2,
								isActive: true,
								icon: 'book',
								cssClass: 'nav-logs',
							},
							{
								label: 'Information',
								url: '/info',
								target: '_self',
								sort: 3,
								isActive: true,
								icon: 'info',
								cssClass: 'nav-info',
							},
						],
					},
				},
			});
			console.log('Main navigation created:', mainNav);

			// Create Footer Navigation
			const footerNav = await prisma.navigation.create({
				data: {
					name: 'Footer Navigation',
					slug: 'footer',
					description: 'Navigation links displayed in website footer',
					isActive: true,
					items: {
						create: [
							{
								label: 'Privacy Policy',
								url: '/privacy',
								target: '_self',
								sort: 0,
								isActive: true,
							},
							{
								label: 'Terms of Service',
								url: '/terms',
								target: '_self',
								sort: 1,
								isActive: true,
							},
							{
								label: 'Contact Us',
								url: '/contact',
								target: '_self',
								sort: 2,
								isActive: true,
							},
							{
								label: 'Sitemap',
								url: '/sitemap',
								target: '_self',
								sort: 3,
								isActive: true,
							},
						],
					},
				},
			});
			console.log('Footer navigation created:', footerNav);

			// Create User Menu Navigation
			const userMenu = await prisma.navigation.create({
				data: {
					name: 'User Menu',
					slug: 'user-menu',
					description: 'Navigation menu for authenticated user actions',
					isActive: true,
					items: {
						create: [
							{
								label: 'Profile',
								url: '/profile',
								target: '_self',
								sort: 0,
								isActive: true,
								icon: 'user',
							},
							{
								label: 'Settings',
								url: '/settings',
								target: '_self',
								sort: 1,
								isActive: true,
								icon: 'cog',
							},
							{
								label: 'Help',
								url: '/help',
								target: '_self',
								sort: 2,
								isActive: true,
								icon: 'question',
							},
							{
								label: 'Logout',
								url: '/logout',
								target: '_self',
								sort: 3,
								isActive: true,
								icon: 'logout',
								cssClass: 'nav-logout',
							},
						],
					},
				},
			});
			console.log('User menu created:', userMenu);
		}
	} catch (error) {
		console.error('Error seeding database:', error);
		throw error;
	} finally {
		await prisma.$disconnect();
	}
}

main();
