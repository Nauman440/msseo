export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <figure className="overflow-hidden rounded-tile bg-night">
      {label && (
        <figcaption className="border-b border-night-line px-4 py-2 font-mono text-[11px] text-white/50">{label}</figcaption>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-white/85">
        <code>{code}</code>
      </pre>
    </figure>
  );
}
