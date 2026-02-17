"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

interface NarrativeRendererProps {
  text: string
  isStreaming?: boolean
}

export function NarrativeRenderer({ text, isStreaming }: NarrativeRendererProps) {
  return (
    <div className="prose prose-invert max-w-none prose-headings:font-display prose-headings:text-gold prose-strong:text-foreground prose-em:text-foreground/80 prose-hr:border-border/50 prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:font-serif prose-code:bg-secondary/50 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5 prose-code:text-xs prose-pre:bg-secondary/50 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-lg">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-1.5 h-4 ml-1 bg-primary/80 animate-pulse align-middle" />
      )}
    </div>
  )
}
