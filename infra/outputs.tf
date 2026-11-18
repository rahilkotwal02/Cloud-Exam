output "app_url" {
  description = "Open this in a browser (allow 3-5 minutes after apply for instances to boot)"
  value       = "${local.https_enabled ? "https" : "http"}://${aws_lb.app.dns_name}"
}
output "admin_email" {
  value = "admin@examcloud.local"
}
output "admin_password" {
  description = "Show with: terraform output -raw admin_password"
  value       = random_password.admin.result
  sensitive   = true
}
output "s3_bucket" {
  value = aws_s3_bucket.data.id
}
output "rds_endpoint" {
  value = aws_db_instance.db.address
}
output "autoscaling_group" {
  value = aws_autoscaling_group.web.name
}
output "dashboard_url" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards:name=ExamCloud"
}
