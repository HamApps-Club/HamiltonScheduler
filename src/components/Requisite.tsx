const CODE = /\b([A-Z]{2,6} \d{3}[A-Z]?)\b/g

/** Requisite text from the catalogue ("CHEM 120 or consent of instructor"), with each course code a search link. */
export default function Requisite({ text, onSearch }: { text: string; onSearch: (code: string) => void }) {
  const parts = text.split(CODE) // odd indexes are course codes
  return (
    <>
      {parts.map((p, i) => (i % 2 ? (
        <button key={i} className="link code-link" onClick={() => onSearch(p)} title={`Search for ${p}`}>{p}</button>
      ) : p))}
    </>
  )
}
