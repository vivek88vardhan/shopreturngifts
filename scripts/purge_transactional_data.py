#!/usr/bin/env python3
"""
Purge DynamoDB + Cognito while keeping only CONFIG (store settings).

Coverage (everything in the app table except CONFIG + allowlisted admin USER rows):
  - Audit log ........................ PK AUDIT#*
  - In-app notifications ............. PK USER#<id>#NOTIF, SK NOTIF#* (all users, incl. admins)
  - Orders, refunds, rewards, coupons, products, categories, dealers, feedback, redemptions
  - Customer Cognito users + DynamoDB USER# profiles

Not in DynamoDB (clear per-browser after purge):
  - Bell "local" notifications in localStorage key shopreturngifts-inbox-local

Optional: S3 invoices/ prefix (--purge-invoices).

Usage:
  python scripts/purge_transactional_data.py --dry-run
  python scripts/purge_transactional_data.py --confirm PURGE --stack-name shopreturngifts
"""

from __future__ import annotations

import argparse
import sys
from typing import Iterable

import boto3
from boto3.dynamodb.types import TypeDeserializer
from botocore.exceptions import ClientError

# Bump when changing purge logic (printed at startup — check Actions logs).
PURGE_SCRIPT_VERSION = "2026-05-27-v2"

_deserializer = TypeDeserializer()

# Default admin allowlist (override with --keep-email or PURGE_KEEP_EMAILS).
DEFAULT_KEEP_EMAILS = frozenset(
    e.lower()
    for e in (
        "vivek88vardhan@gmail.com",
        "prudhvi.chandra@gmail.com",
        "kvdpavan@live.com",
        "yasodha.ece@gmail.com",
    )
)

# Delete every item whose PK starts with one of these prefixes.
DELETE_PK_PREFIXES = (
    "PRODUCT#",
    "CATEGORY#",
    "COUPON#",
    "DEALER#",
    "ORDER#",
    "REFUND#",
    "AUDIT#",
    "REWARDLEDGER#",
    "REWARDSUMMARY#",
    "COUPONREDEMPTION#",
    "PRODUCTFEEDBACK#",
)

