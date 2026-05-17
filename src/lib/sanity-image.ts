import imageUrlBuilder from "@sanity/image-url";
import { sanityClient } from "sanity:client";

const builder = imageUrlBuilder(sanityClient);

export const urlFor = (src: any) => builder.image(src).auto("format").fit("max");
