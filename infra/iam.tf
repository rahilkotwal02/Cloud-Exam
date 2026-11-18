data "aws_iam_policy_document" "assume_ec2" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "web" {
  name_prefix        = "examcloud-web-"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
}

data "aws_iam_policy_document" "web" {
  statement {
    sid       = "ReadSecrets"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_db_instance.db.master_user_secret[0].secret_arn, aws_secretsmanager_secret.app.arn]
  }
  statement {
    sid       = "ReadAppBundle"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.data.arn}/artifacts/*"]
  }
  statement {
    sid       = "WriteExports"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.data.arn}/exports/*"]
  }
  statement {
    sid       = "SendResultEmail"
    actions   = ["ses:SendEmail", "ses:SendRawEmail"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "web" {
  name   = "examcloud-web-access"
  role   = aws_iam_role.web.id
  policy = data.aws_iam_policy_document.web.json
}

# Session Manager gives shell access without opening SSH
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.web.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "web" {
  name_prefix = "examcloud-web-"
  role        = aws_iam_role.web.name
}
