#!/usr/bin/env bash
# Remove a CloudFormation stack stuck in DELETE_FAILED (e.g. shopreturngifts-prod).
# Run locally with AWS credentials: bash scripts/cleanup-failed-stack.sh [stack-name]
set -euo pipefail

STACK="${1:-shopreturngifts-prod}"
REGION="${AWS_REGION:-us-east-1}"
STAGE="${STAGE:-prod}"

echo "=== Stack status: $STACK ($REGION) ==="
STATUS=$(aws cloudformation describe-stacks \
  --stack-name "$STACK" \
  --region "$REGION" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo NOT_FOUND)
echo "Status: $STATUS"

if [ "$STATUS" = "NOT_FOUND" ]; then
  echo "Stack not found — nothing to clean up."
  exit 0
fi

echo
echo "=== Recent DELETE_FAILED events ==="
aws cloudformation describe-stack-events \
  --stack-name "$STACK" \
  --region "$REGION" \
  --max-items 30 \
  --query 'StackEvents[?contains(ResourceStatus, `FAILED`) || contains(ResourceStatus, `DELETE`)].[Timestamp,LogicalResourceId,ResourceType,ResourceStatus,ResourceStatusReason]' \
  --output table 2>/dev/null || true

echo
echo "=== Remaining stack resources ==="
aws cloudformation list-stack-resources \
  --stack-name "$STACK" \
  --region "$REGION" \
  --query 'StackResourceSummaries[].[LogicalResourceId,ResourceType,ResourceStatus]' \
  --output table 2>/dev/null || true

empty_bucket() {
  local bucket="$1"
  if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
    echo "Emptying s3://$bucket ..."
    aws s3 rm "s3://${bucket}" --recursive || true
    aws s3 rb "s3://${bucket}" --force 2>/dev/null || true
  fi
}

echo
echo "=== Emptying S3 buckets tagged to this stack ==="
for bucket in $(aws resourcegroupstaggingapi get-resources \
  --resource-type-filters "s3:bucket" \
  --tag-filters "Key=aws:cloudformation:stack-name,Values=$STACK" \
  --region "$REGION" \
  --query 'ResourceTagMappingList[].ResourceARN' \
  --output text 2>/dev/null | sed 's|.*:::||g'); do
  [ -n "$bucket" ] && empty_bucket "$bucket"
done

# Fallback: buckets from stack resource list
for bucket in $(aws cloudformation list-stack-resources \
  --stack-name "$STACK" \
  --region "$REGION" \
  --query "StackResourceSummaries[?ResourceType=='AWS::S3::Bucket'].PhysicalResourceId" \
  --output text 2>/dev/null); do
  [ -n "$bucket" ] && empty_bucket "$bucket"
done

echo
echo "=== Deleting named Lambda functions (Stage=$STAGE) ==="
for FN in "shopreturngifts-api-${STAGE}" "shopreturngifts-email-worker-${STAGE}" "shopreturngifts-cognito-message-${STAGE}"; do
  if aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1; then
    echo "Deleting Lambda $FN ..."
    aws lambda delete-function --function-name "$FN" --region "$REGION" || true
  fi
done

echo
echo "=== Deleting API Gateway custom domain (if present) ==="
API_DOMAIN="${API_DOMAIN_NAME:-api.shopreturngifts.com}"
if aws apigateway get-domain-name --domain-name "$API_DOMAIN" --region "$REGION" >/dev/null 2>&1; then
  echo "Deleting API Gateway domain $API_DOMAIN ..."
  aws apigateway delete-domain-name --domain-name "$API_DOMAIN" --region "$REGION" || true
fi

echo
echo "=== Disabling CloudFront distributions from this stack ==="
for dist_id in $(aws resourcegroupstaggingapi get-resources \
  --resource-type-filters "cloudfront:distribution" \
  --tag-filters "Key=aws:cloudformation:stack-name,Values=$STACK" \
  --query 'ResourceTagMappingList[].ResourceARN' \
  --output text 2>/dev/null | grep -oE 'distribution/[A-Z0-9]+' | cut -d/ -f2); do
  echo "Disabling CloudFront $dist_id ..."
  ETAG=$(aws cloudfront get-distribution-config --id "$dist_id" --query ETag --output text)
  aws cloudfront get-distribution-config --id "$dist_id" --query 'DistributionConfig' --output json \
    | python3 -c "import sys,json; c=json.load(sys.stdin); c['Enabled']=False; print(json.dumps(c))" \
    > /tmp/cf-config.json
  aws cloudfront update-distribution --id "$dist_id" --if-match "$ETAG" \
    --distribution-config file:///tmp/cf-config.json >/dev/null 2>&1 || true
  echo "Waiting for CloudFront $dist_id to deploy (may take several minutes) ..."
  aws cloudfront wait distribution-deployed --id "$dist_id" 2>/dev/null || sleep 60
  aws cloudformation delete-stack --stack-name "$STACK" --region "$REGION" 2>/dev/null || true
done

echo
echo "=== Retrying stack delete: $STACK ==="
aws cloudformation delete-stack --stack-name "$STACK" --region "$REGION"
echo "Waiting for delete to complete (timeout 20 min) ..."
if aws cloudformation wait stack-delete-complete --stack-name "$STACK" --region "$REGION" 2>/dev/null; then
  echo "Stack $STACK deleted successfully."
else
  echo
  echo "Delete still in progress or failed. Check events:"
  echo "  aws cloudformation describe-stack-events --stack-name $STACK --region $REGION --output table"
  echo
  echo "DynamoDB tables use DeletionPolicy: Retain — delete manually if needed:"
  echo "  aws dynamodb list-tables --region $REGION | grep shopreturngifts"
  exit 1
fi

echo
echo "=== Verify Lambdas are gone ==="
for FN in "shopreturngifts-api-${STAGE}" "shopreturngifts-email-worker-${STAGE}" "shopreturngifts-cognito-message-${STAGE}"; do
  aws lambda get-function --function-name "$FN" --region "$REGION" >/dev/null 2>&1 \
    && echo "WARN: $FN still exists" || echo "OK: $FN gone"
done

echo "Done. Re-run GitHub Actions deploy."
