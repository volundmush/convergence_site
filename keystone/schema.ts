import { list } from '@keystone-6/core';
import { allowAll } from '@keystone-6/core/access';
import {
	checkbox,
	document,
	file,
	image,
	relationship,
	text,
	timestamp,
	select,
} from '@keystone-6/core/fields';

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
				formatting: { inlineMarks: 'inherit', softBreaks: 'inherit' },
				dividers: 'inherit',
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
};
