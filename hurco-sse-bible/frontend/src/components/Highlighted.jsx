const HL_START = '';
const HL_END = '';

// Renders FTS snippet text with <mark> highlights via plain text nodes —
// never dangerouslySetInnerHTML — since snippet bodies come from user files.
export default function Highlighted({ text }) {
  if (!text) return null;
  const parts = text.split(HL_START);

  return (
    <>
      {parts.map((part, i) => {
        if (i === 0) return <span key={i}>{part}</span>;
        const [highlighted, rest] = part.split(HL_END);
        return (
          <span key={i}>
            <mark>{highlighted}</mark>
            {rest}
          </span>
        );
      })}
    </>
  );
}
