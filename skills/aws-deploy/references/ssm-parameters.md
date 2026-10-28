# SSM Parameter Store — config and secrets

One place for every environment value, read by whoever needs it through IAM: the EC2
instance role, the Lambda role, or the GitHub deploy role. Nothing secret sits in the
repo, in Terraform state, in GitHub secrets, or on a laptop after setup.

**Not run end to end on a project yet** — verify on first use and fold the lessons back.

## Parameter Store or Secrets Manager

| | Parameter Store (Standard) | Secrets Manager |
|---|---|---|
| Price | free (10,000 params, 4 KB each) | ~$0.40 / secret / month + API calls |
| Encryption | `SecureString` with `aws/ssm` key, free | always KMS |
| Rotation | none | built-in (RDS etc.) |

Default to **Parameter Store**. Pick Secrets Manager only when something must rotate
automatically (an RDS master password managed by AWS).

## Layout

```
/<slug>/<env>/backend/APP_KEYS          SecureString
/<slug>/<env>/backend/DATABASE_URL      SecureString
/<slug>/<env>/frontend/STRAPI_API_TOKEN SecureString
/<slug>/<env>/build/NEXT_PUBLIC_SITE_URL String    ← read by CI at build time
```

The last path segment **is** the env var name, so a whole folder renders straight into
an env file. One folder per consumer keeps IAM simple: each role gets one path.

## Writing values — from the local machine, never through Terraform

Terraform would store the value in its state (committed, in some projects). Create the
values with the CLI; let Terraform only grant access to the path.

```bash
P=/<slug>/prod/backend
aws ssm put-parameter --name "$P/APP_KEYS" --type SecureString --value "$(openssl rand -base64 32)" --overwrite
aws ssm put-parameter --name "$P/DATABASE_URL" --type SecureString --value file://db-url.txt --overwrite
rm -f db-url.txt
```

`file://` keeps a value out of shell history. `--overwrite` updates; without it a second
put fails with `ParameterAlreadyExists`. Values are single-line (see the render script).

If Terraform must own the parameter (e.g. to tag it), give it a placeholder and stop
watching the value:

```hcl
resource "aws_ssm_parameter" "app_keys" {
  name  = "/<slug>/prod/backend/APP_KEYS"
  type  = "SecureString"
  value = "set-by-hand"
  lifecycle { ignore_changes = [value] }
}
```

## Reading — IAM for each consumer

```hcl
data "aws_iam_policy_document" "read_backend_params" {
  statement {
    actions = ["ssm:GetParametersByPath", "ssm:GetParameters", "ssm:GetParameter"]
    # GetParametersByPath is authorised on the path itself, GetParameter on each name.
    resources = [
      "arn:aws:ssm:<region>:<account>:parameter/<slug>/prod/backend",
      "arn:aws:ssm:<region>:<account>:parameter/<slug>/prod/backend/*",
    ]
  }
}
```

With the default `aws/ssm` key no `kms:Decrypt` statement is needed. With a
customer-managed key, add `kms:Decrypt` on that key ARN.

### EC2 (options C/D) — render env files on the box

The instance needs an **instance profile** whose role has the policy above (plus
`AmazonSSMManagedInstanceCore` if you deploy over SSM Run Command). AL2023 ships the AWS
CLI. `/usr/local/bin/render-env`:

```bash
#!/usr/bin/env bash
# Usage: render-env <ssm-path> <env-file>   e.g. render-env /<slug>/prod/backend /opt/<slug>/backend.env
# Writes NAME=value lines from every parameter under the path. Values must be single-line.
set -euo pipefail
path=$1 out=$2 tmp=$(mktemp)
aws ssm get-parameters-by-path --path "$path" --recursive --with-decryption \
  --query 'Parameters[].[Name,Value]' --output text |
while IFS=$'\t' read -r name value; do printf '%s=%s\n' "${name##*/}" "$value"; done > "$tmp"
[ -s "$tmp" ] || { echo "no parameters under $path — keeping the old $out"; rm -f "$tmp"; exit 1; }
install -m 600 "$tmp" "$out" && rm -f "$tmp"
```

Call it in the deploy step before `docker compose up` / `pm2 reload`, so a changed
parameter ships with the next deploy. The empty-result guard matters: a typo in the path
must not blank out a working env file.

Render on the **host** and hand the file to the container (`env_file:`). Containers then
need no AWS credentials, and whether they can reach the instance metadata service
(IMDSv2 hop limit) stops mattering.

### Lambda (option B) — fetch once per cold start

Two ways:

1. **Resolve at deploy into env vars** — simplest, but anyone with
   `lambda:GetFunctionConfiguration` reads the plaintext in the console. OK for
   non-secret config.
2. **Fetch in code, cache in module scope** — for real secrets:

```js
import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
let config; // survives warm invocations

async function loadConfig() {
  if (config) return config;
  const out = {};
  let NextToken;
  do {
    const res = await ssm.send(new GetParametersByPathCommand({
      Path: process.env.PARAM_PATH, WithDecryption: true, Recursive: true, NextToken,
    }));
    for (const p of res.Parameters) out[p.Name.split('/').pop()] = p.Value;
    NextToken = res.NextToken;
  } while (NextToken);
  return (config = out);
}
```

`PARAM_PATH=/<slug>/prod/api` is the only env var. A changed value reaches new cold
starts; force it everywhere with any config update (`aws lambda update-function-configuration`
with the same env) or a deploy. The AWS "Parameters and Secrets Lambda Extension" layer
does the same with a local cache over HTTP — worth it only when several runtimes share it.

### GitHub Actions — build-time values

The deploy role (OIDC) reads `/<slug>/<env>/build/*` only. `SecureString` values are
masked before they can hit a log; plain `String`s (public URLs) are not — masking a
domain everywhere makes logs unreadable, and those values ship to browsers anyway.

```yaml
- name: Load build config
  run: |
    aws ssm get-parameters-by-path --path /<slug>/prod/build --with-decryption \
      --query 'Parameters[].[Name,Type,Value]' --output text |
    while IFS=$'\t' read -r name type value; do
      [ "$type" = SecureString ] && echo "::add-mask::$value"
      echo "${name##*/}=$value" >> "$GITHUB_ENV"
    done
```

Never feed real secrets to a build: they end up in the bundle or the image layers.
