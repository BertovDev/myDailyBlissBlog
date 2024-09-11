import { defineCollection, reference, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    references: z.array(z.string()),
  }),
});

export const collections = { blog };
