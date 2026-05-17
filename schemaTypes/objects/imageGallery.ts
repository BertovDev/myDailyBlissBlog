import { defineType, defineField } from "sanity";

export default defineType({
  name: "imageGallery",
  title: "Image Gallery",
  type: "object",
  fields: [
    defineField({
      name: "images",
      type: "array",
      of: [{ type: "imageWithAlt" }],
      validation: (r) => r.min(1),
    }),
  ],
  preview: {
    select: { images: "images" },
    prepare({ images }) {
      return { title: `Gallery (${images?.length ?? 0} images)` };
    },
  },
});
