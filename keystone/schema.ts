import { list } from '@keystone-6/core';
import { allowAll } from '@keystone-6/core/access';
import {
  checkbox,
  file,
  image,
  relationship,
  text,
  timestamp,
  richText,
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
      content: richText({
        formatting: {
          inlineMarks: true,
          listTypes: true,
          alignment: true,
        },
        dividers: true,
        links: true,
        images: true,
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
