#!/usr/bin/env bash
#
# LEGACY ROLLBACK UTILITY — the active deployment path is now
# GitHub -> CodeConnections -> CodePipeline -> CodeBuild/CDK/CloudFormation.
#
# Do not use this for normal setup. It remains temporarily so the existing GitHub deployment roles
# can be recovered during cutover. Remove it after the AWS pipeline has completed both stage
# deployments and the old roles have been retired. Explicit opt-in is required:
#
#   ALLOW_LEGACY_GITHUB_OIDC=1 AWS_PROFILE=pushp-sde-aws ./setup-aws-oidc.sh gamma
#   ALLOW_LEGACY_GITHUB_OIDC=1 AWS_PROFILE=pushp-sde-aws ./setup-aws-oidc.sh production
#
# Idempotently provisions the former GitHub Actions OIDC deployment trust for one frontend stage
# only when the explicit rollback guard above is present.
#
# Each stage gets a separate role trusted only by the exact GitHub environment subject. The role
# may assume only the existing CDK bootstrap deploy, file-publishing, and lookup roles required by
# this frontend in ap-south-1 and us-east-1. It cannot assume image-publishing roles, arbitrary
# cdk-* roles, or roles in another account.
#
# Unless SKIP_GH=1, the script also creates the matching GitHub environment if absent and stores the
# role ARN as that environment's AWS_ROLE_ARN secret. GitHub required-reviewer protection remains a
# repository-admin setting and is intentionally not overwritten by this script.
set -euo pipefail

if [ "${ALLOW_LEGACY_GITHUB_OIDC:-0}" != "1" ]; then
  echo "This legacy GitHub OIDC setup is disabled; deployments now use AWS CodePipeline." >&2
  echo "Set ALLOW_LEGACY_GITHUB_OIDC=1 only for an intentional cutover rollback." >&2
  exit 2
fi

REPO="pushpsood/OneHookClient"
GITHUB_OIDC_URL="token.actions.githubusercontent.com"
GITHUB_OIDC_HOST="https://${GITHUB_OIDC_URL}"
EXPECTED_ACCOUNT="851725215059"
CDK_QUALIFIER="hnb659fds"
SKIP_GH="${SKIP_GH:-0}"

STAGE="${1:-}"
case "${STAGE}" in
  gamma | production) ;;
  *)
    echo "Usage: $0 <gamma|production>" >&2
    exit 2
    ;;
esac

ROLE_NAME="GitHubActionsDeployRole-${STAGE}"
SUBJECT="repo:${REPO}:environment:${STAGE}"

echo "==> Verifying active AWS credentials (${EXPECTED_ACCOUNT})..."
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
if [ "${ACCOUNT_ID}" != "${EXPECTED_ACCOUNT}" ]; then
  echo "Refusing to continue: active credentials are for account ${ACCOUNT_ID}; expected ${EXPECTED_ACCOUNT}." >&2
  exit 1
fi

PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${GITHUB_OIDC_URL}"

echo "==> Ensuring the GitHub OIDC provider exists..."
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "${PROVIDER_ARN}" >/dev/null 2>&1; then
  echo "    Existing provider: ${PROVIDER_ARN}"
else
  aws iam create-open-id-connect-provider \
    --url "${GITHUB_OIDC_HOST}" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list 1c58a3a8518e8759bf075b76b750d4f2df264fcd >/dev/null
  echo "    Created provider: ${PROVIDER_ARN}"
fi

# Fail before changing IAM if any expected bootstrap role is absent.
CDK_ROLE_NAMES=(
  "cdk-${CDK_QUALIFIER}-deploy-role-${ACCOUNT_ID}-ap-south-1"
  "cdk-${CDK_QUALIFIER}-file-publishing-role-${ACCOUNT_ID}-ap-south-1"
  "cdk-${CDK_QUALIFIER}-lookup-role-${ACCOUNT_ID}-ap-south-1"
  "cdk-${CDK_QUALIFIER}-deploy-role-${ACCOUNT_ID}-us-east-1"
  "cdk-${CDK_QUALIFIER}-file-publishing-role-${ACCOUNT_ID}-us-east-1"
  "cdk-${CDK_QUALIFIER}-lookup-role-${ACCOUNT_ID}-us-east-1"
)

