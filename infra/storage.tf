resource "aws_s3_bucket" "data" {
  bucket_prefix = "examcloud-"
  force_destroy = true # lets `terraform destroy` empty the bucket
  tags          = { Name = "examcloud-data" }
}

resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    id     = "expire-old-exports"
    status = "Enabled"
    filter { prefix = "exports/" }
    expiration { days = 90 }
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

# The application is zipped from ../app and published to S3; instances download it at boot.
data "archive_file" "app" {
  type        = "zip"
  source_dir  = "${path.module}/../app"
  output_path = "${path.module}/app.zip"
  excludes    = ["node_modules", ".env"]
}

resource "aws_s3_object" "app" {
  bucket = aws_s3_bucket.data.id
  key    = "artifacts/app.zip"
  source = data.archive_file.app.output_path
  etag   = data.archive_file.app.output_md5
}
