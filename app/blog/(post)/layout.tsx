import React from "react";
import PageHeader from "../../components/PageHeader";

function BlogPostLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <PageHeader />
      <div className="p-4 prose dark:prose-invert">{children}</div>
    </div>
  );
}

export default BlogPostLayout;
