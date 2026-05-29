# Google OAuth Setup for KiranaBandi

This guide covers creating Google OAuth credentials and wiring them into KiranaBandi (Cognito + SAM).

---

## 1. Prerequisites

- A Google account with access to [Google Cloud Console](https://console.cloud.google.com/)
- KiranaBandi deployed to AWS (stack: `shopreturngifts`)
- Cognito domain prefix chosen (e.g. `shopreturngifts-3951-prod`)

---

## 2. Create a Google Cloud Project

1. Open [console.cloud.google.com](https://console.cloud.google.com/)
2. Click the project dropdown at the top → **New Project**
3. **Project name:** `KiranaBandi` (or any name)
4. Click **Create**
5. Make sure the new project is selected in the dropdown

---

## 3. Configure the OAuth Consent Screen

1. In the left sidebar: **APIs & Services** → **OAuth consent screen**
2. Select **External** → **Create**
3. Fill in the required fields:

   | Field | Value |
   |---|---|
   | App name | KiranaBandi |
   | User support email | your@email.com |
   | Developer contact email | your@email.com |

4. Click **Save and Continue**
5. On the **Scopes** page, click **Add or Remove Scopes** and add:
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
   - `openid`
6. Click **Update** → **Save and Continue**
7. On the **Test users** page, add your email for testing → **Save and Continue**
8. Review and click **Back to Dashboard**

> **Note:** While in "Testing" mode, only added test users can sign in.  
> To allow all Google users, click **Publish App** → **Confirm**.

---

## 4. Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. **Application type:** Web application
4. **Name:** `KiranaBandi Cognito`
5. Under **Authorized redirect URIs**, click **+ Add URI** and enter:

   ```
   https://shopreturngifts-3951-prod.auth.us-east-1.amazoncognito.com/oauth2/idpresponse
   ```

   > Replace `shopreturngifts-3951-prod` with your actual `CognitoDomainPrefix`.  
   > Pattern: `https://<CognitoDomainPrefix>.auth.<AWS_REGION>.amazoncognito.com/oauth2/idpresponse`

6. Click **Create**

A dialog will appear with your credentials:

```
Client ID:      247826264725-xxxxxxxxxxxx.apps.googleusercontent.com
Client Secret:  GOCSPX-xxxxxxxxxxxxxxxxxxxxxxx
```

Copy both values — you'll need them in the next step.

> To retrieve them later: **Credentials** → click the pencil icon next to your client → **Show Secret**

---

## 5. Deploy KiranaBandi with Google OAuth

Run the SAM deploy command with your credentials:

```bash
cd backend && make build && cd ..

sam build --template template.yaml

sam deploy \
  --stack-name shopreturngifts \
  --region us-east-1 \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    ParameterKey=Stage,ParameterValue=prod \
    ParameterKey=CognitoDomainPrefix,ParameterValue=shopreturngifts-3951-prod \
    ParameterKey=GoogleClientId,ParameterValue=YOUR_CLIENT_ID.apps.googleusercontent.com \
    ParameterKey=GoogleClientSecret,ParameterValue=GOCSPX-YOUR_SECRET
```

> **Never commit `GoogleClientSecret` to git.** Always pass it at deploy time via `--parameter-overrides` or store it in AWS Secrets Manager.

---

## 6. GitHub Actions — Adding Secrets

If deploying via CI/CD, add these as GitHub repository secrets:

1. Go to your repo → **Settings** → **Secrets and variables** → **Actions**
2. Add the following secrets:

   | Secret Name | Value |
   |---|---|
   | `GOOGLE_CLIENT_ID` | `247826264725-xxxx.apps.googleusercontent.com` |
   | `GOOGLE_CLIENT_SECRET` | `GOCSPX-xxxxxxxx` |
   | `COGNITO_DOMAIN_PREFIX` | `shopreturngifts-3951-prod` |

3. Update `.github/workflows/deploy.yml` to pass them:

   ```yaml
   --parameter-overrides \
     ParameterKey=CognitoDomainPrefix,ParameterValue=${{ secrets.COGNITO_DOMAIN_PREFIX }} \
     ParameterKey=GoogleClientId,ParameterValue=${{ secrets.GOOGLE_CLIENT_ID }} \
     ParameterKey=GoogleClientSecret,ParameterValue=${{ secrets.GOOGLE_CLIENT_SECRET }}
   ```

---

## 7. Verify the Setup

After deploy, confirm the domain and identity provider are active:

```bash
# Confirm Cognito domain is set
aws cognito-idp describe-user-pool \
  --user-pool-id us-east-1_5b5S0gMdE \
  --query "UserPool.Domain" \
  --output text
# Expected: shopreturngifts-3951-prod

# Confirm Google identity provider exists
aws cognito-idp list-identity-providers \
  --user-pool-id us-east-1_5b5S0gMdE \
  --query "Providers[].ProviderName" \
  --output text
# Expected: Google
```

Test the hosted UI login page:
```
https://shopreturngifts-3951-prod.auth.us-east-1.amazoncognito.com/login?client_id=<APP_CLIENT_ID>&response_type=code&scope=openid+email+profile&redirect_uri=https://your-frontend.com/auth/callback
```

---

## 8. Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `The provider Google does not exist` | `UserPoolClient` updated before `GoogleIdentityProvider` finished creating | Fixed via `!Ref GoogleIdentityProvider` implicit dependency in `template.yaml` |
| `redirect_uri_mismatch` | Redirect URI in Google Console doesn't match | Add exact URI from Step 4 to Google Console |
| `Domain already exists` | Cognito domain prefix taken by another account | Choose a different unique prefix |
| Sign-in only works for test users | OAuth consent screen is in Testing mode | Publish the app (Step 3, last note) |
| `invalid_client` from Google | Wrong Client ID or Secret | Re-check values from Google Console credentials page |

---

## 9. Reference

| Item | Value |
|---|---|
| Cognito User Pool ID | `us-east-1_5b5S0gMdE` |
| Cognito Domain Prefix | `shopreturngifts-3951-prod` |
| Cognito Redirect URI | `https://shopreturngifts-3951-prod.auth.us-east-1.amazoncognito.com/oauth2/idpresponse` |
| AWS Region | `us-east-1` |
| SAM Stack | `shopreturngifts` |
