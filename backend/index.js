const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");

const app = express();

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://depfront.vercel.app",
      "https://bulkmail-two-theta.vercel.app",
    ],
  })
);

app.use(express.json({ limit: "1mb" }));

// -------------------------------------
// CONFIGURATION
// -------------------------------------

const MONGODB_URI =
  "mongodb+srv://BULKMAIL-:IQ37UPFEmEU2m62V@mailshot.s8ilzmw.mongodb.net/bulkmail";

const GMAIL_USER = "laugherlaugher9@gmail.com";
const GMAIL_APP_PASSWORD = "kiym zgco qfkr isnu";

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
// EMAIL TRANSPORT
// -------------------------------------

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,

  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },

  // Fail relatively quickly if SMTP cannot connect.
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

// -------------------------------------
// EMAIL TEMPLATE
// -------------------------------------

function emailTemplate(message, recipient) {
  return {
    from: GMAIL_USER,
    to: recipient,
    subject: "You get Text Message from Your App!",
    text: message,
  };
}

// -------------------------------------
// BACKGROUND CAMPAIGN PROCESSOR
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

    console.log("Starting campaign:", campaignId);
    console.log("Recipient count:", campaign.recipients.length);

    for (const recipient of campaign.recipients) {
      try {
        const info = await transporter.sendMail(
          emailTemplate(campaign.message, recipient)
        );

        console.log("Email sent to:", recipient);
        console.log("Message ID:", info.messageId);

        campaign.sentCount += 1;
        await campaign.save();
      } catch (error) {
        console.error(
          "Email failed for recipient:",
          recipient,
          error.message
        );

        campaign.status = "failed";
        campaign.error = error.message || "Email delivery failed.";

        await campaign.save();
        return;
      }
    }

    campaign.status = "sent";
    campaign.error = "";
    await campaign.save();

    console.log("Campaign completed:", campaignId);
  } catch (error) {
    console.error("Campaign processing error:", error);

    if (campaign) {
      try {
        campaign.status = "failed";
        campaign.error =
          error.message || "Unknown campaign processing error.";

        await campaign.save();
      } catch (dbError) {
        console.error(
          "Unable to update campaign:",
          dbError.message
        );
      }
    }
  }
}

// -------------------------------------
// HEALTH CHECK
// -------------------------------------

app.get("/", (req, res) => {
  res.status(200).send("BulkMail Backend is running successfully!");
});

// -------------------------------------
// SEND EMAILS
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

    if (
      !Array.isArray(emailList) ||
      emailList.length === 0
    ) {
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

    const campaign = await Campaign.create({
      message: emailMessage.trim(),
      recipients,
      recipientCount: recipients.length,
      sentCount: 0,
      status: "pending",
      error: "",
    });

    console.log("Campaign created:", campaign._id);

    // Respond immediately; don't make the browser wait for SMTP.
    res.status(202).json({
      success: true,
      message:
        "Campaign accepted. Check campaign history for the final status.",
      campaignId: campaign._id,
      recipientCount: campaign.recipientCount,
      sentCount: campaign.sentCount,
      status: campaign.status,
    });

    // Continue processing after the response has been sent.
    setImmediate(() => {
      processCampaign(campaign._id).catch((error) => {
        console.error("Unexpected background error:", error);
      });
    });
  } catch (error) {
    console.error("Unable to create campaign:", error);

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
    console.error("Error fetching campaigns:", error.message);

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
    if (
      MONGODB_URI === "YOUR_NEW_MONGODB_CONNECTION_STRING" ||
      !GMAIL_USER ||
      GMAIL_USER === "YOUR_GMAIL_ADDRESS" ||
      !GMAIL_APP_PASSWORD ||
      GMAIL_APP_PASSWORD === "YOUR_NEW_GMAIL_APP_PASSWORD"
    ) {
      throw new Error(
        "Please configure the MongoDB URI and Gmail credentials."
      );
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