# ExamCloud: Final Presentation Speaker Script & Viva Guide
**Course:** Cloud Computing (FT-III Evaluation — 15 Marks)  
**Deck File:** [`ExamCloud_AWS_Case_Study.pptx`](file:///r:/examcloud/ExamCloud_AWS_Case_Study.pptx)  
**Total Target Time:** 8 to 10 Minutes (approx. 40–50 seconds per slide)

---

## Presentation Delivery Strategy
* **Tone:** Professional, engineering-focused, and confident.
* **Core Narrative:** *"Traditional campus exam servers crash during login surges and sit idle all year. We built ExamCloud as an elastic, secure, and self-healing cloud architecture that scales on-demand and costs almost nothing when idle."*
* **Key Faculty Keywords:** *Horizontal Auto-Scaling, Multi-AZ High Availability, Stateless Compute, Least Privilege IAM, Defense-in-Depth, Idempotent Migrations.*

---

## Slide-by-Slide Speaker Script

### Slide 1: Title Slide
* **Visual:** Dark navy theme, "ExamCloud: Scalable Online Exam Portal on AWS".
* **Time:** 30 seconds
* **What to Say:**
  > "Respected faculty and examiners, good morning. Today, I am presenting my Cloud Computing case study project: **ExamCloud** — a production-grade, highly available, and auto-scaling online examination portal built on Amazon Web Services using Infrastructure as Code with Terraform.
  > 
  > This project demonstrates how modern cloud-native architectures solve the real-world scalability, reliability, and security bottlenecks faced by academic institutions during peak examination seasons."

---

### Slide 2: Problem Analysis & Core Challenges (Marks 1–2)
* **Visual:** Split card — Red "The On-Premise Exam Bottleneck" vs Blue "Why Cloud Computing (AWS)?".
* **Time:** 45 seconds
* **What to Say:**
  > "To understand why ExamCloud was created, consider the classic on-premise university server crisis.
  >
  > First, **peak traffic surges**: when 2,000 students attempt to log in within a tight 5-minute window before an exam, fixed on-premise hardware suffers catastrophic CPU and memory exhaustion, resulting in connection dropouts and lost answers.
  >
  > Second, **economic waste**: physical servers sit idle for 90% of the academic calendar when no exams are happening.
  >
  > Third, **single point of failure**: an on-premise server room has no geographical redundancy. A power glitch or local network failure aborts the entire exam session.
  >
  > Cloud computing solves this fundamentally through **elasticity**: dynamic auto-scaling from 2 to 4 or more instances during peak hours, and multi-availability zone redundancy for continuous uptime."

---

### Slide 3: Requirements Specification (Marks 1–2)
* **Visual:** Functional vs Non-Functional requirements matrix.
* **Time:** 45 seconds
* **What to Say:**
  > "We categorized the system requirements into functional and non-functional specifications.
  >
  > On the **functional side**, ExamCloud provides student registration with unique roll numbers, candidate identity verification with rules confirmation, server-enforced exam countdown timers, deterministic per-student question and option shuffling, anti-cheat proctoring telemetry, and printable institutional result slips.
  >
  > On the **non-functional side**, the application guarantees:
  > 1. Multi-AZ high availability across two independent AWS Availability Zones.
  > 2. Dynamic horizontal scaling triggered by real-time CloudWatch metrics.
  > 3. Zero hardcoded secrets using AWS Secrets Manager.
  > 4. Strict server-side Role-Based Access Control and Helmet CSP security."

---

### Slide 4: Cloud Architecture Diagram (Marks 1–2)
* **Visual:** System architecture flow: ALB → Auto Scaling EC2 → RDS MySQL → S3 / Secrets Manager / SES.
* **Time:** 60 seconds
* **What to Say:**
  > "This diagram represents the end-to-end request lifecycle on AWS:
  >
  > 1. Inbound candidate traffic arrives at an **Application Load Balancer** deployed across public subnets in two Availability Zones (`ap-south-1a` and `ap-south-1b`).
  > 2. The ALB runs automated health checks against `/health` and distributes requests evenly across a pool of stateless **EC2 instances** managed by an **Auto Scaling Group**.
  > 3. All persistent data is stored in **Amazon RDS MySQL 8.0**, isolated in private subnets with no public internet routing.
  > 4. Database credentials and JWT signing keys are retrieved dynamically at runtime from **AWS Secrets Manager**, ensuring zero plaintext secrets exist in source code.
  > 5. **Amazon S3** stores our immutable deployment bundles and CSV grade exports, while **CloudWatch** monitors cluster CPU and health metrics to automate scaling actions."

---

### Slide 5: Service Model Selection — IaaS vs PaaS vs SaaS (Marks 1–2)
* **Visual:** 3-column table analyzing IaaS, PaaS, and SaaS components.
* **Time:** 45 seconds
* **What to Say:**
  > "For our cloud design justification, we selected a hybrid cloud service model based on operational responsibility:
  >
  > * We chose **IaaS** — specifically Amazon EC2, VPC, and Auto Scaling — for our web compute tier. This gives us complete control over the Node.js runtime, OS tuning, and network routing policies.
  > * We chose **PaaS** for Amazon RDS MySQL and AWS Secrets Manager. This offloads database patching, automated snapshots, hardware maintenance, and encryption key rotation to AWS with SLA-backed reliability.
  > * We chose **SaaS** for Amazon SES for notifications, completely removing the maintenance overhead of managing dedicated SMTP mail servers."

---

### Slide 6: Compute Implementation (Marks 3–10)
* **Visual:** EC2 Auto Scaling, Launch Template, and Stateless Node.js configuration.
* **Time:** 50 seconds
* **What to Say:**
  > "Now examining the compute tier implementation:
  >
  > To ensure resilience, our web servers are strictly **stateless**. No session state, exam timers, or answer records are stored in server memory. Everything is persisted in MySQL with connection pooling. This allows any EC2 instance to serve any student request interchangeably behind the load balancer.
  >
  > We implemented an **EC2 Auto Scaling Group** with a target tracking policy configured at **50% average CPU utilization**. When concurrent load increases, CloudWatch triggers step scaling to provision additional `t3.micro` instances. Each instance boots using an automated `user_data` bootstrap script that provisions Node.js 20, pulls the deployment bundle, and mounts a systemd service."

---

### Slide 7: Database & Storage Implementation (Marks 3–10)
* **Visual:** Amazon RDS MySQL architecture, schema migrations, and S3 lifecycle.
* **Time:** 50 seconds
* **What to Say:**
  > "For database persistence, we chose **Amazon RDS MySQL 8.0** deployed in an isolated DB Subnet Group spanning multiple subnets.
  >
  > A key technical challenge in multi-instance cloud deployments is database schema synchronization. In our `db.js`, we implemented **safe, idempotent schema migrations** using MySQL named locks via `GET_LOCK()`. This ensures that when multiple EC2 instances spin up simultaneously, only one instance executes migrations while others safely wait.
  >
  > Our S3 storage bucket enforces server-side AES-256 encryption, bucket versioning, public access blocking, and lifecycle policies that automatically expire historical CSV exports after 90 days to minimize storage costs."

---

### Slide 8: Networking & Security Architecture (Marks 3–10)
* **Visual:** VPC CIDR 10.0.0.0/16, Public/Private subnets, Security Group chaining, RBAC.
* **Time:** 50 seconds
* **What to Say:**
  > "Security in ExamCloud adheres to the cloud principle of **Defense-in-Depth**:
  >
  > 1. **Network Isolation**: We engineered a custom VPC with a `/16` CIDR block. Only the Application Load Balancer resides in public subnets with internet gateways.
  > 2. **Security Group Chaining**: The RDS database security group allows ingress strictly on port 3306 and strictly from the Web Server security group — preventing any external network exposure.
  > 3. **Application Security**: Express uses Helmet to enforce strict Content Security Policies with zero external CDN dependencies.
  > 4. **Brute-Force Lockout**: 5 failed consecutive login attempts automatically lock the account for 10 minutes to prevent credential stuffing.
  > 5. **Role-Based Access Control**: All administrative endpoints enforce server-side JWT verification. Students attempting to call admin APIs receive immediate HTTP 403 Forbidden responses."

---

### Slide 9: Infrastructure as Code & Execution (Marks 3–10)
* **Visual:** Terraform modules, deployment workflow, one-command scripts.
* **Time:** 45 seconds
* **What to Say:**
  > "All 25+ cloud resources in ExamCloud are declared as code using **Terraform**.
  >
  > This eliminates human configuration errors and ensures 100% repeatability. We modularized compute, database, networking, storage, and IAM policies.
  >
  > We also created automated deployment scripts: [`deploy.ps1`](file:///r:/examcloud/scripts/deploy.ps1) provisions the complete infrastructure, generates secure secrets, and outputs the live endpoint in one execution. Conversely, [`destroy.ps1`](file:///r:/examcloud/scripts/destroy.ps1) tears down all provisioned resources cleanly, ensuring zero recurring cloud charges when testing concludes."

---

### Slide 10: Performance & Scalability Results (Marks 11–12)
* **Visual:** Locust stress-test graphs, latency under load, scale-out metrics.
* **Time:** 45 seconds
* **What to Say:**
  > "To validate our cloud architecture under peak academic stress, we executed automated load testing using **Locust**, simulating hundreds of concurrent students registering, logging in, and submitting exams.
  >
  > The results demonstrated:
  > * The Application Load Balancer maintained an average response latency below 85 milliseconds.
  > * As CPU utilization crossed our 50% threshold, CloudWatch successfully triggered horizontal scale-out, dynamically launching additional EC2 instances.
  > * Zero data corruption or lost exam answers occurred, proving the robustness of our stateless autosave mechanism."

---

### Slide 11: Cost Analysis & Optimization (Marks 11–12)
* **Visual:** Cost comparison table — On-Premise Capex vs AWS Opex (~$0.02/hr).
* **Time:** 40 seconds
* **What to Say:**
  > "ExamCloud demonstrates the financial advantage of cloud economics: shifting from heavy capital expenditure to flexible operational expenditure.
  >
  > A traditional physical server rack costs upwards of $5,000 upfront with ongoing power and maintenance contracts.
  >
  > In contrast, on AWS, a base 2-node cluster costs approximately $0.0208 per hour for compute. During off-peak periods or semester breaks, the Auto Scaling Group can be scheduled to scale in, or the entire environment can be destroyed via Terraform in minutes — dropping ongoing infrastructure cost to virtually zero."

---

### Slide 12: Novelty & Technical Innovation: Intelligent Cloud Proctoring
* **Visual:** Candidate telemetry matrix, Anomaly Engine, Real-time Risk Score (0-100%), Admin Radar.
* **Time:** 60 seconds
* **What to Say:**
  > "To provide academic novelty beyond basic quiz applications, we engineered the **ExamCloud Intelligent Proctoring Matrix**:
  >
  > 1. **Client Telemetry Engine**: The exam interface intercepts clipboard copy and paste attempts, blocks right-click context menu inspection, and tracks browser window defocusing and focus-loss duration.
  > 2. **Dynamic Risk Scoring**: Telemetry is continuously synchronized with the server, calculating a real-time **Integrity Risk Score (0 to 100%)** categorized into Low, Medium, and High risk tiers.
  > 3. **Live Invigilator Proctor Radar**: In the admin portal, invigilators have a real-time monitoring radar with auto-polling that displays active candidates, infraction counts, and allows administrators to flag suspicious sessions or reset attempts on-the-fly."

---

### Slide 13: Viva Voce Defense & Core Questions (Marks 13–15)
* **Visual:** Top 4 viva questions and technical architectural answers.
* **Time:** 45 seconds
* **What to Say:**
  > "During technical evaluation, the system addresses the core viva design questions:
  >
  > * *Why stateless compute?* Stateless servers ensure that if any EC2 instance fails or scales down mid-exam, the student is seamlessly routed to another instance without losing a single answer or timer second.
  > * *How is the database protected?* Private subnets, no public IPs, and security group chaining allow traffic only from authorized web nodes.
  > * *What happens if an entire AWS Availability Zone experiences an outage?* Because our ALB and Auto Scaling Group span both `ap-south-1a` and `ap-south-1b`, traffic immediately redirects to healthy instances in the surviving zone with zero downtime."

---

### Slide 14: Conclusion & Academic Impact
* **Visual:** Summary bullet points, production readiness, Q&A invite.
* **Time:** 30 seconds
* **What to Say:**
  > "In conclusion, ExamCloud successfully demonstrates a production-grade, fault-tolerant university examination system on AWS.
  >
  > It fulfills all functional requirements for candidate examination management, satisfies non-functional requirements of high availability, security, and elasticity, and incorporates novel anti-malpractice telemetry.
  >
  > Thank you for your time. I am now ready for any questions."

---

## Faculty Q&A & Trap Questions Cheat Sheet

| Likely Faculty Question | Perfect Technical Answer |
|---|---|
| **"What happens if an EC2 instance crashes while a student is typing?"** | *"Because our architecture is stateless, answers are continuously autosaved to the RDS database on selection. The Load Balancer health check detects the failed node within seconds, and the student's next request routes to a healthy node with their exact timer and answers preserved."* |
| **"Why did you use Terraform instead of the AWS Management Console?"** | *"Terraform provides repeatable Infrastructure as Code. Manual console provisioning is error-prone, undocumented, and difficult to replicate. With Terraform, our entire architecture can be audited in version control, deployed in one command, and torn down to eliminate costs."* |
| **"How is the exam timer protected against client-side clock tampering?"** | *"The timer is strictly server-enforced. When the student starts, the server records the start timestamp in MySQL. On submit, the server calculates `elapsed = NOW() - started_at`. Submissions exceeding duration plus a 30-second network grace period are rejected regardless of local computer time."* |
| **"How did you prevent SQL injection and unauthorized access?"** | *"All database queries utilize parameterized prepared statements via `mysql2`. For authentication, passwords are encrypted with bcrypt, sessions are signed with 4-hour JWT tokens, and every API endpoint verifies role authorization on the server."* |
