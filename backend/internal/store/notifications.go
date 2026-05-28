package store

import (
	"context"
	"fmt"
	"sort"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	dyntypes "github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"

	"shopreturngifts-api/internal/models"
)

func notificationPK(userID string) string {
	return "USER#" + trimEntityPrefix(userID, "USER#") + "#NOTIF"
}

func notificationSK(notificationID string) string {
	return "NOTIF#" + strings.TrimPrefix(notificationID, "NOTIF#")
}

// CreateNotification persists an in-app notification for one user.
func (db *DynamoDB) CreateNotification(ctx context.Context, n *models.Notification) error {
	if n == nil {
		return fmt.Errorf("notification is nil")
	}
	userID := trimEntityPrefix(n.UserID, "USER#")
	if userID == "" {
		return fmt.Errorf("notification user id is required")
	}
	if strings.TrimSpace(n.Title) == "" {
		return fmt.Errorf("notification title is required")
	}
	if n.NotificationID == "" {
		n.NotificationID = uuid.New().String()
	}
	if n.CreatedAt == "" {
		n.CreatedAt = now()
	}
	n.UserID = userID

	item, err := attributevalue.MarshalMap(n)
	if err != nil {
		return err
	}
	item["PK"] = &dyntypes.AttributeValueMemberS{Value: notificationPK(userID)}
	item["SK"] = &dyntypes.AttributeValueMemberS{Value: notificationSK(n.NotificationID)}

	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

// ListNotifications returns notifications for a user, newest first.
func (db *DynamoDB) ListNotifications(ctx context.Context, userID string, limit int) ([]models.Notification, error) {
	userID = trimEntityPrefix(userID, "USER#")
	if userID == "" {
		return nil, fmt.Errorf("user id is required")
	}
	if limit <= 0 {
		limit = 50
	}
	if limit > 100 {
		limit = 100
	}

	out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(db.TableName),
		KeyConditionExpression: aws.String("PK = :pk"),
		ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
			":pk": &dyntypes.AttributeValueMemberS{Value: notificationPK(userID)},
		},
		Limit: aws.Int32(int32(limit * 2)),
	})
	if err != nil {
		return nil, err
	}

	items := make([]models.Notification, 0, len(out.Items))
	for _, row := range out.Items {
		var n models.Notification
		if err := attributevalue.UnmarshalMap(row, &n); err != nil {
			return nil, err
		}
		if sk, ok := getStringAttribute(row, "SK"); ok {
			n.NotificationID = strings.TrimPrefix(sk, "NOTIF#")
		}
		n.UserID = userID
		items = append(items, n)
	}

	sort.Slice(items, func(i, j int) bool {
		return items[i].CreatedAt > items[j].CreatedAt
	})
	if len(items) > limit {
		items = items[:limit]
	}
	return items, nil
}

// GetNotification loads one notification and verifies it belongs to the user.
func (db *DynamoDB) GetNotification(ctx context.Context, userID, notificationID string) (*models.Notification, error) {
	userID = trimEntityPrefix(userID, "USER#")
	notificationID = strings.TrimPrefix(notificationID, "NOTIF#")
	if userID == "" || notificationID == "" {
		return nil, fmt.Errorf("user id and notification id are required")
	}

	out, err := db.Client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(db.TableName),
		Key: map[string]dyntypes.AttributeValue{
			"PK": &dyntypes.AttributeValueMemberS{Value: notificationPK(userID)},
			"SK": &dyntypes.AttributeValueMemberS{Value: notificationSK(notificationID)},
		},
	})
	if err != nil {
		return nil, err
	}
	if out.Item == nil {
		return nil, fmt.Errorf("notification not found")
	}

	var n models.Notification
	if err := attributevalue.UnmarshalMap(out.Item, &n); err != nil {
		return nil, err
	}
	if trimEntityPrefix(n.UserID, "USER#") != userID {
		return nil, fmt.Errorf("notification not found")
	}
	n.NotificationID = notificationID
	n.UserID = userID
	return &n, nil
}

// MarkNotificationRead sets readAt on a notification owned by the user.
func (db *DynamoDB) MarkNotificationRead(ctx context.Context, userID, notificationID, readAt string) error {
	n, err := db.GetNotification(ctx, userID, notificationID)
	if err != nil {
		return err
	}
	if strings.TrimSpace(n.ReadAt) != "" {
		return nil
	}
	n.ReadAt = readAt
	return db.CreateNotification(ctx, n)
}

// MarkAllNotificationsRead marks every unread notification for the user.
func (db *DynamoDB) MarkAllNotificationsRead(ctx context.Context, userID, readAt string) error {
	items, err := db.ListNotifications(ctx, userID, 100)
	if err != nil {
		return err
	}
	for _, n := range items {
		if strings.TrimSpace(n.ReadAt) != "" {
			continue
		}
		n.ReadAt = readAt
		if err := db.CreateNotification(ctx, &n); err != nil {
			return err
		}
	}
	return nil
}

// ListActiveAdminUserIDs returns user IDs for active admin accounts.
func (db *DynamoDB) ListActiveAdminUserIDs(ctx context.Context) ([]string, error) {
	pag, err := db.GetUsers(ctx)
	if err != nil {
		return nil, err
	}
	var ids []string
	for _, u := range pag.Items {
		if u.IsActive && strings.EqualFold(strings.TrimSpace(u.Role), "admin") {
			ids = append(ids, trimEntityPrefix(u.UserID, "USER#"))
		}
	}
	return ids, nil
}
