
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { Resend } = require("resend");

const app = express();

// -------------------------------------
// CORS CONFIGURATION
// -------------------------------------

const allowedOrigins = [
  "http://localhost:3000",
  "https://depfront.vercel.app",
  "https://bulkmail-e5cvceq5h-noorthowfiq-ux1.vercel.app",
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests without an Origin header, such as server-to-server
      // requests, are allowed. Browser origins must be listed above.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.warn("CORS blocked origin:", origin);
      return callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));

// -------------------------------------
// CONFIGURATION
// Set these in Render > Environment.
// -------------------------------------

const MONGODB_URI = process.env.MONGODB_URI;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// -------------------------------------
// DATABASE
// -------------------------------------

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

// -------------------------------------
// HEALTH CHECK
// -------------------------------------

app.get("/", (req, res) => {
  res.status(200).send("BulkMail Backend is running successfully!");
});

// -------------------------------------
// PROCESS CAMPAIGN
// -------------------------------------

async function processCampaign(campaignId) {
  let campaign;

  try {
    campaign = await Campaign.findById(campaignId);

    if (!campaign) {
      console.error("Campaign not found:", campaignId);
      return;
    }

    campaign.status = "sending";
    campaign.error = "";
    await campaign.save();

    console.log("Processing campaign:", campaignId);

    for (const recipient of campaign.recipients) {
      try {
        const { data, error } = await resend.emails.send({
          from: `BulkMail <${FROM_EMAIL}>`,
          to: [recipient],
          subject: "You get Text Message from Your App!",
          text: campaign.message,
        });

        if (error) {
          throw new Error(
            error.message || "Resend failed to accept the email."
          );
        }

        console.log("Email accepted by Resend for:", recipient);
        console.log("Resend email ID:", data?.id);

        campaign.sentCount += 1;
        await campaign.save();
      } catch (error) {
        console.error(
          "Email sending failed for:",
          recipient,
          error.message
        );

        campaign.status = "failed";
        campaign.error = error.message || "Email sending failed.";
        await campaign.save();
        return;
      }
    }

    campaign.status = "sent";
    campaign.error = "";
    await campaign.save();

    console.log("Campaign completed:", campaignId);
  } catch (error) {
    console.error("Campaign processing error:", error.message);

    if (campaign) {
      try {
        campaign.status = "failed";
        campaign.error =
          error.message || "Unknown campaign processing error.";
        await campaign.save();
      } catch (dbError) {
        console.error("Could not update campaign:", dbError.message);
      }
    }
  }
}

// -------------------------------------
// CREATE CAMPAIGN
// -------------------------------------

app.post("/sendemail", async (req, res) => {
  try {
    const emailMessage = req.body.msg ?? req.body.message;
    const emailList = req.body.emailList;

    if (
      typeof emailMessage !== "string" ||
      !emailMessage.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Email message is empty or missing.",
      });
    }

    if (!Array.isArray(emailList) || emailList.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No recipients provided.",
      });
    }

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
        success: false,
        message: "No valid email addresses were provided.",
      });
    }

    if (!resend) {
      console.error("RESEND_API_KEY is not configured.");

      return res.status(500).json({
        success: false,
        message: "Email service is not configured.",
      });
    }

    const campaign = await Campaign.create({
      message: emailMessage.trim(),
      recipients,
      recipientCount: recipients.length,
      sentCount: 0,
      status: "pending",
      error: "",
    });

    console.log("Campaign created:", campaign._id);

    res.status(202).json({
      success: true,
      message:
        "Campaign queued. Check campaign history for its sending status.",
      campaignId: campaign._id,
      recipientCount: campaign.recipientCount,
      sentCount: 0,
      status: "pending",
    });

    // Process emails after returning the HTTP response.
    setImmediate(() => {
      processCampaign(campaign._id).catch((error) => {
        console.error("Unexpected campaign error:", error.message);
      });
    });
  } catch (error) {
    console.error("Unable to create campaign:", error.message);

    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: "Unable to create the email campaign.",
      });
    }
  }
});

// -------------------------------------
// CAMPAIGN HISTORY
// -------------------------------------

app.get("/campaigns", async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .select("-__v");

    return res.status(200).json(campaigns);
  } catch (error) {
    console.error("Error fetching campaign history:", error.message);

    return res.status(500).json({
      message: "Unable to fetch campaign history.",
    });
  }
});

// -------------------------------------
// START SERVER
// -------------------------------------

async function startServer() {
  try {
    if (!MONGODB_URI) {
      throw new Error("Missing MONGODB_URI environment variable");
    }

    if (!RESEND_API_KEY) {
      throw new Error("Missing RESEND_API_KEY environment variable");
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