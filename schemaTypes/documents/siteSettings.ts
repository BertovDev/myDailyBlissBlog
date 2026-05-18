import { defineType, defineField } from "sanity";

export default defineType({
  name: "siteSettings",
  title: "Site Settings",
  type: "document",
  fields: [
    defineField({
      name: "siteTitle",
      type: "string",
      initialValue: "My Daily Bliss",
    }),
    defineField({ name: "siteDescription", type: "text", rows: 2 }),
    defineField({ name: "twitterHandle", type: "string" }),
    defineField({ name: "twitterDescription", type: "text", rows: 2 }),
    defineField({ name: "defaultOgImage", type: "imageWithAlt" }),
    defineField({ name: "favicon", type: "image" }),
    defineField({
      name: "marqueeText",
      type: "string",
      initialValue: "DAILY REMINDER, BUILD.",
    }),
    defineField({
      name: "headerGreeting",
      type: "string",
      initialValue: "Welcome",
    }),
  ],
});