# In-app notifications (customer bell + admin-targeted alerts):
#   PK = USER#<userId>#NOTIF, SK = NOTIF#<notificationId>
NOTIF_PK_SUFFIX = "#NOTIF"
NOTIF_SK_PREFIX = "NOTIF#"
USER_PK_PREFIX = "USER#"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def dynamo_string(value) -> str:
    """Coerce PK/SK/Email from Table resource (str) or low-level client ({'S': '...'})."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        if "S" in value:
            return str(value["S"])
        if len(value) == 1:
            (type_key,) = value.keys()
            if type_key in ("S", "N", "B", "BOOL", "NULL"):
                return str(_deserializer.deserialize(value))
    return ""


_DYNAMO_TYPE_KEYS = frozenset({"S", "N", "B", "BS", "NS", "SS", "BOOL", "NULL", "M", "L"})


def _is_dynamo_typed(value) -> bool:
    if not isinstance(value, dict) or len(value) != 1:
        return False
    return next(iter(value.keys())) in _DYNAMO_TYPE_KEYS


def normalize_item(item: dict) -> dict:
    """Deserialize a scan row if the low-level DynamoDB client format was used."""
    if not item:
        return item
    out: dict = {}
    for key, value in item.items():
        if _is_dynamo_typed(value):
            try:
                out[key] = _deserializer.deserialize(value)
            except Exception:
                out[key] = value
        else:
            out[key] = value
    return out


def item_pk_sk(item: dict) -> tuple[str, str]:
    return dynamo_string(item.get("PK")), dynamo_string(item.get("SK"))


def resolve_stack_outputs(cf, stack_name: str) -> tuple[str, str, str]:
    resp = cf.describe_stacks(StackName=stack_name)
    outputs = {o["OutputKey"]: o["OutputValue"] for o in resp["Stacks"][0]["Outputs"]}
    table = outputs.get("TableName")
    pool = outputs.get("UserPoolId")
    bucket = outputs.get("AssetsBucket")
    if not table or not pool:
        raise RuntimeError(
            f"Stack {stack_name} missing TableName or UserPoolId outputs "
            f"(got keys: {sorted(outputs)})"
        )
    return table, pool, bucket or ""


def item_email(item: dict) -> str | None:
    for key in ("Email", "email"):
        if key not in item:
            continue
        raw = dynamo_string(item[key])
        if raw:
            return normalize_email(raw)
    return None


def is_notification_item(pk: str, sk: str) -> bool:
    return pk.endswith(NOTIF_PK_SUFFIX) or sk.startswith(NOTIF_SK_PREFIX)


def is_admin_profile(item: dict, keep_emails: frozenset[str]) -> bool:
    pk, sk = item_pk_sk(item)
    if not (pk.startswith(USER_PK_PREFIX) and sk.startswith(USER_PK_PREFIX) and pk == sk):
        return False
    email = item_email(item)
    return bool(email and email in keep_emails)


def should_delete_item(item: dict, keep_emails: frozenset[str]) -> tuple[bool, str]:
    pk, sk = item_pk_sk(item)
    if not pk or not sk:
        return False, "missing-keys"

    # Only store settings survive (admin settings page).
    if pk == "CONFIG" and sk == "CONFIG":
        return False, "config"

    if is_admin_profile(item, keep_emails):
        return False, "keep-admin-profile"

    if is_notification_item(pk, sk):
        return True, "notification"

    if pk.startswith("AUDIT#"):
        return True, "audit-log"

    for prefix in DELETE_PK_PREFIXES:
        if pk.startswith(prefix):
            return True, f"txn-prefix:{prefix}"

    if pk.startswith(USER_PK_PREFIX) and sk.startswith(USER_PK_PREFIX) and pk == sk:
        return True, "customer-profile"

    # Catch-all: delete any unknown entity so nothing transactional is left behind.
    return True, "other"


def scan_all_items(table) -> Iterable[dict]:
    """Yield deserialized items (plain str/int fields) via Table resource."""
    last_key = None
    while True:
        kwargs = {}
        if last_key:
            kwargs["ExclusiveStartKey"] = last_key
        resp = table.scan(**kwargs)
        for raw in resp.get("Items", []):
            yield normalize_item(raw)
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break


def batch_delete_keys(table, keys: list[dict[str, str]], dry_run: bool) -> int:
    if dry_run:
        return len(keys)
    deleted = 0
    with table.batch_writer() as batch:
        for key in keys:
            batch.delete_item(Key={"PK": key["PK"], "SK": key["SK"]})
            deleted += 1
    return deleted


def purge_dynamodb(
    table,
    table_name: str,
    keep_emails: frozenset[str],
    dry_run: bool,
) -> dict[str, int]:
    to_delete: list[dict[str, str]] = []
    stats: dict[str, int] = {"scanned": 0, "delete": 0, "kept": 0}
    reasons: dict[str, int] = {}

    for item in scan_all_items(table):
        stats["scanned"] += 1
        delete, reason = should_delete_item(item, keep_emails)
        if delete:
            pk, sk = item_pk_sk(item)
            to_delete.append({"PK": pk, "SK": sk})
            stats["delete"] += 1
            reasons[reason] = reasons.get(reason, 0) + 1
        else:
            stats["kept"] += 1

    print(f"DynamoDB table={table_name} scanned={stats['scanned']} to_delete={stats['delete']}")
    for reason, count in sorted(reasons.items(), key=lambda x: -x[1]):
        print(f"  - {reason}: {count}")

    if to_delete:
        deleted = batch_delete_keys(table, to_delete, dry_run)
        action = "would delete" if dry_run else "deleted"
        print(f"DynamoDB: {action} {deleted} items")

    return stats


def verify_table_clean(table, keep_emails: frozenset[str]) -> None:
    """After live purge, fail if unexpected rows remain."""
    leftovers: list[str] = []
    for item in scan_all_items(table):
        pk, sk = item_pk_sk(item)
        delete, reason = should_delete_item(item, keep_emails)
        if not delete:
            continue
        leftovers.append(f"{pk} | {sk} ({reason})")

    if leftovers:
        print(f"VERIFY FAILED: {len(leftovers)} unexpected row(s) still in table:", file=sys.stderr)
        for line in leftovers[:20]:
            print(f"  {line}", file=sys.stderr)
        if len(leftovers) > 20:
            print(f"  ... and {len(leftovers) - 20} more", file=sys.stderr)
        raise SystemExit(1)

    print("VERIFY OK: table contains only CONFIG and allowlisted admin USER profiles")


def cognito_email(user: dict) -> str | None:
    for attr in user.get("Attributes", []):
        if attr.get("Name") == "email" and attr.get("Value"):
            return normalize_email(attr["Value"])
    return None


def purge_cognito(cognito, pool_id: str, keep_emails: frozenset[str], dry_run: bool) -> dict[str, int]:
    stats = {"listed": 0, "deleted": 0, "kept": 0}
    token = None
    while True:
        kwargs = {"UserPoolId": pool_id, "Limit": 60}
        if token:
            kwargs["PaginationToken"] = token
        resp = cognito.list_users(**kwargs)
        for user in resp.get("Users", []):
            stats["listed"] += 1
            email = cognito_email(user)
            username = user.get("Username", "")
            if email and email in keep_emails:
                stats["kept"] += 1
                print(f"  keep Cognito: {email}")
                continue
            label = email or username
            if dry_run:
                print(f"  would delete Cognito: {label}")
            else:
                cognito.admin_delete_user(UserPoolId=pool_id, Username=username)
                print(f"  deleted Cognito: {label}")
            stats["deleted"] += 1
        token = resp.get("PaginationToken")
        if not token:
            break
    print(
        f"Cognito pool={pool_id} listed={stats['listed']} "
        f"{'would delete' if dry_run else 'deleted'}={stats['deleted']} kept={stats['kept']}"
    )
    return stats


def purge_s3_invoices(s3, bucket: str, dry_run: bool) -> int:
    if not bucket:
        print("S3: no AssetsBucket output; skipping invoices")
        return 0
    prefix = "invoices/"
    count = 0
    paginator = s3.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            count += 1
            if dry_run:
                print(f"  would delete s3://{bucket}/{key}")
            else:
                s3.delete_object(Bucket=bucket, Key=key)
    action = "would delete" if dry_run else "deleted"
    print(f"S3 {action} {count} objects under s3://{bucket}/{prefix}")
    return count


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Purge ShopReturnGifts transactional data")
    p.add_argument("--stack-name", default="shopreturngifts", help="CloudFormation stack name")
    p.add_argument("--table-name", help="DynamoDB table (default: from stack output)")
    p.add_argument("--user-pool-id", help="Cognito pool (default: from stack output)")
    p.add_argument("--assets-bucket", help="S3 assets bucket (default: from stack output)")
    p.add_argument("--region", default="us-east-1")
    p.add_argument(
        "--keep-email",
        action="append",
        dest="keep_emails",
        help="Email to retain (repeatable; merges with defaults)",
    )
    p.add_argument(
        "--confirm",
        help='Required for live run: pass exactly "PURGE"',
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Print actions only; no deletes",
    )
    p.add_argument(
        "--skip-cognito",
        action="store_true",
        help="Only purge DynamoDB (and optional S3)",
    )
    p.add_argument(
        "--skip-dynamodb",
        action="store_true",
        help="Only purge Cognito (and optional S3)",
    )
    p.add_argument(
        "--purge-invoices",
        action="store_true",
        help="Delete s3://<assets-bucket>/invoices/*",
    )
    p.add_argument("--skip-s3", action="store_true", help="Do not touch S3 even if --purge-invoices")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    dry_run = args.dry_run

    if not dry_run and args.confirm != "PURGE":
        print('ERROR: Live run requires --confirm PURGE (or use --dry-run)', file=sys.stderr)
        return 2

    keep = set(DEFAULT_KEEP_EMAILS)
    if args.keep_emails:
        keep.update(normalize_email(e) for e in args.keep_emails)
    keep_frozen = frozenset(keep)

    print(f"Purge script version: {PURGE_SCRIPT_VERSION}")
    print(f"Mode: {'DRY RUN' if dry_run else 'LIVE PURGE'}")
    print(f"Keep emails ({len(keep_frozen)}): {', '.join(sorted(keep_frozen))}")

    session = boto3.Session(region_name=args.region)
    cf = session.client("cloudformation")
    dynamodb = session.resource("dynamodb")
    cognito = session.client("cognito-idp")
    s3 = session.client("s3")

    table = args.table_name
    pool = args.user_pool_id
    bucket = args.assets_bucket or ""
    if not table or not pool:
        try:
            t, p, b = resolve_stack_outputs(cf, args.stack_name)
            table = table or t
            pool = pool or p
            bucket = bucket or b
        except ClientError as e:
            print(f"ERROR: Could not read stack {args.stack_name}: {e}", file=sys.stderr)
            return 1

    print(f"Stack: {args.stack_name}")
    print(f"Table: {table}")
    print(f"User pool: {pool}")
    if bucket:
        print(f"Assets bucket: {bucket}")

    if not args.skip_dynamodb:
        ddb_table = dynamodb.Table(table)
        purge_dynamodb(ddb_table, table, keep_frozen, dry_run)
        if not dry_run:
            verify_table_clean(ddb_table, keep_frozen)

    if not args.skip_cognito:
        purge_cognito(cognito, pool, keep_frozen, dry_run)

    if args.purge_invoices and not args.skip_s3:
        purge_s3_invoices(s3, bucket, dry_run)

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
