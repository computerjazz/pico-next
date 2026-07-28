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
      <div className="p-4 flex justify-center">
        <ul>
          {posts.map((post) => {
            const thumbnail = post.thumbnail;
            return (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="flex flex-col max-w-md"
              >
                <h2 className="font-bold text-2xl">{post.title}</h2>
                <time className="text-muted-foreground">
                  {new Date(post.date).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
                <div className="flex flex-row gap-4">
                  {thumbnail && (
                    <Image
                      src={thumbnail}
                      alt={post.title}
                      width={200}
                      height={200}
                      className="w-full max-w-[150px] rounded-md"
                    />
                  )}

                  <p>{post.description}</p>
                </div>
                {/* {post.keywords && (
                  <div className="flex gap-2 text-muted-foreground">
                    {post.keywords.map((kw) => (
                      <span key={kw}>{kw}</span>
                    ))}
                  </div>
                )} */}
              </Link>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
