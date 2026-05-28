# ShopReturnGifts — Deferred: WAF + CloudWatch Implementation Prompt

**Status:** Deferred from initial security hardening (April 2026)  
**Prerequisites:** Base `template.yaml` security hardening must be deployed first  
**Estimated Cost:** ~$9–$10/month (WAF) + $0 (CloudWatch, free tier)

---

## Context

ShopReturnGifts runs on AWS SAM with:
- API Gateway (REST) backed by a single Go Lambda (`shopreturngifts-api-${Stage}`)
- CloudFront distribution (`FrontendDistribution`) serving the React frontend from S3
- DynamoDB single-table (`shopreturngifts-${Stage}`)
- Cognito User Pool for authentication

The `template.yaml` SAM template at the repo root defines all infrastructure.  
The backend is in `backend/` (Go 1.22, Chi router, Lambda arm64).

---

## Task 1 — AWS WAF WebACL

Add a WAF WebACL to protect the API Gateway stage.

### Resource: `WAFWebACL`

```yaml
WAFWebACL:
  Type: AWS::WAFv2::WebACL
  Properties:
    Name: !Sub shopreturngifts-waf-${Stage}
    Scope: REGIONAL   # Use CLOUDFRONT if attaching to CloudFront instead
    DefaultAction:
      Allow: {}
    VisibilityConfig:
      SampledRequestsEnabled: true
      CloudWatchMetricsEnabled: true
      MetricName: !Sub shopreturngifts-waf-${Stage}
    Rules:
      # 1. AWS Managed — Core Rule Set (OWASP Top 10, SQLi, XSS)
      - Name: AWSManagedRulesCoreRuleSet
        Priority: 0
        OverrideAction:
          None: {}
        Statement:
          ManagedRuleGroupStatement:
            VendorName: AWS
            Name: AWSManagedRulesCoreRuleSet
        VisibilityConfig:
          SampledRequestsEnabled: true
          CloudWatchMetricsEnabled: true
          MetricName: AWSManagedRulesCoreRuleSet

      # 2. AWS Managed — Known Bad Inputs (Log4Shell, SSRF, etc.)
      - Name: AWSManagedRulesKnownBadInputsRuleSet
        Priority: 1
        OverrideAction:
          None: {}
        Statement:
          ManagedRuleGroupStatement:
            VendorName: AWS
            Name: AWSManagedRulesKnownBadInputsRuleSet
        VisibilityConfig:
          SampledRequestsEnabled: true
          CloudWatchMetricsEnabled: true
          MetricName: AWSManagedRulesKnownBadInputsRuleSet

      # 3. IP-based rate limit — 500 requests per 5 minutes per IP (all endpoints)
      - Name: GlobalIPRateLimit
        Priority: 2
        Action:
          Block: {}
        Statement:
          RateBasedStatement:
            Limit: 500
            AggregateKeyType: IP
        VisibilityConfig:
          SampledRequestsEnabled: true
          CloudWatchMetricsEnabled: true
          MetricName: GlobalIPRateLimit

      # 4. Tighter rate limit on auth endpoints — 100 requests per 5 minutes per IP
      - Name: AuthPathRateLimit
        Priority: 3
        Action:
          Block: {}
        Statement:
          RateBasedStatement:
            Limit: 100
            AggregateKeyType: IP
            ScopeDownStatement:
              ByteMatchStatement:
                FieldToMatch:
                  UriPath: {}
                PositionalConstraint: STARTS_WITH
                SearchString: /api/auth/
                TextTransformations:
                  - Priority: 0
                    Type: LOWERCASE
        VisibilityConfig:
          SampledRequestsEnabled: true
          CloudWatchMetricsEnabled: true
          MetricName: AuthPathRateLimit
```

### Resource: `WAFAssociation` (attach to API Gateway stage)

```yaml
WAFAssociation:
  Type: AWS::WAFv2::WebACLAssociation
  Properties:
    ResourceArn: !Sub
      - arn:aws:apigateway:${AWS::Region}::/restapis/${ApiId}/stages/${Stage}
      - ApiId: !Ref ApiGateway
    WebACLArn: !GetAtt WAFWebACL.Arn
```

> **Note:** If you want to attach WAF to the CloudFront distribution instead of API Gateway, change `Scope: REGIONAL` → `Scope: CLOUDFRONT` and deploy the stack to `us-east-1`. The `WAFAssociation` resource is not needed for CloudFront — instead set `WebACLId: !GetAtt WAFWebACL.Arn` inside `FrontendDistribution.DistributionConfig`.

---

## Task 2 — CloudWatch Alarms + SNS Notification Topic

