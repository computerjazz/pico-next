#!/usr/bin/env node
/**
 * publish-atproto.mjs
 *
 * Syncs pico-next blog posts to site.standard.publication / site.standard.document
 * records on the self-hosted PDS at pds.picopi.cc, under the picopi.cc handle.
 *
 * Usage:
 *   node scripts/publish-atproto.mjs           # publish/update everything
 *   node scripts/publish-atproto.mjs --dry-run # show what would happen, no writes
 */

import "./env"; // swap for your project's actual env-loading if different
import fs from "node:fs";
import path from "node:path";
import { AtpAgent } from "@atproto/api";
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkMdx from "remark-mdx";
import { toString as mdastToString } from "mdast-util-to-string";
import * as acorn from "acorn";

import { slugs } from "../app/blog/posts-manifest";

// ---- ADJUST to match your real project structure ----

// Where your colocated per-post folders live, relative to repo root.
const POSTS_DIR = path.join(process.cwd(), "app", "blog", "(post)");

// The filename inside each post folder holding the MDX content.
// App Router convention is usually page.mdx, not index.mdx — confirm this matches.
const POST_FILENAME = "page.mdx";

// Your fixed publication record — created once in Phase 6, Step 1.
const PUBLICATION_URI = `at://${process.env.ATPROTO_IDENTIFIER}/site.standard.publication/self`;

// --------------------------------------------------------------------

const DRY_RUN = process.argv.includes("--dry-run");

function parseMdx(raw: unknown) {
  return unified()
    .use(remarkParse)
    .use(remarkMdx, { acorn, acornOptions: { sourceType: "module" } })
    .parse(raw);
}

// mdast-util-to-string doesn't know about MDX-specific node types, so its
// fallback reads their raw .value — which for mdxjsEsm (import/export
// statements) and mdx{Flow,Text}Expression ({...} JS blocks) is literal
// source code, not prose. Strip those before stringifying so they don't
// leak into textContent. JSX elements themselves are left alone — their
// nested children (real prose inside a custom component) should come through.
const NON_PROSE_NODE_TYPES = new Set([
  "mdxjsEsm",
  "mdxFlowExpression",
  "mdxTextExpression",
]);

function stripNonProseNodes(node: unknown) {
  if (!node.children) return node;
  return {
    ...node,
    children: node.children
      .filter((child) => !NON_PROSE_NODE_TYPES.has(child.type))
      .map(stripNonProseNodes),
  };
}

function mdxToPlainText(tree: unknown) {
  const stripped = stripNonProseNodes(tree);
  // Join each top-level block (heading, paragraph, etc.) with a space,
  // since mdast-util-to-string concatenates with no separator by default —
  // fine within a paragraph, but runs headings straight into following text.
  return stripped.children
    .map((child) => mdastToString(child))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// Walks the estree AST of `export const metadata = {...}` and pulls out only
// literal values (strings, numbers, arrays/objects of literals). Anything
// referencing an identifier — like an imported image — is safely skipped,
// since we can't resolve it outside Next.js's own loaders anyway.
function literalValue(node: unknown) {
  if (!node) return undefined;
  if (node.type === "Literal") return node.value;
  if (node.type === "ArrayExpression") {
    return node.elements.map(literalValue).filter((v) => v !== undefined);
  }
  if (node.type === "ObjectExpression") {
    const obj = {};
    for (const prop of node.properties) {
      if (prop.type !== "Property") continue;
      const key = prop.key.name ?? prop.key.value;
      obj[key] = literalValue(prop.value);
    }
    return obj;
  }
  return undefined; // Identifier, TemplateLiteral, etc. — not resolvable statically
}

function extractMetadata(tree: unknown) {
  for (const node of tree.children) {
    if (node.type !== "mdxjsEsm" || !node.data?.estree) continue;
    for (const stmt of node.data.estree.body) {
      if (stmt.type !== "ExportNamedDeclaration" || !stmt.declaration) continue;
      if (stmt.declaration.type !== "VariableDeclaration") continue;
      for (const declarator of stmt.declaration.declarations) {
        if (declarator.id.name === "metadata") {
          return literalValue(declarator.init) ?? {};
        }
      }
    }
  }
  return {};
}

function loadPosts() {
  return slugs.map((slug) => {
    const filePath = path.join(POSTS_DIR, slug, POST_FILENAME);
    const raw = fs.readFileSync(filePath, "utf-8");
    const tree = parseMdx(raw);
    const metadata = extractMetadata(tree);

    if (!metadata.date) {
      throw new Error(
        `${slug}: no "date" field found in export const metadata — check ${POST_FILENAME} has it set.`,
      );
    }

    return {
      slug,
      title: metadata.title,
      description: metadata.description ?? "",
      tags: metadata.keywords ?? [],
      publishedAt: new Date(metadata.date).toISOString(),
      textContent: mdxToPlainText(tree),
    };
  });
}

async function main() {
  const posts = loadPosts();

  if (posts.length === 0) {
    console.log(
      `No posts found in ${POSTS_DIR} — check POSTS_DIR/POST_FILENAME.`,
    );
    return;
  }

  console.log(`Found ${posts.length} post(s).`);

  if (DRY_RUN) {
    for (const post of posts) {
      console.log(`\n[dry-run] would publish: ${post.slug}`);
      console.log(`  title: ${post.title}`);
      console.log(`  publishedAt: ${post.publishedAt}`);
      console.log(
        `  textContent preview: ${post.textContent.slice(0, 120)}...`,
      );
    }
    return;
  }

  const agent = new AtpAgent({ service: process.env.ATPROTO_PDS_HOST });
  await agent.login({
    identifier: process.env.ATPROTO_IDENTIFIER,
    password: process.env.ATPROTO_PASSWORD,
  });

  for (const post of posts) {
    if (!post.title) {
      console.warn(`Skipping ${post.slug}: no title in frontmatter.`);
      continue;
    }

    try {
      const result = await agent.com.atproto.repo.putRecord({
        repo: agent.session.did,
        collection: "site.standard.document",
        rkey: post.slug,
        record: {
          $type: "site.standard.document",
          site: PUBLICATION_URI,
          path: `/blog/${post.slug}`,
          title: post.title,
          description: post.description,
          textContent: post.textContent,
          tags: post.tags,
          publishedAt: post.publishedAt,
        },
      });
      console.log(`✓ ${post.slug} -> ${result.data.uri}`);
    } catch (err) {
      console.error(`✗ ${post.slug} failed:`, err.message ?? err);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
