"""Allowlist-based safety validation for user-supplied LaTeX source.

LaTeX is compiled in the sandboxed ``latex_worker`` (no shell escape,
``--untrusted``), but defense in depth requires rejecting dangerous
constructs before persistence. This module allows a small known-good set of
document classes/packages and rejects primitives that enable file, shell,
or Lua access.
"""

from __future__ import annotations

import re

MAX_TEX_BYTES = 200_000

ALLOWED_DOCUMENTCLASS = frozenset({"article"})

ALLOWED_PACKAGES = frozenset(
    {
        "geometry",
        "fontenc",
        "inputenc",
        "lmodern",
        "enumitem",
        "titlesec",
        "hyperref",
        "xcolor",
    }
)

# Case-insensitive patterns for constructs that must never be persisted.
_DENIED_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\\write\s*18", re.I),
    re.compile(r"\\immediate\s*\\write", re.I),
    re.compile(r"\\openout", re.I),
    re.compile(r"\\openin", re.I),
    re.compile(r"\\newread", re.I),
    re.compile(r"\\read\b", re.I),
    re.compile(r"\\readline\b", re.I),
    re.compile(r"\\closein", re.I),
    re.compile(r"\\verbatiminput\b", re.I),
    re.compile(r"\\InputIfFileExists\b", re.I),
    re.compile(r"\\newwrite", re.I),
    re.compile(r"\\input\b", re.I),
    re.compile(r"\\include\b", re.I),
    re.compile(r"\\directlua", re.I),
    re.compile(r"\\luadirect", re.I),
    re.compile(r"\\luaexec", re.I),
    re.compile(r"\\ShellEscape", re.I),
    re.compile(r"\\catcode", re.I),
    re.compile(r"\\includegraphics\b", re.I),
)

# LaTeX skips whitespace (and stripped comments) before arguments.
_PACKAGE_RE = re.compile(r"\\usepackage\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}")
_DOCUMENTCLASS_RE = re.compile(r"\\documentclass\s*(?:\[[^\]]*\]\s*)?\{([^}]*)\}")
_PACKAGE_BARE_RE = re.compile(r"\\(?:usepackage|documentclass)\b")
_ENVIRONMENT_RE = re.compile(r"\\(?:begin|end)\s*\{([^}]+)\}")
_CONTROL_SEQUENCE_RE = re.compile(r"\\([A-Za-z@]+|.)")

_ALLOWED_ENVIRONMENTS = frozenset({"center", "document", "itemize"})

_ALLOWED_COMMANDS = frozenset(
    {
        "author",
        "begin",
        "bfseries",
        "centering",
        "color",
        "definecolor",
        "documentclass",
        "emph",
        "end",
        "fcolorbox",
        "hfill",
        "href",
        "item",
        "itshape",
        "label",
        "large",
        "Large",
        "LARGE",
        "linebreak",
        "maketitle",
        "newline",
        "noindent",
        "normalsize",
        "pageref",
        "pagestyle",
        "par",
        "raggedright",
        "ref",
        "section",
        "scriptsize",
        "section",
        "setlist",
        "small",
        "textasciicircum",
        "textasciitilde",
        "textbackslash",
        "textbf",
        "textcolor",
        "textit",
        "textnormal",
        "texttt",
        "titlerule",
        "title",
        "titleformat",
        "today",
        "underline",
        "usepackage",
        "url",
        "vspace",
    }
)
_ALLOWED_SYMBOLS = frozenset(r"%&#_$~^{}\\,.;:!?[]()-=|/ ")


class UnsafeLatexError(ValueError):
    """Raised when LaTeX source fails allowlist validation."""


def escape_latex(value: str | None) -> str:
    """Escape user-controlled text for inclusion in LaTeX source."""
    if not value:
        return ""
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    return "".join(replacements.get(char, char) for char in value)


def validate_latex_source(tex_source: str) -> None:
    """Raise :class:`UnsafeLatexError` if the source is not allowlisted."""
    if not tex_source or not tex_source.strip():
        raise UnsafeLatexError("LaTeX source is empty")
    if len(tex_source.encode("utf-8")) > MAX_TEX_BYTES:
        raise UnsafeLatexError("LaTeX source exceeds the size limit")

    for pattern in _DENIED_PATTERNS:
        if pattern.search(tex_source):
            raise UnsafeLatexError(
                f"LaTeX source contains a forbidden construct ({pattern.pattern})"
            )

    without_comments = re.sub(r"(?m)(?<!\\)%.*$", "", tex_source)
    for match in _CONTROL_SEQUENCE_RE.finditer(without_comments):
        token = match.group(1)
        if token.isalpha() or "@" in token:
            if token not in _ALLOWED_COMMANDS:
                raise UnsafeLatexError(
                    f"LaTeX command {token!r} is not allowlisted"
                )
        elif token not in _ALLOWED_SYMBOLS:
            raise UnsafeLatexError(
                f"LaTeX control symbol {token!r} is not allowlisted"
            )

    class_matches = list(_DOCUMENTCLASS_RE.finditer(without_comments))
    package_matches = list(_PACKAGE_RE.finditer(without_comments))
    bare_count = len(_PACKAGE_BARE_RE.findall(without_comments))
    if bare_count != len(class_matches) + len(package_matches):
        raise UnsafeLatexError(
            "Every \\usepackage / \\documentclass must use a plain {name} argument"
        )

    for match in class_matches:
        for name in match.group(1).split(","):
            classname = name.strip().lower()
            if classname and classname not in ALLOWED_DOCUMENTCLASS:
                raise UnsafeLatexError(
                    f"Document class {classname!r} is not allowlisted"
                )

    for match in package_matches:
        for name in match.group(1).split(","):
            package = name.strip().lower()
            if package and package not in ALLOWED_PACKAGES:
                raise UnsafeLatexError(f"Package {package!r} is not allowlisted")

    for match in _ENVIRONMENT_RE.finditer(tex_source):
        environment = match.group(1).strip()
        if environment not in _ALLOWED_ENVIRONMENTS:
            raise UnsafeLatexError(
                f"LaTeX environment {environment!r} is not allowlisted"
            )
