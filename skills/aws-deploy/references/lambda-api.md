# Option B — Lambda API (API Gateway HTTP API, or a function URL behind CloudFront)

```
B1  client ──▶ api.<domain> (API Gateway HTTP API, custom domain) ──▶ Lambda ──▶ DynamoDB / RDS / ...
B2  client ──▶ <domain>/api/* (same CloudFront as option A, OAC) ──▶ Lambda function URL ──▶ ...
```

| | B1: HTTP API | B2: function URL behind CloudFront |
|---|---|---|
| Fits | A public API, its own hostname, several clients (web + mobile) | An API only the site itself calls, same origin as option A |
| Gives you | Routes, throttling, JWT/Cognito authorizers, CORS, custom domain, access logs | Nothing extra; CloudFront Function can still gate it (login cookie) |
| CORS | Needed (different host) | Not needed (same origin) |
| Cost | $1 / million requests + Lambda | Lambda only (+ CloudFront requests) |
| Status | **Not run end to end yet** — verify on first use | Proven on saa.quannh.xyz (`C:\PROJECT\Personal\AWS\infras\api.tf`) |

Both send the **same event (payload format 2.0)** — `event.requestContext.http.method`,
`event.rawPath`, `event.body` (+ `isBase64Encoded`) — so one handler works behind either
and can move between them.

## The function (shared)

```hcl
data "archive_file" "api" {
  type        = "zip"
  source_dir  = "${path.module}/api"          # or the esbuild output folder
  output_path = "${path.module}/.build/api.zip"
}

resource "aws_iam_role" "api" {
  name = "<slug>-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = "sts:AssumeRole", Principal = { Service = "lambda.amazonaws.com" } }]
  })
}

# Create the log group yourself: retention set, and the role needs no logs:CreateLogGroup.
resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/<slug>-api"
  retention_in_days = 14
}

data "aws_iam_policy_document" "api" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.api.arn}:*"]
  }
  statement {                                  # only what the code calls, on this table
    actions   = ["dynamodb:Query", "dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.main.arn]
  }
  # + ssm:GetParametersByPath on /<slug>/prod/api — ssm-parameters.md
}

resource "aws_iam_role_policy" "api" {
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

resource "aws_lambda_function" "api" {
  function_name    = "<slug>-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]                # ~20% cheaper; native deps must be built for arm64
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 256
  timeout          = 10
  environment { variables = { TABLE_NAME = aws_dynamodb_table.main.name, PARAM_PATH = "/<slug>/prod/api" } }
  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy.api]
}
```

The Node.js runtime already contains AWS SDK v3 — `@aws-sdk/*` imports need no bundling.
Anything else: bundle with esbuild (`--bundle --platform=node --format=esm
--external:@aws-sdk/*`) into the folder `archive_file` zips.

## B1 — API Gateway HTTP API

```hcl
resource "aws_apigatewayv2_api" "api" {
  name                         = "<slug>-api"
  protocol_type                = "HTTP"
  disable_execute_api_endpoint = true          # only the custom domain answers
  cors_configuration {
    allow_origins = ["https://<domain>"]
    allow_methods = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allow_headers = ["content-type", "authorization"]
    max_age       = 3600
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

# One catch-all route: the handler does its own routing. Split into "GET /items" etc.
# when routes need different authorizers or throttling.
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_burst_limit = 50              # a cap on runaway clients and on the bill
    throttling_rate_limit  = 20
  }
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# Custom domain: a REGIONAL endpoint, so the ACM cert must be in the API's Region
# (not necessarily us-east-1 — that rule is CloudFront's).
resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = "api.<domain>"
  domain_name_configuration {
    certificate_arn = var.regional_certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }
}

resource "aws_apigatewayv2_api_mapping" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  domain_name = aws_apigatewayv2_domain_name.api.id
  stage       = aws_apigatewayv2_stage.default.id
}

output "api_cname_target" {
  value = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
}
```

DNS: CNAME `api` → `api_cname_target` (`d-xxxx.execute-api.<region>.amazonaws.com`),
**DNS only** in Cloudflare to start with. Orange-cloud works too (SSL Full strict) if you
want Cloudflare's WAF/rate limits in front — then lock the API to Cloudflare, or the
`d-xxxx` hostname bypasses it.

With `$default` route and CORS configured on the API, API Gateway answers preflight
`OPTIONS` itself — the handler must **not** add its own CORS headers, or browsers see
duplicates and reject the response.

Auth, when needed: a JWT authorizer (Cognito user pool or any OIDC issuer) on the
routes — `aws_apigatewayv2_authorizer` with `authorizer_type = "JWT"` — rather than
checking tokens inside the handler.

## B2 — function URL behind CloudFront (the saa.quannh.xyz setup)

Function URL with `authorization_type = "AWS_IAM"`, CloudFront origin with an OAC of
type `lambda`, an `ordered_cache_behavior` for `/api/*` with `Managed-CachingDisabled`
and `Managed-AllViewerExceptHostHeader` (the URL must see its own Host), and the viewer
function on that behavior too. Full working code: `C:\PROJECT\Personal\AWS\infras\api.tf`
and `site.tf`. Two things that are easy to miss:

- CloudFront needs **two** permissions on the function: `lambda:InvokeFunctionUrl` (with
  `function_url_auth_type = "AWS_IAM"`) **and** `lambda:InvokeFunction`, both with
  `principal = "cloudfront.amazonaws.com"` and `source_arn` = the distribution.
- OAC signs the request but cannot hash a body it streams: for `POST`/`PUT` the
  **browser** must send `x-amz-content-sha256: <hex sha256 of the body>`, or the call
  fails the signature check. `C:\PROJECT\Personal\AWS\public\app.js` (`sha256Hex`) does it.

## Shipping code: Terraform or CI

| Way | When |
|---|---|
| `terraform apply` by hand (`archive_file` + `source_code_hash`) | Code changes rarely, infra and code change together. What saa.quannh.xyz does |
| CI updates the code, Terraform owns the rest | Code changes often |

CI way — add to Terraform first, or the next apply rolls the code back to the old zip:

```hcl
  lifecycle { ignore_changes = [filename, source_code_hash] }   # in aws_lambda_function.api
```

```yaml
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: <region>
      - name: Deploy function
        run: |
          (cd api && npm ci --omit=dev && zip -qr ../api.zip .)
          aws lambda update-function-code --function-name <slug>-api --zip-file fileb://api.zip >/dev/null
          aws lambda wait function-updated-v2 --function-name <slug>-api
      - name: Smoke test
        run: curl -fsS https://api.<domain>/health
```

Deploy role: `lambda:UpdateFunctionCode`, `lambda:GetFunctionConfiguration`,
`lambda:GetFunction` on the function ARN only.

## Verify

| Check | How |
|---|---|
| Route works | `curl -sD - https://api.<domain>/health` |
| Default endpoint off (B1) | `curl https://<api-id>.execute-api.<region>.amazonaws.com/` → no answer / 403 |
| Direct URL refused (B2) | `curl https://<id>.lambda-url.<region>.on.aws/api/...` → 403 (unsigned) |
| CORS (B1) | `curl -si -X OPTIONS -H 'Origin: https://<domain>' -H 'Access-Control-Request-Method: POST' https://api.<domain>/x` → one `access-control-allow-origin` |
| Logs | `aws logs tail /aws/lambda/<slug>-api --since 10m --follow` |
| Cold start / memory | REPORT lines in the log: `Init Duration`, `Max Memory Used` vs `memory_size` |
