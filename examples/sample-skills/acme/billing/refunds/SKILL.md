---
name: refunds
description: Process customer refund requests following Acme Corp billing policies. Guides agents through eligibility checks, approval workflows, and customer communication.
metadata:
  author: acme-billing-team
  version: "1.0"
---

# Billing Refunds

Process customer refund requests following Acme Corp billing policies.

## When to Use

- Customer requests a refund for a product or service
- Agent needs to evaluate refund eligibility
- Escalation is needed for refunds above threshold

## Process

1. **Verify the customer** — confirm identity and locate the original transaction
2. **Check eligibility** — verify the request falls within the refund window (30 days for products, 14 days for services)
3. **Assess the reason** — categorize as: defective, not as described, changed mind, duplicate charge, or unauthorized
4. **Apply policy rules**:
   - Defective/unauthorized: full refund, no questions
   - Not as described: full refund with return required
   - Changed mind: refund minus 15% restocking fee
   - Duplicate charge: full refund automatically
5. **Check approval thresholds**:
   - Under $100: auto-approve
   - $100–$500: team lead approval
   - Over $500: manager approval
6. **Process and communicate** — issue the refund and send confirmation using the email template

## Templates

See `templates/refund-email-template.md` for the customer communication template.

## Important Notes

- Always log the refund reason for analytics
- Never promise a specific timeline — say "within 5-10 business days"
- If the customer is upset, escalate to a human agent
