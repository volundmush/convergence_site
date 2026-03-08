import { list } from '@keystone-6/core';
import { allowAll } from '@keystone-6/core/access';
import {
	checkbox,
	file,
	image,
	relationship,
	text,
	timestamp,
	select,
	integer,
} from '@keystone-6/core/fields';
import { document } from '@keystone-6/fields-document';

export const lists = {
	Image: list({
		access: allowAll,
		fields: {
			name: text({
				validation: { isRequired: true },
			}),
			image: image({
				storage: 'images',
				validation: { isRequired: true },
			}),
			alt: text({
				ui: {
					displayMode: 'textarea',
				},
			}),
			caption: text({
				ui: {
					displayMode: 'textarea',
				},
			}),
			createdAt: timestamp({
				defaultValue: { kind: 'now' },
			}),
		},
	}),

	Page: list({
		access: allowAll,
		fields: {
			title: text({
				validation: { isRequired: true },
			}),
			slug: text({
				validation: { isRequired: true },
				isIndexed: 'unique',
			}),
			status: select({
				type: 'enum',
				options: [
					{ label: 'Draft', value: 'draft' },
					{ label: 'Published', value: 'published' },
				],
				defaultValue: 'draft',
			}),
			content: document({
				formatting: {
					inlineMarks: {
						bold: true,
						italic: true,
						underline: true,
						strikethrough: true,
						code: true,
						superscript: true,
						subscript: true,
						keyboard: true,
					},
					listTypes: {
						ordered: true,
						unordered: true,
					},
					alignment: {
						center: true,
						end: true,
					},
					headingLevels: [1, 2, 3, 4, 5, 6],
					blockTypes: {
						blockquote: true,
						code: true,
					},
					softBreaks: true,
				},
				links: true,
				dividers: true,
				layouts: [[1, 1], [1, 1, 1]],
			}),
			images: relationship({
				ref: 'Image',
				many: true,
			}),
			publishedAt: timestamp(),
			createdAt: timestamp({
				defaultValue: { kind: 'now' },
			}),
		updatedAt: timestamp({
			db: { updatedAt: true },
		}),
	},
}),

	Navigation: list({
		access: allowAll,
		fields: {
			name: text({
				validation: { isRequired: true },
			}),
			slug: text({
				validation: { isRequired: true },
				isIndexed: 'unique',
			}),
			description: text({
				ui: {
					displayMode: 'textarea',
				},
			}),
			isActive: checkbox({
				defaultValue: true,
			}),
			items: relationship({
				ref: 'NavigationItem.navigation',
				many: true,
			}),
			createdAt: timestamp({
				defaultValue: { kind: 'now' },
			}),
			updatedAt: timestamp({
				db: { updatedAt: true },
			}),
		},
	}),

	NavigationItem: list({
		access: allowAll,
		fields: {
			label: text({
				validation: { isRequired: true },
			}),
			url: text({
				validation: { isRequired: true },
			}),
			target: select({
				type: 'enum',
				options: [
					{ label: 'Same Window', value: '_self' },
					{ label: 'New Window', value: '_blank' },

				],
				defaultValue: '_self',
			}),
			navigation: relationship({
				ref: 'Navigation.items',
			}),
			parent: relationship({
				ref: 'NavigationItem.children',
			}),
			children: relationship({
				ref: 'NavigationItem.parent',
				many: true,
			}),
			sort: integer({
				defaultValue: 0,
			}),
			isActive: checkbox({
				defaultValue: true,
			}),
			cssClass: text({
				ui: {
					placeholder: 'e.g., btn-primary, nav-highlight',
				},
			}),
			icon: text({
				ui: {
					placeholder: 'e.g., home, users, settings',
				},
			}),
			description: text({
				ui: {
					displayMode: 'textarea',
				},
			}),
			createdAt: timestamp({
				defaultValue: { kind: 'now' },
			}),
			updatedAt: timestamp({
				db: { updatedAt: true },
			}),
		},
	}),
};
