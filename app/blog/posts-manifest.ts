import { StaticImageData } from "next/image";

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  description: string;
  keywords?: string[];
  thumbnail?: StaticImageData;
}

export const slugs = ["building-for-fun"];

export async function getAllPosts() {
  const posts: PostMeta[] = await Promise.all(
    slugs.map(async (slug) => {
      const post = await import(`./(post)/${slug}/page.mdx`);
      return {
        ...post.metadata,
        slug,
      };
    }),
  );
  return [...posts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}
