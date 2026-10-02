#!/usr/bin/env python3
"""Merge a Wongnai/FoodStory customer-review CSV into dashboard JSON."""

import csv
import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "api" / "_rating-feedback-data.json"

BRANCH_ALIASES = {
    "ซอยสุขุมวิท 31": "สุขุมวิท 31",
    "วงเวียนใหญ่ (Wongwian Yai)": "วงเวียนใหญ่",
    "สาทร (Sathon)": "สาทร",
    "เพชรเกษม": "เพชรเกษม48",
    "แจ้งวัฒนะ ปากเกร็ด 36": "แจ้งวัฒนะ - ปากเกร็ด 36",
}


def brand_for(store_name):
    prefixes = (
        ("คุ้มสึ", "คุ้มสึ"),
        ("ไก่ทอดแอนโทนี่", "ไก่ทอดแอนโทนี่"),
        ("หมีปุ้ง", "หมีปุ้ง หมูปิ้งโบราณ"),
        ("โซ้ย นู้ดเดิ้ล", "โซ้ย นู้ดเดิ้ล"),
        ("ข่า ตะไคร้ ใบมะกรูด", "ข่า ตะไคร้ ใบมะกรูด(อาหารใต้)"),
        ("นัว นัว สุกี้แห้ง", "นัว นัว สุกี้แห้ง"),
    )
    for prefix, brand in prefixes:
        if store_name.startswith(prefix):
            return brand
    raise ValueError(f"ไม่รู้จักแบรนด์: {store_name}")


def branch_for(store_id, store_name, known_stores):
    if store_id in known_stores:
        return known_stores[store_id]
    branch = store_name.rsplit(" - ", 1)[-1].strip()
    return BRANCH_ALIASES.get(branch, branch)


def normalized_date(value):
    parsed = datetime.strptime(value.strip(), "%d %b %Y %H:%M GMT+07")
    return parsed.strftime("%Y-%m-%dT%H:%M")


def fingerprint(record):
    fields = (
        record["storeId"],
        record["date"],
        record["review"],
        record["customer"],
        str(record["rating"]),
    )
    return "\x1f".join(fields)


def main(csv_path):
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    known_stores = {record["storeId"]: record["branch"] for record in data["records"]}
    existing = {fingerprint(record) for record in data["records"]}
    master_branches = set(data["masterBranches"])
    imported = []
    skipped = 0

    with Path(csv_path).open(encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            store_id = row["รหัสร้านค้า"].strip()
            store_name = row["ร้าน"].strip()
            date = normalized_date(row["วันที่"])
            branch = branch_for(store_id, store_name, known_stores)
            if branch not in master_branches:
                raise ValueError(f"สาขาไม่อยู่ใน masterBranches: {branch} ({store_name})")
            record = {
                "id": "",
                "storeId": store_id,
                "storeName": store_name,
                "brand": brand_for(store_name),
                "branch": branch,
                "review": row["รีวิว"].strip(),
                "serviceType": row["ประเภทบริการ"].strip(),
                "rating": int(row["เรตติ้ง"]),
                "reply": row["ตอบกลับ"].strip(),
                "customer": row["ลูกค้า"].strip(),
                "visibility": row["ประเภท"].strip(),
                "date": date,
                "region": "weekly_2026_10_01",
            }
            key = fingerprint(record)
            if key in existing:
                skipped += 1
                continue
            digest = hashlib.sha256(key.encode("utf-8")).hexdigest()[:12]
            record["id"] = f"{store_id}::{date}::{digest}"
            existing.add(key)
            known_stores[store_id] = branch
            imported.append(record)

    data["records"] = sorted(
        [*imported, *data["records"]], key=lambda item: item["date"], reverse=True
    )
    DATA_PATH.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )
    print(f"imported={len(imported)} skipped={skipped} total={len(data['records'])}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("usage: import-rating-feedback.py <reviews.csv>")
    main(sys.argv[1])
