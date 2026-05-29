.PHONY: help install dev dev-frontend dev-backend start start-frontend start-backend stop stop-frontend stop-backend restart restart-frontend restart-backend build build-frontend build-backend test test-frontend test-backend test-e2e test-e2e-headed test-e2e-report test-api-contracts clean clean-frontend clean-backend deploy deploy-frontend deploy-backend run-local run-local-frontend run-local-backend print-cognito stripe-webhook-secret print-stripe-webhook-secret

# Variables
VITE_API_BASE_URL ?= http://localhost:9000/api
STAGE ?= dev
AWS_REGION ?= us-east-1
STACK_NAME ?= shopreturngifts-prod

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
NC := \033[0m

help: ## Show this help message
	@echo "$(BLUE)ShopReturnGifts Platform — Unified Makefile$(NC)"
	@echo ""
	@echo "$(BLUE)DEVELOPMENT$(NC)"
	@echo "  $(GREEN)make dev$(NC)                    - Run both frontend and backend locally (concurrent)"
	@echo "  $(GREEN)make dev-frontend$(NC)           - Start Vite dev server (port 8080)"
	@echo "  $(GREEN)make dev-backend$(NC)            - Start Go backend locally (port 9000)"
	@echo "  $(GREEN)make start$(NC)                  - Start frontend and backend in background"
	@echo "  $(GREEN)make start-frontend$(NC)         - Start frontend in background (port 8080)"
	@echo "  $(GREEN)make start-backend$(NC)          - Start backend in background (port 9000)"
	@echo "  $(GREEN)make stop$(NC)                   - Stop frontend and backend local servers"
	@echo "  $(GREEN)make stop-frontend$(NC)          - Stop frontend server on port 8080"
	@echo "  $(GREEN)make stop-backend$(NC)           - Stop backend server on port 9000"
	@echo "  $(GREEN)make restart$(NC)                - Stop and start frontend+backend in background"
	@echo "  $(GREEN)make restart-frontend$(NC)       - Restart frontend server on port 8080"
	@echo "  $(GREEN)make restart-backend$(NC)        - Restart backend server on port 9000"
	@echo ""
	@echo "$(BLUE)BUILDING$(NC)"
	@echo "  $(GREEN)make build$(NC)                  - Build both frontend and backend"
	@echo "  $(GREEN)make build-frontend$(NC)         - Build frontend (Vite static export)"
	@echo "  $(GREEN)make build-backend$(NC)          - Build Go binary for Lambda (ARM64)"
	@echo ""
	@echo "$(BLUE)TESTING$(NC)"
	@echo "  $(GREEN)make test$(NC)                   - Run all tests (frontend + backend)"
	@echo "  $(GREEN)make test-frontend$(NC)          - Run frontend tests (Vitest)"
	@echo "  $(GREEN)make test-backend$(NC)           - Run backend tests (Go)"
	@echo "  $(GREEN)make test-e2e$(NC)               - Run Playwright E2E tests (headless, chromium)"
	@echo "  $(GREEN)make test-e2e-headed$(NC)        - Run Playwright E2E tests (headed browser)"
	@echo "  $(GREEN)make test-e2e-report$(NC)        - Run Playwright E2E tests and open HTML report"
	@echo "  $(GREEN)make test-api-contracts$(NC)     - Run API contract tests against local backend (port 9000)"
	@echo ""
	@echo "$(BLUE)DEPLOYMENT$(NC)"
	@echo "  $(GREEN)make deploy$(NC)                 - Deploy both frontend and backend to AWS"
	@echo "  $(GREEN)make deploy-frontend STAGE=prod$(NC) - Deploy frontend to S3 + CloudFront"
	@echo "  $(GREEN)make deploy-backend STAGE=prod$(NC)  - Deploy backend Lambda via SAM"
	@echo ""
	@echo "$(BLUE)CLEANUP$(NC)"
	@echo "  $(GREEN)make clean$(NC)                  - Clean all build artifacts"
	@echo "  $(GREEN)make clean-frontend$(NC)         - Clean frontend dist/"
	@echo "  $(GREEN)make clean-backend$(NC)          - Clean backend bootstrap binary"
	@echo ""
	@echo "$(BLUE)UTILITIES$(NC)"
	@echo "  $(GREEN)make print-cognito STAGE=prod$(NC) - Print Cognito UserPool/AppClient IDs"
	@echo "  $(GREEN)make stripe-webhook-secret$(NC)   - Fetch Stripe webhook secret and save to root .env"
	@echo "  $(GREEN)make print-stripe-webhook-secret$(NC) - Print STRIPE_WEBHOOK_SECRET from root .env"
	@echo ""
	@echo "$(BLUE)EXAMPLES$(NC)"
	@echo "  $(GREEN)make dev$(NC)                    # Local dev with HMR"
	@echo "  $(GREEN)make test$(NC)                   # Run all tests"
	@echo "  $(GREEN)make deploy STAGE=prod$(NC)      # Deploy to production"

# ============================================================================
# DEVELOPMENT
# ============================================================================

dev: dev-frontend dev-backend ## Run frontend and backend locally (concurrent)
	@echo "$(YELLOW)Note: Use separate terminals or add '&' to run concurrently$(NC)"
	@echo "$(BLUE)Frontend runs on http://localhost:8080$(NC)"
	@echo "$(BLUE)Backend runs on http://localhost:9000$(NC)"

dev-frontend: ## Start Vite dev server with HMR
	@echo "$(GREEN)Starting frontend dev server (port 8080)...$(NC)"
	npm run dev

dev-backend: ## Start Go backend locally
	@echo "$(GREEN)Starting backend locally (port 9000)...$(NC)"
	cd backend && set -a && [ -f ../.env ] && . ../.env; set +a && PORT=9000 go run ./cmd/api

start: start-backend start-frontend ## Start frontend and backend in background
	@echo "$(GREEN)✓ Frontend and backend started in background$(NC)"
	@echo "$(BLUE)Frontend: http://localhost:8080  (log: .logs/frontend.log)$(NC)"
	@echo "$(BLUE)Backend:  http://localhost:9000  (log: .logs/backend.log)$(NC)"

start-frontend: ## Start frontend dev server in background (port 8080)
	@echo "$(GREEN)Starting frontend in background (port 8080)...$(NC)"
	@mkdir -p .logs
	@nohup $(MAKE) dev-frontend > .logs/frontend.log 2>&1 & echo $$! > .logs/frontend.pid
	@sleep 1
	@if lsof -tiTCP:8080 -sTCP:LISTEN >/dev/null; then \
		echo "$(GREEN)✓ Frontend started$(NC)"; \
	else \
		echo "$(YELLOW)Frontend did not bind to port 8080 yet. Check .logs/frontend.log$(NC)"; \
	fi

start-backend: ## Start backend dev server in background (port 9000)
	@echo "$(GREEN)Starting backend in background (port 9000)...$(NC)"
	@mkdir -p .logs
	@nohup $(MAKE) dev-backend > .logs/backend.log 2>&1 & echo $$! > .logs/backend.pid
	@sleep 1
	@if lsof -tiTCP:9000 -sTCP:LISTEN >/dev/null; then \
		echo "$(GREEN)✓ Backend started$(NC)"; \
	else \
		echo "$(YELLOW)Backend did not bind to port 9000 yet. Check .logs/backend.log$(NC)"; \
	fi

stop: stop-frontend stop-backend ## Stop both frontend and backend local servers
	@echo "$(GREEN)✓ Local frontend/backend processes stopped$(NC)"

stop-frontend: ## Stop frontend dev server running on port 8080
	@echo "$(GREEN)Stopping frontend server (port 8080)...$(NC)"
	@pids=$$(lsof -tiTCP:8080 -sTCP:LISTEN); \
	if [ -n "$$pids" ]; then \
		kill -9 $$pids; \
		echo "$(GREEN)✓ Frontend stopped (PIDs: $$pids)$(NC)"; \
	else \
		echo "$(YELLOW)No frontend listener found on port 8080$(NC)"; \
	fi

stop-backend: ## Stop backend dev server running on port 9000
	@echo "$(GREEN)Stopping backend server (port 9000)...$(NC)"
	@pids=$$(lsof -tiTCP:9000 -sTCP:LISTEN); \
	if [ -n "$$pids" ]; then \
		kill -9 $$pids; \
		echo "$(GREEN)✓ Backend stopped (PIDs: $$pids)$(NC)"; \
	else \
		echo "$(YELLOW)No backend listener found on port 9000$(NC)"; \
	fi

restart: stop start ## Stop and start both local servers in background
	@echo "$(GREEN)✓ Restart complete$(NC)"

restart-frontend: stop-frontend start-frontend ## Restart frontend local server
	@echo "$(GREEN)✓ Frontend restart complete$(NC)"

restart-backend: stop-backend start-backend ## Restart backend local server
	@echo "$(GREEN)✓ Backend restart complete$(NC)"

# ============================================================================
# BUILDING
# ============================================================================

build: build-frontend build-backend ## Build both frontend and backend
	@echo "$(GREEN)✓ Frontend and backend built successfully$(NC)"

build-frontend: ## Build frontend static export (Vite)
	@echo "$(GREEN)Building frontend...$(NC)"
	npm run build
	@echo "$(GREEN)✓ Frontend built: dist/$(NC)"

build-backend: ## Build Go binary for Lambda (ARM64 Linux)
	@echo "$(GREEN)Building backend for Lambda...$(NC)"
	cd backend && GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -tags lambda.norpc -o bootstrap ./cmd/api
	@echo "$(GREEN)✓ Backend binary: backend/bootstrap$(NC)"

# ============================================================================
# TESTING
# ============================================================================

test: test-frontend test-backend ## Run all tests (frontend + backend)
	@echo "$(GREEN)✓ All tests passed$(NC)"

test-frontend: ## Run frontend tests (Vitest)
	@echo "$(GREEN)Testing frontend...$(NC)"
	npm run test -- --run
	@echo "$(GREEN)✓ Frontend tests passed$(NC)"

test-backend: ## Run backend tests (Go)
	@echo "$(GREEN)Testing backend...$(NC)"
	cd backend && go test ./... -v
	@echo "$(GREEN)✓ Backend tests passed$(NC)"

test-e2e: ## Run Playwright E2E tests (headless, chromium only)
	@echo "$(GREEN)Running E2E tests (headless)...$(NC)"
	npx playwright test --project=chromium
	@echo "$(GREEN)✓ E2E tests passed$(NC)"

test-e2e-headed: ## Run Playwright E2E tests in a visible browser window
	@echo "$(GREEN)Running E2E tests (headed)...$(NC)"
	npx playwright test --project=chromium --headed

test-e2e-report: ## Run Playwright E2E tests and open the HTML report
	@echo "$(GREEN)Running E2E tests with HTML report...$(NC)"
	npx playwright test --project=chromium --reporter=html
	@pids=$$(lsof -tiTCP:9323 -sTCP:LISTEN); \
	if [ -n "$$pids" ]; then kill -9 $$pids; fi
	npx playwright show-report

test-api-contracts: ## Run API contract tests against the local backend (port 9000)
	@echo "$(GREEN)Running API contract tests (project=api-contracts)...$(NC)"
	@echo "$(YELLOW)Requires: backend running on port 9000 + env vars in root .env$(NC)"
	@echo "$(YELLOW)Required env vars: TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD$(NC)"
	set -a && [ -f .env ] && . ./.env; set +a && \
	API_BASE_URL=http://localhost:9000 \
	npx playwright test --project=api-contracts
	@echo "$(GREEN)✓ API contract tests complete$(NC)"

# ============================================================================
# DEPLOYMENT
# ============================================================================

deploy: deploy-backend deploy-frontend ## Deploy both frontend and backend to AWS
	@echo "$(GREEN)✓ Deployment complete!$(NC)"
	@echo "$(BLUE)Frontend: Check S3 bucket and CloudFront distribution$(NC)"
	@echo "$(BLUE)Backend: Check API Gateway endpoint$(NC)"

deploy-frontend: build-frontend ## Deploy frontend to S3 + CloudFront invalidation
	@echo "$(GREEN)Deploying frontend to S3 (stage: $(STAGE))...$(NC)"
	@read -p "Enter S3 bucket name (e.g., shopreturngifts-store-assets-$(STAGE)): " bucket; \
	read -p "Enter CloudFront distribution ID (e.g., E123ABC...): " dist_id; \
	aws s3 sync dist/ s3://$$bucket/ --delete --region $(AWS_REGION) && \
	aws cloudfront create-invalidation --distribution-id $$dist_id --paths "/*" --region $(AWS_REGION) && \
	echo "$(GREEN)✓ Frontend deployed to S3 and cache invalidated$(NC)"

deploy-backend: build-backend ## Deploy backend to Lambda via SAM
	@echo "$(GREEN)Deploying backend to Lambda (stage: $(STAGE))...$(NC)"
	cd backend && sam deploy \
		--template-file ../template.yaml \
		--stack-name $(STACK_NAME) \
		--region $(AWS_REGION) \
		--capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND_MACRO \
		--parameter-overrides Stage=$(STAGE) \
		--guided-allow-override || true
	@echo "$(GREEN)✓ Backend deployed via SAM$(NC)"

# ============================================================================
# CLEANUP
# ============================================================================

clean: clean-frontend clean-backend ## Clean all build artifacts
	@echo "$(GREEN)✓ All artifacts cleaned$(NC)"

clean-frontend: ## Remove frontend dist/ directory
	@echo "$(GREEN)Cleaning frontend artifacts...$(NC)"
	rm -rf dist/
	@echo "$(GREEN)✓ Removed dist/$(NC)"

clean-backend: ## Remove backend bootstrap binary
	@echo "$(GREEN)Cleaning backend artifacts...$(NC)"
	cd backend && make clean
	@echo "$(GREEN)✓ Removed bootstrap binary$(NC)"

# ============================================================================
# UTILITIES
# ============================================================================

install: ## Install dependencies for both frontend and backend
	@echo "$(GREEN)Installing frontend dependencies...$(NC)"
	npm install
	@echo "$(GREEN)Installing backend dependencies...$(NC)"
	cd backend && go mod download && go mod tidy
	@echo "$(GREEN)✓ All dependencies installed$(NC)"

lint: ## Lint frontend and backend code
	@echo "$(GREEN)Linting frontend...$(NC)"
	npm run lint
	@echo "$(GREEN)Linting backend...$(NC)"
	cd backend && go fmt ./...
	@echo "$(GREEN)✓ Linting complete$(NC)"

print-cognito: ## Print Cognito User Pool ID and App Client ID from stack outputs
	@echo "$(GREEN)Reading Cognito outputs from stack: $(STACK_NAME)$(NC)"
	@command -v aws >/dev/null 2>&1 || { \
		echo "$(YELLOW)AWS CLI not found. Install it first: brew install awscli$(NC)"; \
		exit 1; \
	}
	@aws cloudformation describe-stacks \
		--stack-name $(STACK_NAME) \
		--region $(AWS_REGION) \
		--query "Stacks[0].Outputs[?OutputKey=='UserPoolId' || OutputKey=='UserPoolClientId'].[OutputKey,OutputValue]" \
		--output table

stripe-webhook-secret: ## Fetch Stripe webhook secret and write STRIPE_WEBHOOK_SECRET in root .env
	@echo "$(GREEN)Fetching Stripe webhook signing secret...$(NC)"
	@command -v stripe >/dev/null 2>&1 || { \
		echo "$(YELLOW)Stripe CLI not found. Install with: brew install stripe/stripe-cli/stripe$(NC)"; \
		exit 1; \
	}
	@set -a && [ -f .env ] && . ./.env; set +a; \
	forward_url=$${STRIPE_FORWARD_URL:-http://localhost:9000/api/stripe/webhook}; \
	echo "$(BLUE)--- Webhook Configuration ---$(NC)"; \
	echo "$(BLUE)STRIPE_FORWARD_URL: $$forward_url$(NC)"; \
	echo "$(BLUE)ENV file: .env$(NC)"; \
	echo "$(BLUE)--- Generating Secret ---$(NC)"; \
	secret=$$(stripe listen --print-secret --forward-to $$forward_url); \
	if [ -z "$$secret" ]; then \
		echo "$(YELLOW)Could not read webhook secret. Run 'stripe login' and try again.$(NC)"; \
		exit 1; \
	fi; \
	env_file=.env; \
	touch $$env_file; \
	if grep -q '^STRIPE_WEBHOOK_SECRET=' $$env_file; then \
		sed -i.bak "s|^STRIPE_WEBHOOK_SECRET=.*|STRIPE_WEBHOOK_SECRET=$$secret|" $$env_file; \
		rm -f $$env_file.bak; \
	else \
		echo "STRIPE_WEBHOOK_SECRET=$$secret" >> $$env_file; \
	fi; \
	echo "$(GREEN)✓ Updated $$env_file with STRIPE_WEBHOOK_SECRET$(NC)"; \
	echo "$(BLUE)--- Saved Configuration ---$(NC)"; \
	echo "$(BLUE)STRIPE_WEBHOOK_SECRET: $$secret$(NC)"; \
	echo "$(BLUE)Saved in: $$env_file$(NC)"

print-stripe-webhook-secret: ## Print STRIPE_WEBHOOK_SECRET from root .env
	@env_file=.env; \
	if [ ! -f $$env_file ]; then \
		echo "$(YELLOW)$$env_file not found. Run 'make stripe-webhook-secret' first.$(NC)"; \
		exit 1; \
	fi; \
	secret_line=$$(grep '^STRIPE_WEBHOOK_SECRET=' $$env_file || true); \
	if [ -z "$$secret_line" ]; then \
		echo "$(YELLOW)STRIPE_WEBHOOK_SECRET is not set in $$env_file$(NC)"; \
		exit 1; \
	fi; \
	echo "$(BLUE)$$secret_line$(NC)"
