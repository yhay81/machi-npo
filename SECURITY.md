# Security

Security reports can be filed privately through GitHub's security advisory feature for `yhay81/machi-npo`.

- The telemetry endpoint accepts same-origin JSON POST requests only and size-limits request bodies.
- Telemetry event names are allowlisted; prefectures, queries, activity fields, and organization IDs are absent from its schema.
- Official organization data is a static asset with no runtime upstream dependency.
- Search, filter, and shortlist state remain in the browser; the shortlist is bounded to 12 organizations.
- DOM additions use `textContent`; no public-data value is interpreted as markup or code.
- Content Security Policy blocks third-party scripts, framing, and unnecessary browser capabilities.
