variable "region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1"
}
variable "instance_type" {
  description = "EC2 instance type for web servers (t3.micro is free-tier eligible in most regions)"
  type        = string
  default     = "t3.micro"
}
variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
}
variable "db_multi_az" {
  description = "Standby database in a second AZ (recommended for production, doubles DB cost)"
  type        = bool
  default     = false
}
variable "db_backup_days" {
  description = "Automated backup retention. Some free-plan accounts only allow 0 or 1."
  type        = number
  default     = 1
}
variable "asg_min" {
  type    = number
  default = 2
}
variable "asg_desired" {
  type    = number
  default = 2
}
variable "asg_max" {
  type    = number
  default = 4
}
variable "cpu_target" {
  description = "Average CPU % that Auto Scaling tries to hold"
  type        = number
  default     = 50
}
variable "allowed_cidr" {
  description = "Who may reach the load balancer"
  type        = string
  default     = "0.0.0.0/0"
}
variable "certificate_arn" {
  description = "Optional ACM certificate ARN. When set, HTTPS is enabled and HTTP redirects to it."
  type        = string
  default     = ""
}
variable "alert_email" {
  description = "Optional email for CloudWatch alarm notifications"
  type        = string
  default     = ""
}
variable "ses_sender" {
  description = "Optional verified sender address for result emails (Amazon SES). Leave empty to disable."
  type        = string
  default     = ""
}
