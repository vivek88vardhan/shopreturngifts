.PHONY: build build-ApiFunction build-EmailWorkerFunction build-CognitoCustomMessageFunction test clean run-local

# Build for Lambda (ARM64 Linux)
build:
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o bootstrap ./cmd/api

# SAM Makefile builder target
build-ApiFunction:
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o $(ARTIFACTS_DIR)/bootstrap ./cmd/api

build-EmailWorkerFunction:
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o $(ARTIFACTS_DIR)/bootstrap ./cmd/emailworker

build-CognitoCustomMessageFunction:
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o $(ARTIFACTS_DIR)/bootstrap ./cmd/cognitomessage

# Run tests
test:
	go test ./... -v

# Clean build artifacts
clean:
	rm -f bootstrap

# Run locally (not as Lambda — useful for debugging)
run-local:
	set -a && . ../.env && set +a && PORT=9000 go run ./cmd/api
