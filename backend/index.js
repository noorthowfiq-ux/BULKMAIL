
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const app = express();

// CORS configuration
const allowedOrigins = [
  "http://localhost:3000",
  "https://depfront.vercel.app",
  "https://bulkmail-two-theta.vercel.app",
  "https://bulkmail-e5cvceq5h-noorthowfiq-ux1.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn("CORS blocked origin:", origin);
      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));

// Environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// MongoDB campaign history
mongoose.connection.on("connected", () => {
  console.log("MongoDB connected successfully");
});

mongoose.connection.on("error", (error) => {
  console.error("MongoDB error:", error.message);
});

const campaignSchema = new mongoose.Schema({
  message: {
    type: String,
    required: true,
  },
  recipients: {
    type: [String],
    required: true,
  },
  recipientCount: {
    type: Number,
    default: 0,
  },
  sentCount: {
    type: Number,
    default: 0,
  },
  status: {
    type: String,
    enum: ["pending", "sending", "sent", "failed"],
    default: "pending",
  },
  error: {
    type: String,
    default: "",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Campaign = mongoose.model("Campaign", campaignSchema);

// Health check
app.get("/", (req, res) => {
  res.status(200).send("BulkMail Gmail backend is running!");
});

// Send emails using Gmail and save campaign history
app.post("/sendemail", async (req, res) => {
  let campaign;

  try {
    const { msg, emailList } = req.body;

    if (
      typeof msg !== "string" ||
      !msg.trim() ||
      !Array.isArray(emailList) ||
      emailList.length === 0
    ) {
      return res.status(400).json({
        message: "Please provide a message and recipient email list.",
      });
    }

    if (!SMTP_USER || !SMTP_PASS) {
      return res.status(500).json({
        message: "Gmail credentials are missing in Render Environment.",
      });
    }

    // Validate addresses and remove duplicates
    const recipients = [
      ...new Set(
        emailList
          .filter((email) => typeof email === "string")
          .map((email) => email.trim().toLowerCase())
          .filter((email) =>
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          )
      ),
    ];

    if (recipients.length === 0) {
      return res.status(400).json({
        message: "No valid recipient email addresses were provided.",
      });
    }

    // Limit each request
    if (recipients.length > 20) {
      return res.status(400).json({
        message: "Maximum 20 recipients per request.",
      });
    }

    // Create the campaign record before sending
    campaign = await Campaign.create({
      message: msg.trim(),
      recipients,
      recipientCount: recipients.length,
      sentCount: 0,
      status: "sending",
    });

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const failed = [];

    // Send separately to protect recipient privacy
    for (const recipient of recipients) {
      try {
        await transporter.sendMail({
          from: SMTP_USER,
          to: recipient,
          subject: "Message from BulkMail",
          text: msg.trim(),
        });

        campaign.sentCount += 1;
        await campaign.save();

        console.log("Email sent successfully to:", recipient);
      } catch (error) {
        console.error(
          "Email failed for:",
          recipient,
          error.message
        );

        failed.push(recipient);
      }
    }

    campaign.status =
      failed.length === 0 ? "sent" : "failed";

    campaign.error =
      failed.length > 0
        ? `${failed.length} email(s) failed. Check backend logs.`
        : "";

    await campaign.save();

    return res.status(200).json({
      message:
        failed.length === 0
          ? "All emails sent successfully."
          : "Sending completed with some failures.",
      campaignId: campaign._id,
      sentCount: campaign.sentCount,
      failedCount: failed.length,
      failed,
    });
  } catch (error) {
    console.error("Email sending error:", error.message);

    if (campaign) {
      try {
        campaign.status = "failed";
        campaign.error = "Campaign processing failed.";
        await campaign.save();
      } catch (dbError) {
        console.error("Campaign update failed:", dbError.message);
      }
    }

    return res.status(500).json({
      message: "Unable to send emails. Check backend logs.",
    });
  }
});

// Campaign history
app.get("/campaigns", async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .select("-__v");

    return res.status(200).json(campaigns);
  } catch (error) {
    console.error("Campaign history error:", error.message);

    return res.status(500).json({
      message: "Unable to fetch campaign history.",
    });
  }
});

// Start server
async function startServer() {
  try {
    if (!MONGODB_URI) {
      throw new Error("Missing MONGODB_URI environment variable");
    }

    await mongoose.connect(MONGODB_URI);

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`BulkMail server listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
}

startServer();