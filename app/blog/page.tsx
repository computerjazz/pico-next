import Link from "next/link";
import { getAllPosts } from "./posts-manifest";
import PageHeader from "../components/PageHeader";
import Image from "next/image";

export const metadata = {
  title: "Blog",
};

export default async function BlogIndex() {
  const posts = getAllPosts();

  return (
    <div>
      <PageHeader>
        <h1 className="text-3xl font-bold text-accent">Blog</h1>
      </PageHeader>
      <div className="p-4">
        <ul>
          {posts.map((post) => {
            const thumbnail = post.thumbnail;
            return (
              <li key={post.slug}>
                <Link href={`/blog/${post.slug}`}>
                  <h2>{post.title}</h2>
                </Link>
                {thumbnail && (
                  <Image
                    src={thumbnail}
                    alt={post.title}
                    width={400}
                    height={400}
                    style={{ width: "100%", maxWidth: 400, height: "auto" }}
                  />
                )}
                <time>{post.date}</time>
                <p>{post.excerpt}</p>
                {post.tags && (
                  <div>
                    {post.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
