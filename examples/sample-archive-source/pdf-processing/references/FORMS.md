# PDF Form Field Conventions

The pdf-processing skill expects field names to follow these conventions:

- **snake_case** for field identifiers (`first_name`, `policy_number`).
- **Type prefixes** for non-text fields:
  - `chk_` — checkboxes (boolean values: "Yes"/"No" or true/false)
  - `dt_` — dates (ISO 8601: YYYY-MM-DD)
  - `sel_` — single-select dropdowns (string matching one of the field's options)
  - `num_` — numeric fields (integers or decimals; locale-neutral)
- **Required fields** are flagged with a trailing `*` in the source PDF's tooltip but
  appear without it in the field name returned by `read-fields`.

When filling a form, missing required fields produce a warning per field; the
operation still succeeds with whatever was provided. Use the warnings to decide
whether to surface a follow-up to the user.
