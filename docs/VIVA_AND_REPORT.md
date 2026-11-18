# Viva questions and report outline

## Marks mapping (15)
| Marks | Where to show it |
|---|---|
| 2: Problem analysis and cloud design | README sections 1-2: requirements, architecture diagram, IaaS/PaaS/SaaS table |
| 8: Implementation | Live app URL; Terraform files; screenshots of EC2, ALB target health, ASG, RDS, S3, security groups, IAM role, Secrets Manager |
| 2: Results and evaluation | Locust report, CloudWatch dashboard during scale-out, cost table |
| 3: Viva | Questions below |

## Likely viva questions
1. **Why these services?** EC2 for control of the app runtime (IaaS), RDS to avoid managing database backups and patching (PaaS), S3 for durable cheap storage, SES so we do not run a mail server (SaaS).
2. **How does Auto Scaling work here?** CloudWatch tracks average CPU of the group. A target-tracking policy adds instances above 50% and removes them when load falls, between 2 and 4 instances.
3. **Why a load balancer?** Spreads requests across servers, removes unhealthy ones using the `/health` check, and gives one stable address.
4. **How is the database protected?** Private subnets, no public IP, security group allows MySQL only from the web servers, encrypted storage, password in Secrets Manager.
5. **Where are secrets kept?** Secrets Manager; the EC2 role may read only two secrets. Nothing sensitive is in the code or user data.
6. **What happens if a server dies?** The ALB stops sending traffic to it, the Auto Scaling group launches a replacement.
7. **What happens if an Availability Zone fails?** Servers run in two AZs so the app continues. The database needs `db_multi_az = true` for automatic failover.
8. **What breaks at 10x traffic?** The database is the first bottleneck: add read replicas, caching (ElastiCache), a larger instance class, and raise the ASG maximum.
9. **How would you reduce cost?** Scale in after exams, right-size instances, Savings Plans or Spot for web servers, schedule the group to zero overnight for a test environment.
10. **Why Terraform?** Repeatable, reviewable, one command to build and destroy; avoids manual console mistakes.
11. **IaaS vs PaaS vs SaaS?** Who manages what: IaaS you manage OS and up, PaaS you manage app and data, SaaS you only use it.
12. **How would you enable HTTPS?** Request an ACM certificate, set `certificate_arn`; the ALB terminates TLS and redirects HTTP.

## Report outline
1. Introduction and problem statement
2. Requirements (functional, non-functional)
3. Architecture and service-model justification (diagram)
4. Implementation: network, compute, database, storage, security, deployment steps (with screenshots)
5. Testing: functional tests, load test results, auto-scaling evidence
6. Cost analysis (calculator screenshot)
7. Limitations and future work (CloudFront, Multi-AZ RDS, CI/CD, WAF, Lambda for result processing)
8. Conclusion
