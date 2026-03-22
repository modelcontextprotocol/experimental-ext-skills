# Code Review Checklist

## Correctness
- [ ] Logic matches the stated intent
- [ ] Edge cases handled (null, empty, boundary values)
- [ ] Error paths return meaningful messages
- [ ] Async operations properly awaited
- [ ] Resources cleaned up (connections, file handles, timers)

## Security
- [ ] User input validated and sanitized
- [ ] No SQL injection, XSS, or command injection vectors
- [ ] No hardcoded secrets or credentials
- [ ] Authentication/authorization checks in place
- [ ] Sensitive data not logged or exposed in errors

## Readability
- [ ] Names describe purpose (not implementation)
- [ ] Functions do one thing
- [ ] No deeply nested conditionals (max 3 levels)
- [ ] Comments explain "why", not "what"
- [ ] Consistent formatting with project style

## Maintainability
- [ ] No code duplication (DRY where appropriate)
- [ ] Dependencies are justified
- [ ] Configuration externalized (not hardcoded)
- [ ] Backward compatibility considered
- [ ] Migration path documented if breaking

## Testing
- [ ] Tests exist for new/changed behavior
- [ ] Tests cover happy path and error cases
- [ ] Tests are independent (no shared mutable state)
- [ ] Test names describe the scenario
- [ ] No flaky tests (timing, ordering, external dependencies)
