import React from "react";
import PageHeader from "../../components/PageHeader";

function BlogPostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <PageHeader />
      <div className="p-4 prose dark:prose-invert flex flex-1 justify-center">
        <div className="flex-col max-w-md">{children}</div>
      </div>
    </div>
  );
}

export default BlogPostLayout;
