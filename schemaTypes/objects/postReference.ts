import { defineType, defineField } from "sanity";

export default defineType({
  name: "postReference",
  title: "Reference",
  type: "object",
  fields: [
    defineField({
      name: "label",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({ name: "url", type: "url", title: "URL (optional)" }),
  ],
  preview: {
    select: { title: "label", subtitle: "url" },
  },
});
