import { defineCollection, reference, z } from "astro:content";

const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    imageUrl: z.string(),
    references: z.array(z.string()),
  }),
});

const linkPage = defineCollection({
  type: "data",
  schema: z.object({
    title: z.string(),
    url: z.string(),
    description: z.string(),
  }),
});

export const collections = { blog, linkPage };
