import { defineType, defineField } from "sanity";

export default defineType({
  name: "imageWithAlt",
  title: "Image",
  type: "image",
  options: { hotspot: true },
  fields: [
    defineField({
      name: "alt",
      type: "string",
      title: "Alt text",
      validation: (r) =>
        r.required().error("Alt text is required for accessibility"),
    }),
    defineField({ name: "caption", type: "string", title: "Caption" }),
  ],
});
