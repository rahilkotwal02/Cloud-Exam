resource "aws_sns_topic" "alerts" {
  name_prefix = "examcloud-alerts-"
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_ses_email_identity" "sender" {
  count = var.ses_sender == "" ? 0 : 1
  email = var.ses_sender
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  alarm_name          = "examcloud-web-cpu-high"
  namespace           = "AWS/EC2"
  metric_name         = "CPUUtilization"
  dimensions          = { AutoScalingGroupName = aws_autoscaling_group.web.name }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  alarm_name          = "examcloud-unhealthy-hosts"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  dimensions          = { LoadBalancer = aws_lb.app.arn_suffix, TargetGroup = aws_lb_target_group.web.arn_suffix }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "ExamCloud"
  dashboard_body = jsonencode({
    widgets = [
      { type = "metric", x = 0, y = 0, width = 12, height = 6, properties = {
        title = "Web tier CPU (%)", region = var.region, stat = "Average", period = 60,
        metrics = [["AWS/EC2", "CPUUtilization", "AutoScalingGroupName", aws_autoscaling_group.web.name]] } },
      { type = "metric", x = 12, y = 0, width = 12, height = 6, properties = {
        title = "Instances in service", region = var.region, stat = "Average", period = 60,
        metrics = [["AWS/AutoScaling", "GroupInServiceInstances", "AutoScalingGroupName", aws_autoscaling_group.web.name]] } },
      { type = "metric", x = 0, y = 6, width = 12, height = 6, properties = {
        title = "Requests per minute", region = var.region, stat = "Sum", period = 60,
        metrics = [["AWS/ApplicationELB", "RequestCount", "LoadBalancer", aws_lb.app.arn_suffix]] } },
      { type = "metric", x = 12, y = 6, width = 12, height = 6, properties = {
        title = "Response time (s)", region = var.region, stat = "Average", period = 60,
        metrics = [["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.app.arn_suffix]] } },
    ]
  })
}
