---
name: pdf-processing
description: Extract text and form data from PDFs, fill PDF forms, and merge multi-page documents. Use whenever the user asks to read, fill, or assemble PDFs.
---

# PDF Processing

Workflow for extracting structured data from PDFs and assembling new ones from
templates and form input.

This skill is distributed as an **archive** (`skill://pdf-processing.tar.gz`)
to demonstrate SEP-2640 archive distribution. The host fetches the archive,
unpacks it with archive-safety checks, and presents files at
`skill://pdf-processing/<file-path>` exactly as if they were served as
individual MCP resources.

## When to use

- **Extract text** — pull plain text from a PDF, preserving page boundaries.
- **Read form fields** — list a PDF's interactive form fields and current values.
- **Fill forms** — given field/value pairs, produce a filled PDF.
- **Merge** — concatenate or interleave pages from multiple PDFs.

## How to use

1. Identify the operation (extract, read-fields, fill, merge).
2. For extract/read-fields: open the input PDF and use the operation's tooling
   to produce the structured output.
3. For fill: validate that all required fields are provided, then write the
   filled PDF.
4. For merge: confirm page ordering and total page count before writing.
5. Always report the output location and any per-page warnings (low OCR
   confidence, missing fields, etc.).

## References

See [`references/FORMS.md`](references/FORMS.md) for the field-naming
conventions used by this skill's tooling.
