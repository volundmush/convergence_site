import { getContext } from '@keystone-6/core/context';
import config from './keystone';

async function main() {
	const context = getContext(config).sudo();

	try {
		// Check if home page already exists
		const existingHomePages = await context.query.Page.findMany({
			where: { slug: { equals: '' } },
			query: 'id slug title',
		});

		if (existingHomePages.length > 0) {
			console.log('Home page already exists, skipping seed');
		} else {
			// Create default home page
			const homePage = await context.query.Page.createOne({
				data: {
					title: 'Home',
					slug: '',
					status: 'published',
					content: JSON.stringify([
						{
							type: 'paragraph',
							children: [{ text: 'Welcome to Convergence MUSH' }],
						},
					]),
					publishedAt: new Date().toISOString(),
				},
				query: 'id title slug',
			});

			console.log('Default home page created:', homePage);
		}

		// Check if main navigation already exists
		const existingNavs = await context.query.Navigation.findMany({
			where: { slug: { equals: 'main' } },
			query: 'id slug name',
		});

		if (existingNavs.length === 0) {
			// Create navigation items first (without parent/children relationships)
			const homeItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Home',
					url: '/',
					target: 'self',
					sort: 0,
					isActive: true,
					icon: 'home',
					cssClass: 'nav-home',
				},
				query: 'id label',
			});

			const logsItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Logs',
					url: '/logs/',
					target: 'self',
					sort: 0,
					isActive: true,
				},
				query: 'id label',
			});

			const upcomingItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Upcoming',
					url: '/logs/upcoming/',
					target: 'self',
					sort: 1,
					isActive: true,
				},
				query: 'id label',
			});

			const gameRulesItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Game Rules',
					url: '/game_rules/',
					target: 'self',
					sort: 0,
					isActive: true,
				},
				query: 'id label',
			});

			const charactersItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Characters',
					url: '/characters/',
					target: 'self',
					sort: 0,
					isActive: true,
				},
				query: 'id label',
			});

			// Create parent items with their children
			const eventsItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Events',
					url: '#',
					target: 'self',
					sort: 1,
					isActive: true,
					icon: 'calendar',
					cssClass: 'nav-events',
					children: {
						connect: [{ id: logsItem.id }, { id: upcomingItem.id }],
					},
				},
				query: 'id label',
			});

			const policiesItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Policies and Guides',
					url: '#',
					target: 'self',
					sort: 2,
					isActive: true,
					icon: 'book-open',
					cssClass: 'nav-policies',
					children: {
						connect: [{ id: gameRulesItem.id }],
					},
				},
				query: 'id label',
			});

			const settingsItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Settings',
					url: '#',
					target: 'self',
					sort: 3,
					isActive: true,
					icon: 'cog',
					cssClass: 'nav-settings',
					children: {
						connect: [{ id: charactersItem.id }],
					},
				},
				query: 'id label',
			});

			// Create Main Navigation with all items
			const mainNav = await context.query.Navigation.createOne({
				data: {
					name: 'Main Navigation',
					slug: 'main',
					description: 'Primary navigation menu for the main website',
					isActive: true,
					items: {
						connect: [
							{ id: homeItem.id },
							{ id: eventsItem.id },
							{ id: policiesItem.id },
							{ id: settingsItem.id },
						],
					},
				},
				query: 'id slug name',
			});
			console.log('Main navigation created:', mainNav);
		}
	} catch (error) {
		console.error('Error seeding database:', error);
		process.exit(1);
	}

	process.exit(0);
}

main();
