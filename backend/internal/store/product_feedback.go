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

func productFeedbackPK(productID string) string {
	return "PRODUCTFEEDBACK#" + stripProductPrefix(productID)
}

func ratingSK(userID string) string {
	return "RATING#" + strings.TrimSpace(userID)
}

func commentSK(createdAt, entryID string) string {
	return "COMMENT#" + createdAt + "#" + entryID
}

// PutProductRating upserts one rating per user for a product (1–5 stars).
func (db *DynamoDB) PutProductRating(ctx context.Context, productID, userID, userName string, stars int) error {
	pid := stripProductPrefix(productID)
	ts := now()
	item := map[string]dyntypes.AttributeValue{
		"PK":        &dyntypes.AttributeValueMemberS{Value: productFeedbackPK(pid)},
		"SK":        &dyntypes.AttributeValueMemberS{Value: ratingSK(userID)},
		"Type":      &dyntypes.AttributeValueMemberS{Value: "rating"},
		"UserId":    &dyntypes.AttributeValueMemberS{Value: userID},
		"UserName":  &dyntypes.AttributeValueMemberS{Value: strings.TrimSpace(userName)},
		"Stars":     &dyntypes.AttributeValueMemberN{Value: fmt.Sprintf("%d", stars)},
		"CreatedAt": &dyntypes.AttributeValueMemberS{Value: ts},
		"UpdatedAt": &dyntypes.AttributeValueMemberS{Value: ts},
	}
	_, err := db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item:      item,
	})
	return err
}

// PutProductComment appends a comment for a product.
func (db *DynamoDB) PutProductComment(ctx context.Context, productID, userID, userName, body string) (commentID string, err error) {
	pid := stripProductPrefix(productID)
	entryID := uuid.New().String()
	created := now()
	_, err = db.Client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(db.TableName),
		Item: map[string]dyntypes.AttributeValue{
			"PK":        &dyntypes.AttributeValueMemberS{Value: productFeedbackPK(pid)},
			"SK":        &dyntypes.AttributeValueMemberS{Value: commentSK(created, entryID)},
			"Type":      &dyntypes.AttributeValueMemberS{Value: "comment"},
			"UserId":    &dyntypes.AttributeValueMemberS{Value: userID},
			"UserName":  &dyntypes.AttributeValueMemberS{Value: strings.TrimSpace(userName)},
			"Body":      &dyntypes.AttributeValueMemberS{Value: body},
			"CreatedAt": &dyntypes.AttributeValueMemberS{Value: created},
			"EntryId":   &dyntypes.AttributeValueMemberS{Value: entryID},
		},
	})
	if err != nil {
		return "", err
	}
	return entryID, nil
}

// QueryProductFeedback loads all rating and comment rows for a product.
func (db *DynamoDB) QueryProductFeedback(ctx context.Context, productID string) ([]models.ProductFeedbackRatingRow, []models.ProductFeedbackCommentRow, error) {
	pid := stripProductPrefix(productID)
	var ratings []models.ProductFeedbackRatingRow
	var comments []models.ProductFeedbackCommentRow
	var start map[string]dyntypes.AttributeValue
	for i := 0; i < 20; i++ {
		out, err := db.Client.Query(ctx, &dynamodb.QueryInput{
			TableName:              aws.String(db.TableName),
			KeyConditionExpression: aws.String("PK = :pk"),
			ExpressionAttributeValues: map[string]dyntypes.AttributeValue{
				":pk": &dyntypes.AttributeValueMemberS{Value: productFeedbackPK(pid)},
			},
			ExclusiveStartKey: start,
			Limit:             aws.Int32(100),
		})
		if err != nil {
			return nil, nil, err
		}
		for _, av := range out.Items {
			var row struct {
				SK        string `dynamodbav:"SK"`
				UserID    string `dynamodbav:"UserId"`
				UserName  string `dynamodbav:"UserName"`
				Stars     int    `dynamodbav:"Stars"`
				Body      string `dynamodbav:"Body"`
				CreatedAt string `dynamodbav:"CreatedAt"`
				UpdatedAt string `dynamodbav:"UpdatedAt"`
				EntryID   string `dynamodbav:"EntryId"`
			}
			if err := attributevalue.UnmarshalMap(av, &row); err != nil {
				continue
			}
			switch {
			case strings.HasPrefix(row.SK, "RATING#"):
				uu := strings.TrimSpace(row.UpdatedAt)
				if uu == "" {
					uu = row.CreatedAt
				}
				ratings = append(ratings, models.ProductFeedbackRatingRow{
					UserID:    row.UserID,
					UserName:  row.UserName,
					Stars:     row.Stars,
					UpdatedAt: uu,
				})
			case strings.HasPrefix(row.SK, "COMMENT#"):
				cid := strings.TrimSpace(row.EntryID)
				if cid == "" {
					parts := strings.Split(row.SK, "#")
					if len(parts) >= 3 {
						cid = parts[len(parts)-1]
					}
				}
				comments = append(comments, models.ProductFeedbackCommentRow{
					CommentID: cid,
					UserID:    row.UserID,
					UserName:  row.UserName,
					Body:      row.Body,
					CreatedAt: row.CreatedAt,
				})
			}
		}
		start = out.LastEvaluatedKey
		if start == nil {
			break
		}
	}
	sort.Slice(comments, func(i, j int) bool {
		return comments[i].CreatedAt > comments[j].CreatedAt
	})
	return ratings, comments, nil
}
