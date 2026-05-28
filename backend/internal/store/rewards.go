package store

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dyntypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"

	"shopreturngifts-api/internal/models"
)

// ─── Key helpers ───

func rewardLedgerPK(userID string) string  { return "REWARDLEDGER#" + userID }
func rewardSummaryPK(userID string) string { return "REWARDSUMMARY#" + userID }

func newLedgerEntryID() string { return uuid.New().String() }

// ─── Ledger CRUD ───

// PutRewardLedgerEntry inserts a new ledger entry. Caller is responsible
// for setting Type, Status, Points, and CreatedAt.
func (db *DynamoDB) PutRewardLedgerEntry(ctx context.Context, e *models.RewardLedgerEntry) error {
	if strings.TrimSpace(e.UserID) == "" {
		return fmt.Errorf("ledger entry missing userId")
	}
	if strings.TrimSpace(e.EntryID) == "" {
		e.EntryID = newLedgerEntryID()
	}
	if strings.TrimSpace(e.CreatedAt) == "" {
		e.CreatedAt = now()
	}
	if strings.TrimSpace(e.UpdatedAt) == "" {
		e.UpdatedAt = e.CreatedAt
	}

	item, err := attributevalue.MarshalMap(e)
	if err != nil {
		return err
	}
	item["PK"] = &dyntypes.AttributeValueMemberS{Value: rewardLedgerPK(e.UserID)}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: e.CreatedAt + "#" + e.EntryID}
	// Explicit id for reads (older rows may only have the id embedded in SK).
	item["EntryId"] = &dyntypes.AttributeValueMemberS{Value: e.EntryID}
	// GSI1 lets us scan all earn entries pending eligibility across users.
	item["GSI1PK"] = &dyntypes.AttributeValueMemberS{Value: "REWARDLEDGER#" + e.Status}
	item["GSI1SK"] = &dyntypes.AttributeValueMemberS{Value: e.EligibleAt + "#" + e.EntryID}

	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

// parseLedgerSortKey splits the table range key "<createdAt>#<entryId>".
func parseLedgerSortKey(sk string) (createdAt, entryID string) {
	i := strings.LastIndex(sk, "#")
	if i <= 0 || i >= len(sk)-1 {
		return "", ""
	}
	return sk[:i], sk[i+1:]
}

func enrichLedgerEntryFromSK(sk string, e *models.RewardLedgerEntry) {
	cAt, eID := parseLedgerSortKey(sk)
	if eID != "" {
		e.EntryID = eID
	}
	if cAt != "" {
		e.CreatedAt = cAt
	}
}

func unmarshalRewardLedgerItems(items []map[string]dyntypes.AttributeValue) ([]models.RewardLedgerEntry, error) {
	out := make([]models.RewardLedgerEntry, 0, len(items))
	for _, item := range items {
		var e models.RewardLedgerEntry
		if err := attributevalue.UnmarshalMap(item, &e); err != nil {
			return nil, err
		}
		if skAv, ok := item["SK"].(*dyntypes.AttributeValueMemberS); ok {
			enrichLedgerEntryFromSK(skAv.Value, &e)
		}
		out = append(out, e)
	}
	return out, nil
}

// GetRewardLedger returns recent ledger entries for a user, newest first.
func (db *DynamoDB) GetRewardLedger(ctx context.Context, userID string, limit int32) ([]models.RewardLedgerEntry, error) {
	if limit <= 0 {
		limit = 50
	}
	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		KeyConditionExpression: aws.String("PK = :pk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: rewardLedgerPK(userID)},
		},
		ScanIndexForward: aws.Bool(false),
		Limit:            aws.Int32(limit),
	})
	if err != nil {
		return nil, err
	}
	return unmarshalRewardLedgerItems(out.Items)
}

// GetRewardLedgerEntry fetches a single entry by user + composite SK.
func (db *DynamoDB) GetRewardLedgerEntry(ctx context.Context, userID, createdAt, entryID string) (*models.RewardLedgerEntry, error) {
	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: rewardLedgerPK(userID)},
			"SK": &dyntypes.AttributeValueMemberS{Value: createdAt + "#" + entryID},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, fmt.Errorf("ledger entry not found")
	}
	var entry models.RewardLedgerEntry
	if err := attributevalue.UnmarshalMap(out.Item, &entry); err != nil {
		return nil, err
	}
	if skAv, ok := out.Item["SK"].(*dyntypes.AttributeValueMemberS); ok {
		enrichLedgerEntryFromSK(skAv.Value, &entry)
	}
	return &entry, nil
}

