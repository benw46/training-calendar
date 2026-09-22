// Lightweight LaTeX-style sub/superscript markup — turns "Z_q[X]/(X^256+1)"
// into Z with a subscript q and X with a superscript "256+1", the way the
// notation reads in real math typesetting. Not a LaTeX engine (no KaTeX/
// MathJax dependency): `_`/`^` followed by `{...}` takes everything inside
// the braces; otherwise it takes a run of digits/+/- (an exponent like
// "256+1") or a single standalone letter not immediately followed by another
// letter/digit — covers the bare shorthand people actually type (X^256+1,
// Z_q) without needing braces for it.
//
// Deliberately NOT "any run of letters" for the bare form: real prose is full
// of underscored identifiers that aren't math notation at all — a card about
// `s_server`/`s_client` (the openssl CLI tools) would otherwise render as "s"
// with "erver"/"lient" chopped off into a subscript. A multi-letter run after
// `_`/`^` only becomes a subscript/superscript if the author explicitly wraps
// it in braces (a_{server}), the same way real LaTeX requires braces once the
// script is more than one character.
//
// Read-only display only, e.g. WorkoutCard's title/description — the editable
// form fields it's typed into are plain <input>/<textarea>, which can only
// ever show raw text, so there's nothing to render there anyway.
const MARKUP = /([_^])(?:\{([^}]*)\}|([0-9+-]+|[A-Za-z](?![A-Za-z0-9])))/g

export function renderMathNotation(text) {
  if (!text) return text

  const parts = []
  let lastIndex = 0
  let key = 0
  let match
  MARKUP.lastIndex = 0
  while ((match = MARKUP.exec(text))) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index))
    const [, marker, braced, bare] = match
    const content = braced ?? bare
    const Tag = marker === '_' ? 'sub' : 'sup'
    parts.push(<Tag key={key++}>{content}</Tag>)
    lastIndex = MARKUP.lastIndex
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex))

  return parts.length ? parts : text
}
