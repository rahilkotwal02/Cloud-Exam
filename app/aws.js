// Optional AWS integrations. Both are skipped quietly when not configured,
// so the app also runs on a laptop with no AWS account.
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

function makeAws(cfg) {
  const s3 = cfg.s3Bucket ? new S3Client({ region: cfg.awsRegion }) : null;
  const ses = cfg.sesFrom ? new SESClient({ region: cfg.awsRegion }) : null;
  return {
    async saveExport(key, body) {
      if (!s3) return false;
      await s3.send(new PutObjectCommand({ Bucket: cfg.s3Bucket, Key: key, Body: body, ContentType: "text/csv" }));
      return true;
    },
    async emailResult(to, name, examTitle, score, total) {
      if (!ses) return false;
      await ses.send(new SendEmailCommand({
        Source: cfg.sesFrom,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: `Your result: ${examTitle}` },
          Body: { Text: { Data: `Hi ${name},\n\nYou scored ${score} out of ${total} in "${examTitle}".\n\n- ExamCloud` } },
        },
      }));
      return true;
    },
  };
}
module.exports = { makeAws };
