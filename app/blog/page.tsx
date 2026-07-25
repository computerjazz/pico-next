import Link from "next/link";
import { getAllPosts } from "./posts-manifest";
import Image from "next/image";
import PageHeader from "../components/PageHeader";

export const metadata = {
  title: "Blog",
};

export default async function BlogIndex() {
  const posts = getAllPosts();

  return (
    <div>
      <PageHeader />
      <div className="p-4">
        <ul>
          {posts.map((post) => {
            const thumbnail = post.thumbnail;
            return (
              <li key={post.slug}>
                <Link href={`/blog/${post.slug}`}>
                  <h2 className="font-bold text-2xl">{post.title}</h2>
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
                <time>
                  {new Date(post.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>

                <p>{post.excerpt}</p>
                {post.tags && (
                  <div className="flex gap-2 text-muted-foreground">
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
