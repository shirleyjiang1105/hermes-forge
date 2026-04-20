import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { CodeBlock } from "./CodeBlock";

type Block = { content: string; code: boolean };

export function StreamingMarkdown(props: { content: string; isStreaming?: boolean; className?: string; onFileClick?: (path: string) => void }) {
  const blocks = splitIntoBlocks(props.content);
  return (
    <div className={props.className}>
      {blocks.map((block, index) => {
        const active = props.isStreaming && index === blocks.length - 1;
        const key = active ? `active-${index}` : `block-${hashBlock(block.content)}`;
        return <MemoizedMarkdownBlock key={key} content={block.content} onFileClick={props.onFileClick} />;
      })}
    </div>
  );
}

const MemoizedMarkdownBlock = React.memo(function MarkdownBlock(props: { content: string; onFileClick?: (path: string) => void }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeRaw, rehypeSanitize]}
      components={{
        code({ className, children }) {
          const match = /language-(\w+)/.exec(className ?? "");
          const content = String(children).replace(/\n$/, "");
          if (match) return <CodeBlock code={content} language={match[1]} />;
          return <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-800">{children}</code>;
        },
        a({ href, children }) {
          const value = href ?? "";
          const looksLikeFile = /^(?:[a-z]:\\|\/|\.\/|~\/).+\.[\w]+$/i.test(value);
          return (
            <button
              type="button"
              className="font-medium text-blue-600 underline decoration-blue-300 underline-offset-4 transition hover:text-blue-700"
              onClick={() => {
                if (looksLikeFile) props.onFileClick?.(value);
                else if (value) window.open(value, "_blank", "noopener,noreferrer");
              }}
            >
              {children}
            </button>
          );
        },
        img({ src, alt }) {
          return <img src={src ?? ""} alt={alt ?? ""} className="my-3 max-h-72 rounded-2xl border border-slate-200 object-contain shadow-sm" loading="lazy" />;
        },
      }}
    >
      {props.content}
    </ReactMarkdown>
  );
});

function splitIntoBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const lines = content.split("\n");
  let current = "";
  let inCode = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (!inCode && current.trim()) {
        blocks.push({ content: current.trim(), code: false });
        current = "";
      }
      current += current ? `\n${line}` : line;
      if (inCode) {
        blocks.push({ content: current, code: true });
        current = "";
      }
      inCode = !inCode;
      continue;
    }
    if (!inCode && line === "") {
      if (current.trim()) {
        blocks.push({ content: current.trim(), code: false });
        current = "";
      }
      continue;
    }
    current += current ? `\n${line}` : line;
  }
  if (current) blocks.push({ content: inCode ? current : current.trim(), code: inCode });
  return blocks.length ? blocks : [{ content: "", code: false }];
}

function hashBlock(input: string) {
  let hash = 5381;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
