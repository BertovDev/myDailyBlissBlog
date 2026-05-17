import { defineType, defineField } from "sanity";

export default defineType({
  name: "post",
  title: "Post",
  type: "document",
  fields: [
    defineField({
      name: "title",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (r) => r.required(),
    }),
    defineField({ name: "description", type: "text", rows: 3 }),
    defineField({
      name: "publishedAt",
      type: "datetime",
      validation: (r) => r.required(),
    }),
    defineField({ name: "hero", type: "imageWithAlt", title: "Hero Image" }),
    defineField({ name: "body", type: "blockContent" }),
    defineField({
      name: "references",
      type: "array",
      title: "References",
      of: [{ type: "postReference" }],
    }),
  ],
  orderings: [
    {
      title: "Published date, new",
      name: "publishedAtDesc",
      by: [{ field: "publishedAt", direction: "desc" }],
    },
  ],
  preview: {
    select: { title: "title", subtitle: "publishedAt", media: "hero" },
  },
});
