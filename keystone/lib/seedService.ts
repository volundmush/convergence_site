export async function runSeed(context: any) {
	try {
		// Check if home page already exists
		const existingHomePages = await context.query.Page.findMany({
			where: { slug: { equals: '' } },
		});

		if (existingHomePages.length === 0) {
			// Create default home page with correct document structure (array of blocks, not root object)
			await context.query.Page.createOne({
				data: {
					title: 'Home',
					slug: '',
					status: 'published',
					content: [
						{
							type: 'paragraph',
							children: [
								{
									text: 'Welcome to Convergence MUSH',
								},
							],
						},
					],
					publishedAt: new Date().toISOString(),
				},
			});
			console.log('[Seed] Default home page created');
		}

		// Check if main navigation already exists
		const existingNavs = await context.query.Navigation.findMany({
			where: { slug: { equals: 'main' } },
		});

		if (existingNavs.length === 0) {
			// Create navigation items first
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
			});

			const logsItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Logs',
					url: '/logs/',
					target: 'self',
					sort: 0,
					isActive: true,
				},
			});

			const upcomingItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Upcoming',
					url: '/logs/upcoming/',
					target: 'self',
					sort: 1,
					isActive: true,
				},
			});

			const gameRulesItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Game Rules',
					url: '/game_rules/',
					target: 'self',
					sort: 0,
					isActive: true,
				},
			});

			const charactersItem = await context.query.NavigationItem.createOne({
				data: {
					label: 'Characters',
					url: '/characters/',
					target: 'self',
					sort: 0,
					isActive: true,
				},
			});

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
			});

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
			});
			console.log('[Seed] Main navigation created');
		}

		return { success: true };
	} catch (error) {
		console.error('[Seed] Error:', error);
		throw error;
	}
}
