import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


class GenealogyGraphTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entities = {str(e["id"]): e for e in json.loads((DATA / "entities.json").read_text(encoding="utf-8")) if e.get("type") == "name"}
        cls.people = json.loads((DATA / "genealogy.json").read_text(encoding="utf-8"))["people"]
        cls.report = json.loads((DATA / "genealogy-report.json").read_text(encoding="utf-8"))

    def test_ground_truth_lineages(self):
        self.assertTrue(all(t["passed"] for t in self.report["groundTruthTests"]))
        self.assertEqual([len(t["matches"]) for t in self.report["groundTruthTests"]], [1, 1])
        self.assertEqual(self.report["groundTruthTests"][0]["matches"][0]["id"], 1465)
        self.assertEqual(self.report["groundTruthTests"][1]["matches"][0]["id"], 2904)
        self.assertEqual(self.report["groundTruthTests"][1]["connector"], "بنت")

    def test_search_queries_filter_from_persistent_graph(self):
        def norm(s):
            import re
            s = re.sub(r"[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]", "", s)
            return "".join(s.translate(str.maketrans("أإآٱىئؤة", "ااااييهو")).split())

        def matches(query):
            tokens = [norm(t) for t in query.split() if norm(t) not in {"بن", "بنت", "ابن", "ابنه"}]
            found = []
            for ident, person in self.people.items():
                cur, chain, seen = ident, [], set()
                while cur in self.people and cur not in seen:
                    seen.add(cur)
                    node = self.people[cur]
                    chain.append(norm(node["name"]))
                    if node["fatherId"] is None:
                        break
                    cur = str(node["fatherId"])
                if len(chain) >= len(tokens) and chain[:len(tokens)] == tokens:
                    found.append(int(ident))
            return found

        self.assertEqual(matches("عمر يحيى"), [1465])
        self.assertEqual(matches("عمر بن يحيى إبراهيم"), [1465])
        self.assertEqual(matches("عمر بن يحيى بن إبراهيم"), [1465])
        self.assertEqual(norm("عبد العزيز"), norm("عبدالعزيز"))

    def test_integrity_and_unknowns(self):
        parent_ids = {}
        for ident, person in self.people.items():
            parent = person["fatherId"]
            if parent is not None:
                self.assertIn(str(parent), self.entities)
                self.assertNotEqual(int(ident), int(parent))
                self.assertNotIn(ident, parent_ids)
                parent_ids[ident] = parent
        for ident in self.people:
            seen, cur = set(), ident
            while cur in self.people and self.people[cur]["fatherId"] is not None:
                self.assertNotIn(cur, seen, f"cycle from {ident}")
                seen.add(cur)
                cur = str(self.people[cur]["fatherId"])
        self.assertEqual(self.report["cycles"], [])
        self.assertEqual(self.report["invalidReferences"], [])
        self.assertEqual(self.report["resolvedParents"] + self.report["unresolvedParents"] + self.report["ambiguousParents"], len(self.people))


if __name__ == "__main__":
    unittest.main()