// UpdateRewardLedgerStatus flips a ledger entry's status (e.g. pending → available
// or pending → reversed) and keeps the GSI1PK in sync.
func (db *DynamoDB) UpdateRewardLedgerStatus(ctx context.Context, userID, createdAt, entryID, newStatus string) error {
	_, err := db.Client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: rewardLedgerPK(userID)},
			"SK": &dyntypes.AttributeValueMemberS{Value: createdAt + "#" + entryID},
		},
		UpdateExpression: aws.String("SET #s = :s, GSI1PK = :gsi, UpdatedAt = :u"),
		ExpressionAttributeNames: map[string]string{
			"#s": "Status",
		},
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":s":   &dyntypes.AttributeValueMemberS{Value: newStatus},
			":gsi": &dyntypes.AttributeValueMemberS{Value: "REWARDLEDGER#" + newStatus},
			":u":   &dyntypes.AttributeValueMemberS{Value: now()},
		},
	})
	return err
}

// QueryPendingRewardEntries returns all pending earn entries whose EligibleAt
// is at or before the given cutoff. Used by the sweep job.
func (db *DynamoDB) QueryPendingRewardEntries(ctx context.Context, cutoff time.Time, limit int32) ([]models.RewardLedgerEntry, error) {
	if limit <= 0 {
		limit = 100
	}
	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		IndexName:              aws.String("GSI1"),
		KeyConditionExpression: aws.String("GSI1PK = :pk AND GSI1SK <= :sk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: "REWARDLEDGER#pending"},
			// Composite SK is "<eligibleAt>#<entryId>"; the "~" suffix
			// makes the comparison inclusive of any entryId on the cutoff.
			":sk": &dyntypes.AttributeValueMemberS{Value: cutoff.UTC().Format(time.RFC3339) + "#~"},
		},
		Limit: aws.Int32(limit),
	})
	if err != nil {
		return nil, err
	}
	return unmarshalRewardLedgerItems(out.Items)
}

// PromoteEligibleRewardsForUser moves this user's pending earn rows to
// available when EligibleAt is in the past. Keeps checkout/profile balances
// accurate without relying solely on a scheduled admin sweep.
func (db *DynamoDB) PromoteEligibleRewardsForUser(ctx context.Context, userID string, cutoff time.Time) (promoted int, err error) {
	pk := rewardLedgerPK(userID)
	var startKey map[string]dyntypes.AttributeValue
	const pageLimit int32 = 100
	const maxPages = 40
	for page := 0; page < maxPages; page++ {
		in := &dynamodb.QueryInput{
			TableName:              aws.String(db.TableName),
			KeyConditionExpression: aws.String("PK = :pk"),
			ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
				":pk": &dyntypes.AttributeValueMemberS{Value: pk},
			},
			Limit:             aws.Int32(pageLimit),
			ExclusiveStartKey: startKey,
		}
		out, qerr := db.Client.Query(ctx, in)
		if qerr != nil {
			return promoted, qerr
		}
		entries, uerr := unmarshalRewardLedgerItems(out.Items)
		if uerr != nil {
			return promoted, uerr
		}
		for _, e := range entries {
			if e.Type != "earn" || e.Status != "pending" || e.EligibleAt == "" {
				continue
			}
			elig, perr := time.Parse(time.RFC3339, e.EligibleAt)
			if perr != nil || elig.After(cutoff) {
				continue
			}
			if uerr := db.UpdateRewardLedgerStatus(ctx, userID, e.CreatedAt, e.EntryID, "available"); uerr != nil {
				continue
			}
			if uerr := db.AdjustRewardSummary(ctx, userID, RewardSummaryDelta{
				PendingPoints:   -e.Points,
				AvailablePoints: e.Points,
			}); uerr != nil {
				continue
			}
			promoted++
		}
		startKey = out.LastEvaluatedKey
		if startKey == nil {
			break
		}
	}
	return promoted, nil
}

