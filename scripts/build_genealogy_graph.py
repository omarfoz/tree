#!/usr/bin/env python3
"""Build the static genealogy graph from explicitly verified visual relations.

This deliberately does not infer edges from entity coordinates. New relations
must first be verified from the source artwork and added to verified-relations.json.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"


def read(name):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def write(name, value):
    (DATA / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize(value):
    import re
    value = re.sub(r"[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]", "", value or "")
    value = value.translate(str.maketrans("أإآٱىئؤة", "ااااييهو"))
    return "".join(value.split())


def lineage(start, people):
    chain, seen, current = [], set(), str(start)
    while current in people and current not in seen:
        seen.add(current)
        item = people[current]
        chain.append(item)
        parent = item.get("fatherId")
        if parent is None:
            break
        current = str(parent)
    return chain


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    entities = {str(e["id"]): e for e in read("entities.json") if e.get("type") == "name"}
    source = read("verified-relations.json")
    gender_data = read("verified-gender.json").get("people", {})
    parent_by_child = {}
    conflicts = []
    invalid = []
    for rel in source.get("relations", []):
        if rel.get("status") != "verified":
            continue
        child, parent = str(rel.get("childId")), str(rel.get("parentId"))
        if child not in entities or parent not in entities or child == parent:
            invalid.append({"childId": child, "parentId": parent, "reason": "invalid or self reference"})
            continue
        if child in parent_by_child and parent_by_child[child]["parentId"] != parent:
            conflicts.append({"childId": child, "parentIds": [parent_by_child[child]["parentId"], parent]})
            continue
        parent_by_child[child] = {"parentId": parent, "source": rel.get("source", "verified-relations.json"), "note": rel.get("note", "")}

    people = {}
    for ident, entity in entities.items():
        relation = parent_by_child.get(ident)
        people[ident] = {
            "id": int(ident), "name": entity["text"],
            "fatherId": int(relation["parentId"]) if relation else None,
            "status": "verified" if relation else "unresolved",
            "confidence": 1.0 if relation else None,
            "source": relation["source"] if relation else None,
            "evidence": {"note": relation["note"], "branchPath": None} if relation else None,
        }
        gender = gender_data.get(ident)
        if gender and gender.get("gender") in ("female", "male"):
            people[ident]["gender"] = gender["gender"]
            people[ident]["genderSource"] = gender.get("source")

    # Cycle audit; verified edges in a cycle are downgraded to unresolved.
    cycles, cycle_nodes = [], set()
    for ident in people:
        seen, path, cur = set(), [], ident
        while cur in people and cur not in seen:
            seen.add(cur); path.append(cur)
            parent = people[cur]["fatherId"]
            if parent is None:
                cur = None
                break
            cur = str(parent)
        if cur is not None and cur in seen and cur in path:
            cycle = path[path.index(cur):]
            if cycle:
                key = tuple(sorted(cycle))
                if key not in [tuple(sorted(c)) for c in cycles]:
                    cycles.append(cycle)
                cycle_nodes.update(cycle)
    for ident in cycle_nodes:
        people[ident].update(fatherId=None, status="ambiguous", confidence=None)

    test_specs = [
        (["عمر", "يحيى", "إبراهيم", "يحيى", "محمد"], "عمر بن يحيى بن إبراهيم بن يحيى بن محمد"),
        (["سلمى", "دباس", "عبدالعزيز", "حمد", "فارس"], "سلمى بنت دباس بن عبدالعزيز بن حمد بن فارس"),
    ]
    tests = []
    for expected, display in test_specs:
        matches = []
        for ident, person in people.items():
            chain = lineage(ident, people)
            if len(chain) >= len(expected) and all(normalize(chain[i]["name"]) == normalize(name) for i, name in enumerate(expected)):
                matches.append({"id": int(ident), "lineage": " ".join(p["name"] for p in chain[:len(expected)])})
        tests.append({"expected": display, "matches": matches, "passed": bool(matches), "connector": "بنت" if matches and people[str(matches[0]["id"])].get("gender") == "female" else "بن"})

    generated = datetime.now(timezone.utc).isoformat()
    write("genealogy.json", {"version": 1, "generatedAt": generated, "source": "data/verified-relations.json; explicitly verified visual relations only", "people": people})
    unresolved = []
    for ident, entity in entities.items():
        if people[ident]["status"] == "verified":
            continue
        x, y, w, h = (int(entity.get(k, 0)) for k in ("x", "y", "w", "h"))
        unresolved.append({"childId": int(ident), "childName": entity["text"], "coordinates": {"x": x, "y": y}, "possibleCandidates": [], "reason": "No explicit verified visual branch relation is present. Coordinates are not used to infer parentage.", "confidence": 0, "cropBoundingBox": {"x": max(0, x-120), "y": max(0, y-120), "w": w+240, "h": h+240}, "graphPathEvidence": None})
    write("genealogy-review.json", {"version": 1, "generatedAt": generated, "reviewPolicy": "No proximity-based candidate generation", "unresolved": unresolved, "ambiguous": [{"childId": int(i), "reason": "Conflicting verified parent records"} for i in {c["childId"] for c in conflicts}]})
    statuses = Counter(p["status"] for p in people.values())
    write("genealogy-report.json", {
        "generatedAt": generated, "totalNameEntities": len(people), "resolvedParents": statuses["verified"],
        "unresolvedParents": statuses["unresolved"], "ambiguousParents": statuses["ambiguous"],
        "coveragePercent": round(100 * statuses["verified"] / len(people), 3) if people else 0,
        "confidenceDistribution": {"1.0": statuses["verified"], "unknown": statuses["unresolved"] + statuses["ambiguous"]},
        "cycles": cycles, "invalidReferences": invalid, "conflictingParents": conflicts,
        "groundTruthTests": tests,
        "visualPathExtraction": {"performed": False, "reason": "The captured artwork is embedded as OpenSeadragon WebP tiles, but the existing verified relation records contain no traced branch polylines or graph nodes. No branch paths were fabricated."},
    })
    print(json.dumps({"totalNameEntities": len(people), "verifiedParents": statuses["verified"], "coveragePercent": round(100*statuses["verified"]/len(people), 3), "groundTruthTests": tests}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
