/**
 * Navigation Helper Utilities for Keystone Navigation Collections
 * Provides functions to query, process, and format navigation data
 */

export interface NavigationItem {
	id: string;
	label: string;
	url: string;
	target: 'self' | 'blank';
	sort: number;
	isActive: boolean;
	cssClass?: string;
	icon?: string;
	description?: string;
	children?: NavigationItem[];
	parent?: NavigationItem | null;
}

export interface Navigation {
	id: string;
	name: string;
	slug: string;
	description?: string;
	isActive: boolean;
	items: NavigationItem[];
}

/**
 * Sort navigation items by the sort field
 */
export function sortNavigationItems(items: NavigationItem[]): NavigationItem[] {
	return items.sort((a, b) => (a.sort || 0) - (b.sort || 0));
}

/**
 * Build hierarchical tree structure from flat navigation items
 */
export function buildNavigationTree(items: NavigationItem[]): NavigationItem[] {
	const itemMap = new Map<string, NavigationItem>();
	const roots: NavigationItem[] = [];

	// First pass: create map of all items
	items.forEach((item) => {
		itemMap.set(item.id, { ...item, children: [] });
	});

	// Second pass: build tree structure
	items.forEach((item) => {
		const treeItem = itemMap.get(item.id)!;
		if (item.parent) {
			const parentItem = itemMap.get(item.parent.id);
			if (parentItem) {
				if (!parentItem.children) {
					parentItem.children = [];
				}
				parentItem.children.push(treeItem);
			}
		} else {
			roots.push(treeItem);
		}
	});

	// Sort each level
	roots.sort((a, b) => (a.sort || 0) - (b.sort || 0));
	roots.forEach((item) => {
		if (item.children) {
			item.children.sort((a, b) => (a.sort || 0) - (b.sort || 0));
		}
	});

	return roots;
}

/**
 * Filter active items and their active children
 */
export function filterActiveItems(items: NavigationItem[]): NavigationItem[] {
	return items
		.filter((item) => item.isActive)
		.map((item) => ({
			...item,
			children: item.children ? filterActiveItems(item.children) : undefined,
		}))
		.filter((item) => item.isActive || (item.children && item.children.length > 0));
}

/**
 * Flatten hierarchical navigation for simple list rendering
 */
export function flattenNavigation(items: NavigationItem[], depth = 0): Array<NavigationItem & { depth: number }> {
	let result: Array<NavigationItem & { depth: number }> = [];

	items.forEach((item) => {
		result.push({ ...item, depth });
		if (item.children && item.children.length > 0) {
			result = result.concat(flattenNavigation(item.children, depth + 1));
		}
	});

	return result;
}

/**
 * Format navigation for JSON API response
 */
export function formatNavigationJSON(navigation: Navigation): object {
	return {
		id: navigation.id,
		name: navigation.name,
		slug: navigation.slug,
		description: navigation.description,
		isActive: navigation.isActive,
		items: formatItemsJSON(navigation.items),
	};
}

/**
 * Format navigation items for JSON API response
 */
export function formatItemsJSON(items: NavigationItem[]): object[] {
	return items.map((item) => ({
		id: item.id,
		label: item.label,
		url: item.url,
		target: item.target,
		sort: item.sort,
		isActive: item.isActive,
		cssClass: item.cssClass,
		icon: item.icon,
		description: item.description,
		children: item.children && item.children.length > 0 ? formatItemsJSON(item.children) : [],
	}));
}

/**
 * Generate HTML navigation list
 */
export function generateNavigationHTML(items: NavigationItem[], cssClass = 'nav-list'): string {
	if (!items.length) return '';

	const listItems = items
		.filter((item) => item.isActive)
		.map((item) => {
			const itemClass = ['nav-item', item.cssClass].filter(Boolean).join(' ');
			const targetAttr = item.target === 'blank' ? '_blank' : '_self';
			const linkAttrs = [`href="${escapeHTML(item.url)}"`, `class="nav-link"`, `target="${targetAttr}"`]
				.filter(Boolean)
				.join(' ');

			let html = `<li class="${itemClass}"><a ${linkAttrs}>`;

			if (item.icon) {
				html += `<span class="nav-icon icon-${escapeHTML(item.icon)}"></span>`;
			}

			html += `<span class="nav-label">${escapeHTML(item.label)}</span></a>`;

			if (item.children && item.children.length > 0) {
				html += `<ul class="nav-submenu">${generateNavigationHTML(item.children)}</ul>`;
			}

			html += '</li>';
			return html;
		})
		.join('');

	return `<ul class="nav ${cssClass}">${listItems}</ul>`;
}

/**
 * Escape HTML special characters
 */
function escapeHTML(text: string): string {
	const map: Record<string, string> = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;',
	};
	return text.replace(/[&<>"']/g, (char) => map[char]);
}

/**
 * Get navigation by slug
 */
export async function getNavigationBySlug(slug: string, keystoneURL: string, adminSecret: string): Promise<Navigation | null> {
	try {
		const query = `
			query {
				navigations(where: { slug: { equals: "${slug}" } }) {
					id
					name
					slug
					description
					isActive
					items(orderBy: { sort: asc }) {
						id
						label
						url
						target
						sort
						isActive
						cssClass
						icon
						description
						children(orderBy: { sort: asc }) {
							id
							label
							url
							target
							sort
							isActive
							cssClass
							icon
							description
						}
					}
				}
			}
		`;

		const response = await fetch(`${keystoneURL}/api/graphql`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${adminSecret}`,
			},
			body: JSON.stringify({ query }),
		});

		const data = await response.json();
		return data.data?.navigations?.[0] || null;
	} catch (error) {
		console.error('[Navigation Helper] Error fetching navigation:', error);
		return null;
	}
}

/**
 * Get all active navigations
 */
export async function getAllNavigations(keystoneURL: string, adminSecret: string): Promise<Navigation[]> {
	try {
		const query = `
			query {
				navigations(where: { isActive: { equals: true } }, orderBy: { name: asc }) {
					id
					name
					slug
					description
					isActive
					items(orderBy: { sort: asc }) {
						id
						label
						url
						target
						sort
						isActive
						cssClass
						icon
						description
						children(orderBy: { sort: asc }) {
							id
							label
							url
							target
							sort
							isActive
							cssClass
							icon
							description
						}
					}
				}
			}
		`;

		const response = await fetch(`${keystoneURL}/api/graphql`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${adminSecret}`,
			},
			body: JSON.stringify({ query }),
		});

		const data = await response.json();
		return data.data?.navigations || [];
	} catch (error) {
		console.error('[Navigation Helper] Error fetching navigations:', error);
		return [];
	}
}