echo "==> Verifying the exact CDK bootstrap roles..."
for cdk_role in "${CDK_ROLE_NAMES[@]}"; do
  aws iam get-role --role-name "${cdk_role}" >/dev/null
  echo "    ${cdk_role}"
done

WORKDIR="$(mktemp -d)"
trap 'rm -rf "${WORKDIR}"' EXIT

cat > "${WORKDIR}/trust-policy.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GitHubEnvironmentOidc",
      "Effect": "Allow",
      "Principal": { "Federated": "${PROVIDER_ARN}" },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "${GITHUB_OIDC_URL}:aud": "sts.amazonaws.com",
          "${GITHUB_OIDC_URL}:sub": "${SUBJECT}"
        }
      }
    }
  ]
}
EOF

cat > "${WORKDIR}/least-privilege-policy.json" <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AssumeFrontendCdkBootstrapRoles",
      "Effect": "Allow",
      "Action": "sts:AssumeRole",
      "Resource": [
        "arn:aws:iam::${ACCOUNT_ID}:role/cdk-${CDK_QUALIFIER}-deploy-role-${ACCOUNT_ID}-ap-south-1",
        "arn:aws:iam::${ACCOUNT_ID}:role/cdk-${CDK_QUALIFIER}-file-publishing-role-${ACCOUNT_ID}-ap-south-1",
        "arn:aws:iam::${ACCOUNT_ID}:role/cdk-${CDK_QUALIFIER}-lookup-role-${ACCOUNT_ID}-ap-south-1",
        "arn:aws:iam::${ACCOUNT_ID}:role/cdk-${CDK_QUALIFIER}-deploy-role-${ACCOUNT_ID}-us-east-1",
        "arn:aws:iam::${ACCOUNT_ID}:role/cdk-${CDK_QUALIFIER}-file-publishing-role-${ACCOUNT_ID}-us-east-1",
        "arn:aws:iam::${ACCOUNT_ID}:role/cdk-${CDK_QUALIFIER}-lookup-role-${ACCOUNT_ID}-us-east-1"
      ]
    }
  ]
}
EOF

echo "==> Ensuring IAM role ${ROLE_NAME} exists with exact environment trust..."
if aws iam get-role --role-name "${ROLE_NAME}" >/dev/null 2>&1; then
  aws iam update-assume-role-policy \
    --role-name "${ROLE_NAME}" \
    --policy-document "file://${WORKDIR}/trust-policy.json" >/dev/null
  echo "    Updated existing role trust."
else
  aws iam create-role \
    --role-name "${ROLE_NAME}" \
    --description "OneHookClient ${STAGE} deployment from GitHub environment ${STAGE}" \
    --max-session-duration 3600 \
    --tags Key=Project,Value=OneHook Key=Component,Value=Frontend Key=Environment,Value="${STAGE}" Key=ManagedBy,Value=setup-aws-oidc.sh \
    --assume-role-policy-document "file://${WORKDIR}/trust-policy.json" >/dev/null
  echo "    Created role."
fi

aws iam tag-role \
  --role-name "${ROLE_NAME}" \
  --tags Key=Project,Value=OneHook Key=Component,Value=Frontend Key=Environment,Value="${STAGE}" Key=ManagedBy,Value=setup-aws-oidc.sh

aws iam put-role-policy \
  --role-name "${ROLE_NAME}" \
  --policy-name "CDKDeployLeastPrivilege" \
  --policy-document "file://${WORKDIR}/least-privilege-policy.json"

echo "    Applied exact CDK bootstrap-role policy."

ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

if [ "${SKIP_GH}" = "1" ]; then
  echo "==> SKIP_GH=1; not changing GitHub environment configuration."
else
  echo "==> Ensuring GitHub environment ${STAGE} exists..."
  gh auth status --hostname github.com >/dev/null
  if ! gh api "repos/${REPO}/environments/${STAGE}" >/dev/null 2>&1; then
    gh api --method PUT "repos/${REPO}/environments/${STAGE}" >/dev/null
    echo "    Created environment ${STAGE}."
  else
    echo "    Existing environment ${STAGE}; protection rules left unchanged."
  fi

  printf '%s' "${ROLE_ARN}" | gh secret set AWS_ROLE_ARN --repo "${REPO}" --env "${STAGE}"
  echo "    Set ${STAGE} environment secret AWS_ROLE_ARN."
fi

echo ""
echo "Configured ${STAGE}: ${ROLE_ARN}"
