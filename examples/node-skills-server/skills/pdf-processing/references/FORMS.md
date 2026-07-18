# Extracting Form Fields

Load this reference only when `SKILL.md` determines the document has fillable form fields.

1. Enumerate form fields (name, type, current value) before attempting to read or fill any of them.
2. Preserve field order as it appears in the document's field dictionary — visual layout order
   can differ and is not reliable for programmatic access.
3. When filling fields, validate each value against the field's declared type (text, checkbox,
   radio, choice) before writing it back.
