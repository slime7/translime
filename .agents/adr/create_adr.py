#!/usr/bin/env python3
"""Create a numbered ADR with deterministic structure and no placeholders."""

from __future__ import annotations

import argparse
import re
import sys
import unicodedata
from datetime import date
from pathlib import Path


ADR_FILENAME_PATTERN = re.compile(r"^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$")
SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CJK_PATTERN = re.compile(r"[\u3400-\u9fff]")
LANGUAGE_LABELS = {
    "en": {
        "status": "Status",
        "date": "Date",
        "supersedes": "Supersedes",
        "none": "none",
        "context": "Context",
        "decision": "Decision",
        "options": "Options considered",
        "consequences": "Consequences",
    },
    "zh": {
        "status": "状态",
        "date": "日期",
        "supersedes": "替代",
        "none": "无",
        "context": "背景",
        "decision": "决策",
        "options": "考虑的方案",
        "consequences": "影响",
    },
}


def non_empty(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise argparse.ArgumentTypeError("value must not be empty")
    return normalized


def single_line_non_empty(value: str) -> str:
    normalized = non_empty(value)
    if "\n" in normalized or "\r" in normalized:
        raise argparse.ArgumentTypeError("value must stay on one line")
    return normalized


def project_relative_path(value: str) -> Path:
    normalized = value.strip()
    path = Path(normalized)
    looks_like_windows_absolute = re.match(r"^[a-zA-Z]:[\\/]", normalized)
    if not normalized:
        raise argparse.ArgumentTypeError("path must not be empty")
    if (
        path.is_absolute()
        or looks_like_windows_absolute
        or normalized.startswith("\\\\")
    ):
        raise argparse.ArgumentTypeError("path must be relative to the project root")
    if ".." in path.parts:
        raise argparse.ArgumentTypeError("path must not leave the project root")
    return path


def resolve_project_path(project_root: Path, relative_path: Path) -> Path:
    resolved_root = project_root.resolve()
    resolved_path = (resolved_root / relative_path).resolve()
    try:
        resolved_path.relative_to(resolved_root)
    except ValueError as error:
        raise ValueError(f"path leaves the project root: {relative_path}") from error
    return resolved_path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create the next numbered ADR in a project-relative directory."
    )
    parser.add_argument("project_root", type=Path, help="Path to the project root")
    parser.add_argument(
        "title", type=single_line_non_empty, help="Human-readable decision title"
    )
    parser.add_argument("--slug", help="Lowercase ASCII filename slug")
    parser.add_argument(
        "--adr-dir",
        type=project_relative_path,
        default=Path("docs/adr"),
        help="ADR directory relative to the project root (default: docs/adr)",
    )
    parser.add_argument(
        "--language", choices=("auto", "zh", "en"), default="auto"
    )
    parser.add_argument(
        "--status", choices=("proposed", "active"), default="proposed"
    )
    parser.add_argument("--date", dest="decision_date", help="Date in YYYY-MM-DD form")
    parser.add_argument("--supersedes", help="Four-digit ADR number being replaced")
    parser.add_argument("--context", required=True, type=non_empty)
    parser.add_argument("--decision", required=True, type=non_empty)
    parser.add_argument("--option", required=True, action="append", type=non_empty)
    parser.add_argument(
        "--consequence", required=True, action="append", type=non_empty
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Print the ADR without creating it"
    )
    return parser.parse_args()


def slugify(title: str) -> str:
    normalized = unicodedata.normalize("NFKD", title)
    ascii_title = normalized.encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "-", ascii_title).strip("-")


def resolve_slug(title: str, requested_slug: str | None) -> str:
    slug = requested_slug.strip().lower() if requested_slug else slugify(title)
    if not slug:
        raise ValueError("title has no ASCII slug; pass --slug explicitly")
    if SLUG_PATTERN.fullmatch(slug) is None:
        raise ValueError("slug must contain lowercase ASCII words separated by hyphens")
    return slug


