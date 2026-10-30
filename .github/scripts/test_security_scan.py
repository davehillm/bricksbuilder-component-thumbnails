import hashlib
from pathlib import Path
import tempfile
import unittest

from security_scan import extract_snippet, filter_sarif, finding_key, reviewed_keys


class FindingReviewTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.source = self.root / "response.php"
        self.source.write_text("<?php echo $bytes;\n")
        self.finding = {
            "check_id": "php.echo",
            "path": "response.php",
            "start": {"line": 1},
            "end": {"line": 1},
        }
        self.report = {"results": [self.finding]}
        self.review = {
            "semgrepVersion": "1",
            "rulesSha256": "rules",
            "findings": [
                {
                    "ruleId": "php.echo",
                    "path": "response.php",
                    "startLine": 1,
                    "endLine": 1,
                    "sourceSha256": hashlib.sha256(
                        self.source.read_bytes()
                    ).hexdigest(),
                    "reason": "Reviewed binary response.",
                }
            ],
        }

    def accepted(self, version="1", rules="rules"):
        return reviewed_keys(self.report, self.review, self.root, version, rules)

    def test_review_accepts_only_the_exact_recorded_finding(self):
        self.assertEqual(self.accepted(), {finding_key(self.finding)})
        self.finding["check_id"] = "php.other"
        self.assertEqual(self.accepted(), set())

    def test_any_source_change_requires_review_again(self):
        self.source.write_text("<?php echo $_GET['value'];\n")
        self.assertEqual(self.accepted(), set())

    def test_scanner_or_rule_changes_invalidate_reviews(self):
        self.assertEqual(self.accepted(version="2"), set())
        self.assertEqual(self.accepted(rules="changed"), set())

    def test_moved_findings_are_not_silently_accepted(self):
        self.finding["start"]["line"] = 2
        self.assertEqual(self.accepted(), set())

    def test_sarif_keeps_new_findings_and_removes_only_accepted_ones(self):
        def result(rule):
            return {
                "ruleId": rule,
                "locations": [
                    {
                        "physicalLocation": {
                            "artifactLocation": {"uri": "response.php"},
                            "region": {"startLine": 1, "endLine": 1},
                        }
                    }
                ],
            }

        sarif = {"runs": [{"results": [result("php.echo"), result("php.other")]}]}
        filtered = filter_sarif(sarif, self.accepted())
        self.assertEqual(
            [r["ruleId"] for r in filtered["runs"][0]["results"]], ["php.other"]
        )

    def test_snippet_extraction_fails_if_its_marker_disappears(self):
        destination = self.root / "snippet.js"
        self.source.write_text(
            "<?php $js = <<<'BCT_COMPONENT_PREVIEWS_JS'\neval(location.hash);\nBCT_COMPONENT_PREVIEWS_JS;\n"
        )
        self.assertEqual(extract_snippet(self.source, destination), 1)
        self.assertEqual(destination.read_text(), "eval(location.hash);")
        self.source.write_text("<?php // marker removed\n")
        with self.assertRaises(RuntimeError):
            extract_snippet(self.source, destination)


if __name__ == "__main__":
    unittest.main()
