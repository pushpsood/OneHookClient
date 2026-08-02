#!/bin/bash
set -e

# Configuration
REPO="pushpsood/OneHookClient"
ROLE_NAME="GitHubActionsDeployRole"
GITHUB_THUMBPRINT="1c58a3a8518e8759bf075b76b750d4f2df264fcd"

echo "Creating OIDC Provider for GitHub Actions..."
aws iam create-open-id-connect-provider \
  --url "https://token.actions.githubusercontent.com" \
  --client-id-list "sts.amazonaws.com" \
  --thumbprint-list "$GITHUB_THUMBPRINT" || echo "Provider may already exist, continuing..."

echo "Fetching AWS Account ID..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"

echo "Creating Trust Policy..."
cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "$PROVIDER_ARN"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${REPO}:*"
        }
      }
    }
  ]
}
EOF

echo "Creating IAM Role: $ROLE_NAME..."
aws iam create-role --role-name "$ROLE_NAME" --assume-role-policy-document file://trust-policy.json || echo "Role may already exist, continuing..."

echo "Attaching Least-Privilege policy to Role (CDK AssumeRole only)..."
cat > least-privilege-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": "arn:aws:iam::*:role/cdk-*"
    }
  ]
}
EOF

aws iam put-role-policy --role-name "$ROLE_NAME" --policy-name "CDKDeployLeastPrivilege" --policy-document file://least-privilege-policy.json

echo "Cleaning up..."
rm trust-policy.json least-privilege-policy.json

echo ""
echo "================================================="
echo "✅ Done! AWS is successfully configured."
echo ""
echo "Copy this Role ARN and add it to GitHub Secrets as 'AWS_ROLE_ARN':"
echo "arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"
echo "================================================="
