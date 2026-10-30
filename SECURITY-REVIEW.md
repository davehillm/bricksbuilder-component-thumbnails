# Final release review

Review date: 30 October 2026. Release: 1.1.2.

This is a point-in-time review of a one-off community release. The project is not actively maintained. No ongoing security fixes or compatibility updates are promised.

## Scope

- PHP request authorization, nonces, permissions, input validation, source-image access, encrypted storage, thumbnail writes, cleanup, and uninstall handling.
- JavaScript/TypeScript request handling and DOM insertion paths.
- Tracked repository files, reachable Git history, and release archives for secrets and previously identified site-specific code names.
- Dependency advisories, build checks, tests, and the installable ZIP inventory.

## Automated checks

- Semgrep Community Edition 1.157.0: PHP, JavaScript, and TypeScript rule sets; 97 rules ran against 18 source targets, with no parser errors.
- Gitleaks 8.30.1: no detected credentials in the scanned history and release files.
- npm audit: no known dependency vulnerabilities reported by the advisory service at review time.
- Type checking, formatting, 21 TypeScript tests, and 82 isolated PHP scenarios passed.
- Live capture checks include closed and open nested FAQ instances, multiple captures in one composition, and a tightly fitted Image Feature. Browser test storage was isolated so existing site compositions were not overwritten.
- The 11 installable runtime files match the tagged source. Optional snippets, screenshots, development dependencies, test fixtures, and local audit files are excluded from the WordPress ZIP.

## Scanner finding reviewed

Semgrep reported `php.lang.security.injection.echoed-request.echoed-request` at the binary response in `Plugin::dispatch()` in `plugin/includes/class-plugin.php`.

This was reviewed as a false positive for this response path. The handler requires an authenticated request, a valid nonce, current page/component permissions, ownership of the requested capture, and permission on its original page. Capture bytes are validated as PNG before encrypted storage and authenticated during decryption. The response declares `Content-Type: image/png` and `X-Content-Type-Options: nosniff`; it is not an HTML response. HTML-escaping these binary bytes would corrupt the image. The finding is documented rather than hidden with a blanket scanner exclusion.

No confirmed exploitable issue was identified in the reviewed paths. A clean scan does not establish the absence of vulnerabilities.

## Automatic checks after release

The repository now runs a required **Security scan** check on pull requests and updates to `main`, with a manual run option. Semgrep 1.183.0 is pinned by container digest. The community PHP, browser JavaScript, general JavaScript, and TypeScript security rules are pinned to an immutable revision and checked by content hash. Source code stays in the GitHub runner; no Semgrep account is used and telemetry is disabled.

The scan covers first-party runtime source, build scripts, the optional PHP snippet, and its extracted JavaScript. The generated editor bundle is excluded because its first-party source is scanned directly; bundled dependency advisories are covered separately by Dependabot alerts.

Eleven findings in the unchanged source were reviewed: the authenticated PNG response described above, fixed interface markup with bundled CSS, and internal SVG icon templates. The exact rule, file, location, full source hash, scanner version, and rule-set hash are recorded in `.github/security/reviewed-findings.json`. These are narrow, content-bound review records, not global rule exclusions. Changes invalidate the corresponding records. New findings, scanner failures, and parser errors fail the check. Accepted findings are counted in the job summary; remaining findings are uploaded to GitHub code scanning on trusted branches.

Every scan first verifies that the rules detect deliberately unsafe PHP, JavaScript, and TypeScript probes. Separate tests verify that source changes, moved findings, and scanner or rule changes invalidate review records. These probes are created temporarily by the check and are not shipped with the plugin.

This repository automation does not alter the immutable v1.1.2 download or add an ongoing maintenance commitment.

## Publishing safeguards

The final release has immutable assets and a locked tag, GitHub release attestation, and SHA-256 checksums. Secret scanning and push protection are enabled. The Actions workflow uses pinned action commits, read-only permissions, and no persisted checkout credentials. The repository remains available to download and fork.

Automatic update proposals are not enabled for this frozen release: nobody is committed to reviewing, rebuilding, testing, and publishing them. Archiving and automated scan results do not provide ongoing security maintenance.

## Limits

The live integration was checked against Bricks 2.4.4, WordPress 7.1.4, and PHP 8.3. PHP test scenarios use WordPress test doubles. This review is not an independent penetration test, a certification, or evidence of compatibility with every hosting environment or plugin combination.

The GPL-2.0-or-later license and the bundled dependency's MIT notice are retained. The release review does not change their permissions or add a resale restriction.
