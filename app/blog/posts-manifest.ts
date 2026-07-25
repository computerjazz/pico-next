import { StaticImageData } from "next/image";

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  excerpt: string;
  tags?: string[];
  thumbnail?: StaticImageData;
}

const slugs = ["designing-for-fun"];

export const posts: PostMeta[] = await Promise.all(
  slugs.map(async (slug) => {
    const post = await import(`./(post)/${slug}/page.mdx`);
    return {
      ...post.metadata,
      slug,
    };
  }),
);

export function getAllPosts() {
  return [...posts].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
}

export function getPostMeta(slug: string) {
  return posts.find((p) => p.slug === slug);
}