def resolve_language(title: str, requested_language: str) -> str:
    if requested_language != "auto":
        return requested_language
    if CJK_PATTERN.search(title):
        return "zh"
    return "en"


def resolve_date(requested_date: str | None) -> str:
    if requested_date is None:
        return date.today().isoformat()
    try:
        return date.fromisoformat(requested_date).isoformat()
    except ValueError as error:
        raise ValueError("date must use YYYY-MM-DD form") from error


def find_adr_files(adr_directory: Path) -> list[Path]:
    return sorted(
        path
        for path in adr_directory.glob("*.md")
        if path.name.lower() != "readme.md"
    )


def next_number(adr_files: list[Path]) -> int:
    numbers = []
    for path in adr_files:
        match = ADR_FILENAME_PATTERN.fullmatch(path.name)
        if match is not None:
            numbers.append(int(match.group(1)))
    number = max(numbers, default=0) + 1
    if number > 9999:
        raise ValueError("ADR numbering exceeded 9999")
    return number


def validate_supersedes(adr_files: list[Path], supersedes: str | None) -> str | None:
    if supersedes is None:
        return None
    if re.fullmatch(r"\d{4}", supersedes) is None:
        raise ValueError("supersedes must be a four-digit ADR number")
    matches = [path for path in adr_files if path.name.startswith(f"{supersedes}-")]
    if len(matches) != 1:
        raise ValueError(f"superseded ADR {supersedes} was not found uniquely")
    return supersedes


def bullet_list(values: list[str]) -> str:
    return "\n".join(f"- {value}" for value in values)


def render_adr(args: argparse.Namespace, number: int, language: str) -> str:
    labels = LANGUAGE_LABELS[language]
    supersedes = args.supersedes or labels["none"]
    return (
        f"# {number:04d} — {args.title}\n\n"
        f"- {labels['status']}: {args.status}\n"
        f"- {labels['date']}: {args.decision_date}\n"
        f"- {labels['supersedes']}: {supersedes}\n\n"
        f"## {labels['context']}\n\n{args.context}\n\n"
        f"## {labels['decision']}\n\n{args.decision}\n\n"
        f"## {labels['options']}\n\n{bullet_list(args.option)}\n\n"
        f"## {labels['consequences']}\n\n{bullet_list(args.consequence)}\n"
    )


def create_adr(args: argparse.Namespace) -> Path | None:
    project_root = args.project_root.expanduser().resolve()
    if not project_root.is_dir():
        raise ValueError(f"project root is not a directory: {project_root}")
    adr_directory = resolve_project_path(project_root, args.adr_dir)
    readme_path = adr_directory / "README.md"
    if not readme_path.is_file():
        raise ValueError(f"ADR guide is missing: {readme_path}")
    try:
        readme_path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError as error:
        raise ValueError(f"ADR guide is not valid UTF-8: {readme_path}") from error

    adr_files = find_adr_files(adr_directory)
    args.supersedes = validate_supersedes(adr_files, args.supersedes)
    args.decision_date = resolve_date(args.decision_date)
    language = resolve_language(args.title, args.language)
    slug = resolve_slug(args.title, args.slug)
    number = next_number(adr_files)
    output_path = adr_directory / f"{number:04d}-{slug}.md"
    content = render_adr(args, number, language)

    if args.dry_run:
        print(f"Path: {output_path}")
        print(content, end="")
        return None

    try:
        with output_path.open("x", encoding="utf-8", newline="\n") as output_file:
            output_file.write(content)
    except FileExistsError as error:
        raise ValueError(f"ADR already exists: {output_path}") from error

    return output_path


def main() -> int:
    args = parse_args()
    try:
        output_path = create_adr(args)
    except (OSError, ValueError) as error:
        print(f"Could not create ADR: {error}", file=sys.stderr)
        return 1

    if output_path is not None:
        print(f"Created ADR: {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
