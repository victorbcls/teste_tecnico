import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface RagDocument {
  id: string;
  country: string;
  nationality: string;
  purpose: string;
  duration: string;
  content: string;
  source: string;
}

const DOCS_DIR = path.join(process.cwd(), "data", "rag-docs");
const REQUIRED_FIELDS = ["country", "nationality", "purpose", "duration"] as const;

export function loadDocs(dir: string = DOCS_DIR): RagDocument[] {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  return files.map((file) => {
    const raw = fs.readFileSync(path.join(dir, file), "utf-8");
    const parsed = matter(raw);
    const data = parsed.data as Record<string, string>;
    for (const field of REQUIRED_FIELDS) {
      if (!data[field]) {
        throw new Error(`${file}: campo de frontmatter ausente: ${field}`);
      }
    }
    return {
      id: file.replace(/\.md$/, ""),
      country: data.country,
      nationality: data.nationality,
      purpose: data.purpose,
      duration: data.duration,
      content: parsed.content.trim(),
      source: file,
    };
  });
}
