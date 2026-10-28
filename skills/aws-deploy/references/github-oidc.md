# GitHub Actions → AWS with OIDC (no access keys)

The workflow asks GitHub for a short-lived OIDC token, AWS STS trades it for temporary
credentials of one IAM role, and the role's policy says exactly what the deploy may
touch. No `AWS_ACCESS_KEY_ID` is ever stored in GitHub. Proven on saa.quannh.xyz.

```
job (id-token: write) ──OIDC token──▶ STS AssumeRoleWithWebIdentity ──▶ role <slug>-github-deploy
                                         checks aud + sub in the trust policy
```

## 1. The identity provider — once per AWS account

Check first; a second one fails with `EntityAlreadyExists`:

```bash
aws iam list-open-id-connect-providers   # look for token.actions.githubusercontent.com
```

Create only if missing:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com
```

In Terraform, a provider shared by several projects is **read, never created** — then no
project's `destroy` can delete it from under the others:

```hcl
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}
```

## 2. The `sub` the role must match — check it, don't assume it

Default format: `repo:<owner>/<repo>:ref:refs/heads/main`. Some repos (all of them, on
accounts that opted in) use GitHub's **immutable** format with numeric ids:
`repo:<owner>@<owner_id>/<repo>@<repo_id>:ref:refs/heads/main`. Ask GitHub:

```bash
gh api repos/<owner>/<repo>/actions/oidc/customization/sub
```

What changes the `sub`:

| Job has | `sub` ends with |
|---|---|
| push to a branch | `:ref:refs/heads/<branch>` |
| `environment: production` | `:environment:production` — **not** the ref any more |
| a pull_request trigger | `:pull_request` |
| a tag push | `:ref:refs/tags/<tag>` |

Pin to main with `StringEquals`. Use `StringLike` with a wildcard only when you
deliberately allow more (e.g. `...:ref:refs/heads/release/*`). Never trust only `aud` —
that lets **any** repo on GitHub assume the role.

## 3. Role + trust policy (Terraform)

```hcl
data "aws_iam_policy_document" "github_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Only pushes to main of this repo. The prefix comes from step 2.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${var.github_oidc_sub_prefix}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "<slug>-github-deploy"
  description        = "GitHub Actions deploy for <owner>/<repo>"
  assume_role_policy = data.aws_iam_policy_document.github_trust.json
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json   # per option, below
}

output "deploy_role_arn" { value = aws_iam_role.github_deploy.arn }
```

## 4. What the role may do — least privilege per option

| Option | Statements (resources scoped to this project's ARNs) |
|---|---|
| A. S3 + CloudFront | `s3:ListBucket` on the bucket; `s3:PutObject`, `s3:DeleteObject` on `bucket/*`; `cloudfront:CreateInvalidation` on the distribution ARN |
| B. Lambda code from CI | `lambda:UpdateFunctionCode`, `lambda:GetFunctionConfiguration` (for `aws lambda wait`) on the function ARN; add `lambda:PublishVersion`, `lambda:UpdateAlias` if you use aliases |
| C/D. EC2 over SSM Run Command | `ssm:SendCommand` on the instance ARN **and** on `arn:aws:ssm:<region>::document/AWS-RunShellScript`; `ssm:GetCommandInvocation`, `ssm:ListCommandInvocations` (`*`) |
| Read build-time params | `ssm:GetParameter(s)` on `parameter/<slug>/<env>/build/*` — see `ssm-parameters.md` |

No `iam:*`, no `*` resources for writes. Terraform itself is applied by hand with a
separate, broader IAM user (`<slug>-terraform`), not by this role.

## 5. Workflow

```yaml
permissions:
  id-token: write   # GitHub OIDC token, exchanged for the deploy role
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: <region>
      - run: aws sts get-caller-identity   # first run: proves the trust policy
```

`permissions:` at workflow or job level replaces the defaults — list `contents: read`
too, or checkout of a private repo fails. Store the role ARN as a secret (or a variable;
it is not secret, just account-identifying).

## Errors and what they mean

| Error | Cause |
|---|---|
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | `sub` mismatch (immutable format, `environment:` set, wrong branch) or the provider ARN in the trust policy is from another account. Print the claim: decode the token in a debug step, or read the trust policy beside `gh api .../oidc/customization/sub` |
| `Credentials could not be loaded` / no `ACTIONS_ID_TOKEN_REQUEST_URL` | `id-token: write` missing — on the job, or a reusable workflow's caller didn't grant it |
| `AccessDenied` on a later call | Trust worked; the role's permission policy is missing that action/resource |