// ─── Summary ───

// ListRewardSummaries scans all per-user reward summary rows.
func (db *DynamoDB) ListRewardSummaries(ctx context.Context) ([]models.RewardSummary, error) {
	const prefix = "REWARDSUMMARY#"
	var (
		out       []models.RewardSummary
		startKey  map[string]dyntypes.AttributeValue
		maxPages  = 50
		pageLimit int32 = 100
	)
	for page := 0; page < maxPages; page++ {
		scanOut, err := db.Client.Scan(ctx, &dynamodb.ScanInput{
			TableName: aws.String(db.TableName),
			FilterExpression: aws.String("begins_with(PK, :pkPrefix) AND SK = :sk"),
			ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
				":pkPrefix": &dyntypes.AttributeValueMemberS{Value: prefix},
				":sk":       &dyntypes.AttributeValueMemberS{Value: "REWARDSUMMARY"},
			},
			Limit:             aws.Int32(pageLimit),
			ExclusiveStartKey: startKey,
		})
		if err != nil {
			return nil, err
		}
		for _, item := range scanOut.Items {
			var s models.RewardSummary
			if err := attributevalue.UnmarshalMap(item, &s); err != nil {
				return nil, err
			}
			if pkAv, ok := item["PK"].(*dyntypes.AttributeValueMemberS); ok && strings.HasPrefix(pkAv.Value, prefix) {
				s.UserID = strings.TrimPrefix(pkAv.Value, prefix)
			}
			out = append(out, s)
		}
		startKey = scanOut.LastEvaluatedKey
		if startKey == nil {
			break
		}
	}
	return out, nil
}

// GetRewardSummary returns the user's aggregate balances. A missing record
// yields a zero-valued summary, never an error.
func (db *DynamoDB) GetRewardSummary(ctx context.Context, userID string) (*models.RewardSummary, error) {
	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: rewardSummaryPK(userID)},
			"SK": &dyntypes.AttributeValueMemberS{Value: "REWARDSUMMARY"},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return &models.RewardSummary{UserID: userID}, nil
	}
	var s models.RewardSummary
	if err := attributevalue.UnmarshalMap(out.Item, &s); err != nil {
		return nil, err
	}
	s.UserID = userID
	return &s, nil
}

// AdjustRewardSummary atomically adds the supplied deltas to a user's summary.
// All deltas may be negative. Missing items are upserted to zero first.
func (db *DynamoDB) AdjustRewardSummary(ctx context.Context, userID string, delta RewardSummaryDelta) error {
	// DynamoDB ADD on a missing attribute initialises it to the provided value,
	// so a single UpdateItem suffices for upsert.
	_, err := db.Client.UpdateItem(ctx, &dynamodb.UpdateItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: rewardSummaryPK(userID)},
			"SK": &dyntypes.AttributeValueMemberS{Value: "REWARDSUMMARY"},
		},
		UpdateExpression: aws.String(
			"ADD LifetimeSpendCents :spend, " +
				"LifetimePointsEarned :earned, " +
				"PendingPoints :pending, " +
				"AvailablePoints :avail, " +
				"RedeemedPoints :redeemed, " +
				"ReversedPoints :reversed " +
				"SET UpdatedAt = :u",
		),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":spend":    numberAttr(delta.LifetimeSpendCents),
			":earned":   numberAttr(delta.LifetimePointsEarned),
			":pending":  numberAttr(delta.PendingPoints),
			":avail":    numberAttr(delta.AvailablePoints),
			":redeemed": numberAttr(delta.RedeemedPoints),
			":reversed": numberAttr(delta.ReversedPoints),
			":u":        &dyntypes.AttributeValueMemberS{Value: now()},
		},
	})
	return err
}

// RewardSummaryDelta is a signed-integer patch applied via AdjustRewardSummary.
type RewardSummaryDelta struct {
	LifetimeSpendCents   int64
	LifetimePointsEarned int64
	PendingPoints        int64
	AvailablePoints      int64
	RedeemedPoints       int64
	ReversedPoints       int64
}

func numberAttr(v int64) dyntypes.AttributeValue {
	return &dyntypes.AttributeValueMemberN{Value: fmt.Sprintf("%d", v)}
}
