# SMS fixtures

Every file here is a test case. `npm test` runs all of them through the parser
(`src/lib/ingest/fixtures.test.ts`), so adding a real message is the best way to teach the
app a new format or catch a regression.

## Layout

```
fixtures/sms/<bank>/<name>.txt     bank: mellat, tejarat, sepah, blu, generic, otp
```

## File format

A header of `# key: value` lines, a line with `---`, then the message body exactly as received.

```
# sender: TejaratBank
# received_at: 2026-09-02T12:12:30+03:30
# expect.type: expense
# expect.amount_rial: 9720000
# expect.occurred_at: 1405/06/11 12:12
# expect.balance_after_rial: 41339000
# expect.min_confidence: 0.9
---
*بانک تجارت*
حساب: 0112233445566
برداشت: 9,720,000 ریال
...
```

| Key                                               | Meaning                                                                           |
| ------------------------------------------------- | --------------------------------------------------------------------------------- |
| `sender`                                          | Sender as the phone shows it                                                      |
| `received_at`                                     | When the phone received it (ISO 8601). Needed for messages whose date has no year |
| `expect.type`                                     | `expense`, `income` or `refund`                                                   |
| `expect.amount_rial`                              | Integer Rial                                                                      |
| `expect.occurred_at`                              | Jalali `YYYY/MM/DD HH:MM`, Tehran time                                            |
| `expect.balance_after_rial`                       | The "مانده" value in Rial                                                         |
| `expect.identifier`                               | Account / (masked) card number as it appears in the text                          |
| `expect.description`                              | Expected description                                                              |
| `expect.bank`                                     | Which bank profile should win                                                     |
| `expect.min_confidence` / `expect.max_confidence` | Bounds; ≥ 0.9 means it will be auto-confirmed (when a card matches)               |
| `expect.parse: false`                             | The message must NOT produce a transaction                                        |
| `expect.otp: true`                                | The message must be detected as a one-time password and discarded                 |

Omit any `expect.*` key you don't care about.

## Anonymizing real messages

Keep everything exactly as received — line breaks, Persian/Arabic/Western digits, `٬` and `,`
separators, `ي`/`ی`, asterisks around the bank name, masks like `6037****1234`. Change only:

- account and card digits (keep the same number of digits and the same masking),
- amounts and balances if you want (keep the separators).

Files named `PLACEHOLDER-*` are invented examples; replace them with real messages when you
have them (Blu in particular).

## Tuning a parser

Bank profiles live in `src/lib/ingest/parsers/profiles.ts` — markers, sender hints and the
keyword list (with `type` and an optional `ambiguous` flag). The shared extractor in
`parsers/extract.ts` handles amounts, balances, identifiers and every date format. To try a
message without writing a fixture:

```bash
npm run parse-sms -- path/to/message.txt          # or pipe text into it
```
