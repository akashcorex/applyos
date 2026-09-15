"""Parse ``.tex`` uploads into :class:`ParsedDocument` for LLM extraction.

The raw ``.tex`` bytes are always preserved separately as the source
document; only the detexed plain text is sent to the extractor. Detexing is
lossy by design (comments/commands stripped) and must never be treated as
the canonical resume — ``ResumeIR`` remains the source of truth.
"""

from __future__ import annotations

import re

from services.latex_safety import validate_latex_source
from services.parser import ParsedDocument, SourceSegment

TEX_PARSER_VERSION = "resume-tex-parser.v1"

_COMMENT_RE = re.compile(r"(?m)(?<!\\)%.*$")
_COMMAND_WITH_ARG_RE = re.compile(r"\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{([^}]*)\}")
_COMMAND_BARE_RE = re.compile(r"\\[a-zA-Z]+\*?")
_ITEM_RE = re.compile(r"\\item\b")


def detex_for_llm(tex_source: str) -> str:
    """Strip comments/commands so the LLM sees plain resume text."""
    text = _COMMENT_RE.sub("", tex_source)
    text = _ITEM_RE.sub("\n- ", text)
    # Unwrap commands, keeping their inner text (e.g. \textbf{X} -> X).
    previous = None
    while previous != text:
        previous = text
        text = _COMMAND_WITH_ARG_RE.sub(r"\1", text)
    text = _COMMAND_BARE_RE.sub(" ", text)
    text = text.replace("{", " ").replace("}", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_tex_bytes(raw_bytes: bytes) -> ParsedDocument:
    """Validate and detex raw ``.tex`` bytes into a ``ParsedDocument``."""
    if not raw_bytes:
        raise ValueError("Uploaded file is empty")
    try:
        tex_source = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("Could not decode .tex file as UTF-8") from exc
    validate_latex_source(tex_source)
    from services.parser import ResumeParser

    text = ResumeParser._normalise(detex_for_llm(tex_source))
    segment = SourceSegment(text=text, page=None, kind="tex", start=0, end=len(text))
    return ParsedDocument(file_type="tex", text=text, segments=(segment,))