Add an SNS topic for alarm notifications and 4 CloudWatch alarms covering the most important failure signals.

### Resource: `AlertTopic`

```yaml
AlertTopic:
  Type: AWS::SNS::Topic
  Properties:
    TopicName: !Sub shopreturngifts-alerts-${Stage}
    Subscription:
      - Protocol: email
        Endpoint: ops@example.com   # ← Replace with actual ops email
```

### Resource: Alarm — 4xx Spike

```yaml
Alarm4xxSpike:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub shopreturngifts-4xx-spike-${Stage}
    AlarmDescription: API Gateway 4xx errors spiking — possible abuse or broken client
    Namespace: AWS/ApiGateway
    MetricName: 4XXError
    Dimensions:
      - Name: ApiName
        Value: !Sub shopreturngifts-${Stage}
    Statistic: Sum
    Period: 300          # 5 minutes
    EvaluationPeriods: 1
    Threshold: 100
    ComparisonOperator: GreaterThanThreshold
    TreatMissingData: notBreaching
    AlarmActions:
      - !Ref AlertTopic
    OKActions:
      - !Ref AlertTopic
```

### Resource: Alarm — Lambda Errors

```yaml
AlarmLambdaErrors:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub shopreturngifts-lambda-errors-${Stage}
    AlarmDescription: Lambda function errors exceeding threshold
    Namespace: AWS/Lambda
    MetricName: Errors
    Dimensions:
      - Name: FunctionName
        Value: !Ref ApiFunction
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 2
    Threshold: 10
    ComparisonOperator: GreaterThanThreshold
    TreatMissingData: notBreaching
    AlarmActions:
      - !Ref AlertTopic
```

### Resource: Alarm — WAF Blocks

```yaml
AlarmWAFBlocks:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub shopreturngifts-waf-blocks-${Stage}
    AlarmDescription: WAF blocking elevated number of requests — possible attack
    Namespace: AWS/WAFV2
    MetricName: BlockedRequests
    Dimensions:
      - Name: WebACL
        Value: !Sub shopreturngifts-waf-${Stage}
      - Name: Region
        Value: !Ref AWS::Region
      - Name: Rule
        Value: ALL
    Statistic: Sum
    Period: 300
    EvaluationPeriods: 1
    Threshold: 50
    ComparisonOperator: GreaterThanThreshold
    TreatMissingData: notBreaching
    AlarmActions:
      - !Ref AlertTopic
```

### Resource: Alarm — Order Failures (high error rate on order creation)

```yaml
AlarmOrderFailures:
  Type: AWS::CloudWatch::Alarm
  Properties:
    AlarmName: !Sub shopreturngifts-order-failures-${Stage}
    AlarmDescription: High 5xx rate on API — possible payment processing or DB issue
    Namespace: AWS/ApiGateway
    MetricName: 5XXError
    Dimensions:
      - Name: ApiName
        Value: !Sub shopreturngifts-${Stage}
    Statistic: Sum
    Period: 60
    EvaluationPeriods: 3
    Threshold: 5
    ComparisonOperator: GreaterThanThreshold
    TreatMissingData: notBreaching
    AlarmActions:
      - !Ref AlertTopic
```

---

## Implementation Checklist

When ready to implement, ask Copilot:

> "Implement the WAF and CloudWatch alarms from `prompts/WAF_CLOUDWATCH_IMPLEMENTATION.md` into `template.yaml`. Add the WAFWebACL, WAFAssociation, AlertTopic, and the 4 CloudWatch alarm resources. Update the Outputs section to include the WAF ARN and SNS topic ARN."

Steps the implementer should follow:
1. Add all resources above to `template.yaml` under `Resources:`
2. Replace `ops@example.com` in `AlertTopic` with a real email address
3. Add outputs:
   ```yaml
   WAFWebACLArn:
     Description: WAF WebACL ARN
     Value: !GetAtt WAFWebACL.Arn
   AlertTopicArn:
     Description: SNS Alert Topic ARN
     Value: !Ref AlertTopic
   ```
4. Run `sam validate --lint`
5. Deploy: `sam deploy --parameter-overrides Stage=prod`
6. Confirm the SNS subscription email

---

## Cost Reference (April 2026 Pricing)

| Resource | Cost |
|---|---|
| WAF WebACL | $5.00/month |
| WAF Rules (4 rules) | $1.00/month each = $4.00/month |
| WAF Requests | $0.60 per 1M requests |
| CloudWatch Alarms (4) | Free tier (first 10 alarms free) |
| SNS email notifications | Free (first 1,000 emails/month free) |
| **Total (low traffic)** | **~$9–10/month** |
