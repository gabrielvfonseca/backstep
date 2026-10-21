# Security Policy

## Reporting

Report vulnerabilities privately by email to the maintainer rather than in a public issue.

## What explain does with your data

explain keeps copies of up to `maxSamples` elements per step in memory, and renders them into
reports that are printed to the console or passed to your `onReport` function. Keys that look
sensitive (password, token, secret, API key and similar) are redacted by default, but redaction
is name-based. Review the reports before sharing them, and set `redactKeys` for your own field
names. Tracing is off unless `NODE_ENV` is `development` or `test`, or `EXPLAIN=1` is set.
