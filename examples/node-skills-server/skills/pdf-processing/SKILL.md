---
name: pdf-processing
description: Extract text, form fields, and tables from PDF documents
---

# PDF Processing

Use this skill when the user asks to read, extract, or summarize content from a PDF.

## Choosing an approach

- Plain text extraction: sufficient for most reading/summarization tasks.
- Form fields: see `references/FORMS.md` for the field-extraction workflow — only load
  that reference when the document actually contains fillable form fields.

## General workflow

1. Confirm the file is a real PDF (check the file signature, not just the extension).
2. Extract text page-by-page rather than as one blob, so page references stay accurate.
3. Note any pages that fail to extract (scanned/image-only pages need OCR, out of scope here).
