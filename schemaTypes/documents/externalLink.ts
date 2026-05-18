import { defineType, defineField } from "sanity";

export default defineType({
  name: "externalLink",
  title: "External Link",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "url",
      type: "url",
      validation: (r) => r.required(),
    }),
    defineField({ name: "description", type: "text", rows: 2 }),
    defineField({
      name: "order",
      type: "number",
      description: "Lower = first",
    }),
  ],
  orderings: [
    {
      title: "Manual order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
  preview: { select: { title: "title", subtitle: "url" } },
});
