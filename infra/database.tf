resource "aws_db_subnet_group" "db" {
  name_prefix = "examcloud-"
  subnet_ids  = aws_subnet.private[*].id
  tags        = { Name = "examcloud-db-subnets" }
}

resource "aws_db_instance" "db" {
  identifier        = "examcloud-db"
  engine            = "mysql"
  engine_version    = "8.0"
  instance_class    = var.db_instance_class
  allocated_storage = 20
  storage_type      = "gp3"
  storage_encrypted = true

  db_name  = "examcloud"
  username = "examadmin"
  # RDS generates the password and keeps it in Secrets Manager. It never appears in code.
  manage_master_user_password = true

  db_subnet_group_name    = aws_db_subnet_group.db.name
  vpc_security_group_ids  = [aws_security_group.db.id]
  publicly_accessible     = false
  multi_az                = var.db_multi_az
  backup_retention_period = var.db_backup_days

  auto_minor_version_upgrade = true
  skip_final_snapshot        = true # demo setting; use a final snapshot in production
  deletion_protection        = false
  apply_immediately          = true
  tags                       = { Name = "examcloud-db" }
}

# Application secrets (JWT signing key and first admin password)
resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "admin" {
  length  = 16
  special = false
}

resource "aws_secretsmanager_secret" "app" {
  name_prefix             = "examcloud/app-"
  recovery_window_in_days = 0 # delete immediately on destroy so re-deploys do not clash
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    jwt_secret     = random_password.jwt.result
    admin_password = random_password.admin.result
  })
}
