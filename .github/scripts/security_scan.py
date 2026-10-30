"""Run pinned, local Semgrep rules and reject every unreviewed finding."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

from ruamel.yaml import YAML


RULE_DIRECTORIES = (
    "php/lang/security",
    "javascript/browser/security",
    "javascript/lang/security",
    "typescript/lang/security",
)
SOURCE_DIRECTORIES = ("src", "plugin", "extras", "scripts")
SNIPPET = "extras/sidebar-component-previews.php"


def prepare_rules(rules_root, output):
    yaml = YAML(typ="safe")
    rules, digests, identifiers = [], {}, set()
    for directory in RULE_DIRECTORIES:
        files = sorted((rules_root / directory).rglob("*.yaml"))
        if not files:
            raise RuntimeError(f"Missing security rules: {directory}")
        for path in files:
            relative = path.relative_to(rules_root).as_posix()
            content = path.read_bytes()
            digests[relative] = hashlib.sha256(content).hexdigest()
            for rule in yaml.load(content)["rules"]:
                rule["id"] = (
                    relative.removesuffix(".yaml").replace("/", ".") + "." + rule["id"]
                )
                if rule["id"] in identifiers:
                    raise RuntimeError("Duplicate security rule identifier")
                identifiers.add(rule["id"])
                rules.append(rule)
    output.write_text(json.dumps({"rules": rules}))
    return hashlib.sha256(
        json.dumps(digests, sort_keys=True).encode()
    ).hexdigest(), len(rules)


def extract_snippet(source, destination):
    text = source.read_text()
    matches = list(
        re.finditer(
            r"<<<'BCT_COMPONENT_PREVIEWS_JS'\n(.*?)\nBCT_COMPONENT_PREVIEWS_JS;",
            text,
            re.S,
        )
    )
    if len(matches) != 1:
        raise RuntimeError(
            "The optional sidebar JavaScript could not be isolated for scanning"
        )
    match = matches[0]
    destination.write_text(match[1])
    return text[: match.start(1)].count("\n")


def scan(scanner, config, targets, output):
    command = [
        scanner,
        "scan",
        "--config",
        str(config),
        "--no-rewrite-rule-ids",
        "--metrics",
        "off",
        "--disable-version-check",
        "--strict",
        "--error",
        "--exclude",
        "plugin/assets/editor.js",
        "--json-output",
        str(output / "raw.json"),
        "--sarif-output",
        str(output / "raw.sarif"),
        *map(str, targets),
    ]
    result = subprocess.run(command, check=False)
    if result.returncode not in (0, 1):
        raise RuntimeError(
            f"Security scanner failed with exit code {result.returncode}"
        )
    report = json.loads((output / "raw.json").read_text())
    if report.get("errors") or not isinstance(report.get("results"), list):
        raise RuntimeError(
            "Security analysis was incomplete or contained parser errors"
        )
    return report, json.loads((output / "raw.sarif").read_text())


def map_generated_locations(value, generated, offset):
    if isinstance(value, dict):
        if value.get("artifactLocation", {}).get("uri") in (
            str(generated),
            generated.as_uri(),
        ):
            value["artifactLocation"]["uri"] = SNIPPET
            region = value.get("region", {})
            for key in ("startLine", "endLine"):
                if key in region:
                    region[key] += offset
        for child in value.values():
            map_generated_locations(child, generated, offset)
    elif isinstance(value, list):
        for child in value:
            map_generated_locations(child, generated, offset)


def finding_key(finding):
    return (
        finding["check_id"],
        finding["path"],
        finding["start"]["line"],
        finding["end"]["line"],
    )


def reviewed_keys(report, review, root, version, rules_digest):
    if review["semgrepVersion"] != version or review["rulesSha256"] != rules_digest:
        return set()
    accepted = set()
    for entry in review["findings"]:
        path = Path(entry["path"])
        if path.is_absolute() or ".." in path.parts or not entry["reason"]:
            raise RuntimeError("Invalid reviewed finding record")
        source = root / path
        if (
            source.is_file()
            and hashlib.sha256(source.read_bytes()).hexdigest() == entry["sourceSha256"]
        ):
            accepted.add(
                (entry["ruleId"], entry["path"], entry["startLine"], entry["endLine"])
            )
    return {finding_key(f) for f in report["results"]} & accepted


def filter_sarif(sarif, accepted):
    for run in sarif["runs"]:
        remaining = []
        for result in run.get("results", []):
            location = result["locations"][0]["physicalLocation"]
            region = location["region"]
            key = (
                result["ruleId"],
                location["artifactLocation"]["uri"],
                region["startLine"],
                region.get("endLine", region["startLine"]),
            )
            if key not in accepted:
                remaining.append(result)
        run["results"] = remaining
    return sarif


def smoke_test(scanner, config, directory):
    targets = []
    for extension, content in (
        ("php", "<?php echo $_GET['value'];"),
        ("js", "eval(window.location.hash);"),
        ("ts", "eval(window.location.hash);"),
    ):
        path = directory / ("unsafe." + extension)
        path.write_text(content)
        targets.append(path)
    report, _ = scan(scanner, config, targets, directory)
    detected = {Path(f["path"]).suffix for f in report["results"]}
    if not {".php", ".js", ".ts"} <= detected:
        raise RuntimeError(
            "Security smoke test failed to detect unsafe PHP, JavaScript, and TypeScript"
        )
    print("Unsafe PHP, JavaScript, and TypeScript probes were detected.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rules-root", required=True, type=Path)
    parser.add_argument("--scanner", default="semgrep")
    parser.add_argument("--output", default="build/security", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "results.sarif").unlink(missing_ok=True)
    root = Path.cwd()
    config = (args.output / "policy.yml").resolve()
    digest, rule_count = prepare_rules(args.rules_root, config)
    version = subprocess.check_output([args.scanner, "--version"], text=True).strip()
    review = json.loads(Path(".github/security/reviewed-findings.json").read_text())
    with tempfile.TemporaryDirectory(prefix="component-security-") as temporary:
        temporary = Path(temporary)
        smoke = temporary / "probes"
        smoke.mkdir()
        smoke_test(args.scanner, config, smoke)
        generated = (temporary / "sidebar-component-previews.js").resolve()
        offset = extract_snippet(Path(SNIPPET), generated)
        report, sarif = scan(
            args.scanner, config, [*SOURCE_DIRECTORIES, generated], args.output
        )
        for finding in report["results"]:
            if Path(finding["path"]).resolve() == generated:
                finding["path"] = SNIPPET
                finding["start"]["line"] += offset
                finding["end"]["line"] += offset
        map_generated_locations(sarif, generated, offset)
        accepted = reviewed_keys(report, review, root, version, digest)
        blocked = [f for f in report["results"] if finding_key(f) not in accepted]
        filtered = filter_sarif(sarif, accepted)
        if sum(len(run.get("results", [])) for run in filtered["runs"]) != len(blocked):
            raise RuntimeError(
                "Security report formats disagree; refusing an incomplete result"
            )
        (args.output / "results.sarif").write_text(json.dumps(filtered))
        summary = f"Security scan: {rule_count} rules, {len(accepted)} exact-source reviewed findings, {len(blocked)} unreviewed findings.\n"
        print(summary)
        if os.environ.get("GITHUB_STEP_SUMMARY"):
            with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as output:
                output.write(summary)
        return int(bool(blocked))


if __name__ == "__main__":
    raise SystemExit(main())
