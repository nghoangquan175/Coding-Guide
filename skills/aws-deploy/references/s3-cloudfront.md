# Option A — S3 + CloudFront (static site)

```
Cloudflare DNS (CNAME, DNS only) ──▶ CloudFront (ACM cert, optional CloudFront Function) ──▶ private S3 bucket (OAC)
GitHub Actions: build ──OIDC──▶ aws s3 sync dist --delete ──▶ create-invalidation
```

Proven on saa.quannh.xyz (vanilla SPA, Terraform in `C:\PROJECT\Personal\AWS\infras`).
Cost for a small site: cents — S3 storage + CloudFront requests; the first 1,000
invalidation paths a month are free and `/*` counts as one.

Placeholders: `<slug>`, `<domain>` (e.g. `app.example.com`), `<bucket>`.

## What you need up front

- An **ACM certificate in us-east-1** covering `<domain>` (CloudFront accepts no other
  Region). Reuse a wildcard if one exists: `aws acm list-certificates --region us-east-1`.
  A new one: request with DNS validation, add the validation CNAME in Cloudflare
  **DNS only**, wait for `ISSUED`.
- A Terraform IAM user scoped to `<slug>-*` names (see `C:\PROJECT\Personal\AWS\infras\iam\`
  for a working least-privilege policy: S3 on the bucket prefix, CloudFront, KVS, ACM read,
  IAM on `role/<slug>-*`, OIDC provider read).
- What the build outputs: plain files (`dist/`), a Next.js static export (`out/`), or a
  Vite/CRA SPA. It decides the routing section below.

## Terraform

```hcl
provider "aws" {
  region  = "us-east-1"   # CloudFront certs live here; keeping everything in one Region is simplest
  profile = "<slug>"
  default_tags { tags = { Project = "<slug>" } }
}

# ---------- S3: private, owner-enforced ----------
resource "aws_s3_bucket" "site" {
  bucket = "<bucket>"     # no dots: they break HTTPS to the bucket's virtual-hosted endpoint
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

# Only this distribution may read objects.
data "aws_iam_policy_document" "site_bucket" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket     = aws_s3_bucket.site.id
  policy     = data.aws_iam_policy_document.site_bucket.json
  depends_on = [aws_s3_bucket_public_access_block.site]
}

# ---------- CloudFront ----------
data "aws_cloudfront_cache_policy" "optimized" { name = "Managed-CachingOptimized" }
data "aws_cloudfront_response_headers_policy" "security" { name = "Managed-SecurityHeadersPolicy" }

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "<slug>-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  aliases             = ["<domain>"]
  default_root_object = "index.html"
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = "PriceClass_200"   # NA, EU, Asia (covers Vietnam) — cheaper than All

  origin {
    origin_id                = "s3-site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id           = "s3-site"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = data.aws_cloudfront_cache_policy.optimized.id
    response_headers_policy_id = data.aws_cloudfront_response_headers_policy.security.id

    function_association {               # optional: host check, routing, login gate
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.edge.arn
    }
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

output "cloudflare_cname" {
  description = "Create in Cloudflare, Proxy status: DNS only (grey cloud)."
  value       = { type = "CNAME", name = "<sub>", target = aws_cloudfront_distribution.site.domain_name }
}
output "distribution_id" { value = aws_cloudfront_distribution.site.id }
output "bucket"          { value = aws_s3_bucket.site.bucket }
```

The GitHub deploy role (`github-oidc.md`) gets: `s3:ListBucket` on the bucket,
`s3:PutObject` + `s3:DeleteObject` on `bucket/*`, `cloudfront:CreateInvalidation` on the
distribution ARN.

## CloudFront Function — host check and routing

`cloudfront-js-2.0`, viewer-request, runs **before the cache** on every request:

```js
// Only the real domain serves the site; the default *.cloudfront.net name is blocked.
// Directory-style paths are rewritten to their index.html (S3 REST has no index documents).
const SITE_HOST = '__SITE_HOST__';

async function handler(event) {
  const request = event.request;
  const host = request.headers.host ? request.headers.host.value : '';
  if (host !== SITE_HOST) return { statusCode: 403, statusDescription: 'Forbidden' };

  const uri = request.uri;
  if (uri.endsWith('/')) request.uri = uri + 'index.html';
  else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) request.uri = uri + '/index.html';
  return request;
}
```

```hcl
resource "aws_cloudfront_function" "edge" {
  name    = "<slug>-edge"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = replace(file("${path.module}/edge-function.js"), "__SITE_HOST__", "<domain>")
}
```

Routing by build type:

| Build | Do |
|---|---|
| Hash routing (`#/route`) or one page | Nothing — `default_root_object` covers `/` |
| Next.js `output: "export"` | `trailingSlash: true` in `next.config`, keep the rewrite above (`/about/` → `/about/index.html`) |
| SPA with history routing (React Router, Vue) | Drop the rewrite; add `custom_error_response { error_code = 403, response_code = 200, response_page_path = "/index.html" }` (and the same for 404). Without `s3:ListBucket`, S3 answers a missing key with **403**, not 404 |

**Login gate** (private site): same function also checks a cookie against a hash in a
CloudFront KeyValueStore — the hash is written by a script, never by Terraform, so it
stays out of state. Working code: `C:\PROJECT\Personal\AWS\infras\auth-function.js`,
`site.tf`, `scripts/set-password.sh`.

## Workflow

```yaml
name: Deploy

on:
  push:
    branches: [main]
    paths-ignore: ['infras/**', '**.md']   # infra is applied by hand
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npm ci && npm run build

      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: us-east-1

      # Hashed assets: cache for a year. Everything else: revalidate with the ETag every load.
      - name: Upload to S3
        run: |
          aws s3 sync dist "s3://${{ secrets.S3_BUCKET }}" --delete --no-progress \
            --exclude "*" --include "assets/*" --include "_next/static/*" \
            --cache-control "public, max-age=31536000, immutable"
          aws s3 sync dist "s3://${{ secrets.S3_BUCKET }}" --delete --no-progress \
            --exclude "assets/*" --exclude "_next/static/*" \
            --cache-control "no-cache"

      - name: Invalidate CloudFront
        run: aws cloudfront create-invalidation --distribution-id "${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }}" --paths "/*"
```

No hashed asset folder (vanilla site)? One `sync ... --cache-control "no-cache"` is enough
— that is what saa.quannh.xyz does. `--delete` in the first sync only touches the
included paths, so the two passes don't delete each other's files.

## DNS — Cloudflare, DNS only

CNAME `<sub>` → `dxxxx.cloudfront.net`, **grey cloud**. CloudFront is already the CDN
and terminates TLS with the ACM cert; proxying through Cloudflare as well doubles the
caching layer, hides the real cache status and needs SSL mode Full (strict) to not loop.
The alias in `aliases` must match the hostname exactly, or CloudFront returns 403
(`The request could not be satisfied`).

## Verify

| Check | How |
|---|---|
| Site served | `curl -sI https://<domain>` → 200, `x-cache`, `via: ...cloudfront` |
| Bucket private | `curl -sI https://<bucket>.s3.amazonaws.com/index.html` → 403 |
| Default host blocked | `curl -sI https://dxxxx.cloudfront.net` → 403 |
| Deep link | `curl -sI https://<domain>/some/route` → 200 (per routing table above) |
| Cache headers | `curl -sI .../assets/<hash>.js` → `immutable`; `index.html` → `no-cache` |
| New deploy visible | change a string, push, reload once — no hard refresh needed |
