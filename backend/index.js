
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const app = express();

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://depfront.vercel.app",
    "https://bulkmail-two-theta.vercel.app"
  ],
};

app.use(cors(corsOptions));
app.use(express.json());
app.get("/", (req, res) => {
  res.send("BulkMail Backend is running successfully!");
});
const MONGODB_URI =
  "mongodb+srv://BULKMAIL-:IQ37UPFEmEU2m62V@mailshot.s8ilzmw.mongodb.net/bulkmail";

mongoose.connection.on("connected", () => {
  console.log("MongoDB Connected Successfully");
});

mongoose.connection.on("error", (error) => {
  console.error("MongoDB Error:", error.message);
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
    enum: ["pending", "sent", "failed"],
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

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "laugherlaugher9@gmail.com",
    pass: "kiym zgco qfkr isnu",
  },
});

const emailTemplate = (message, recipient) => ({
  from: "laugherlaugher9@gmail.com",
  to: recipient,
  subject: "You get Text Message from Your App!",
  text: message,
});

const sendMails = async (message, emailList, campaign) => {
  for (const recipient of emailList) {
    const mailOptions = emailTemplate(message, recipient);

    const info = await transporter.sendMail(mailOptions);

    console.log("Email sent to:", recipient);
    console.log("Message ID:", info.messageId);

    campaign.sentCount += 1;
    await campaign.save();
  }
};

app.post("/sendemail", async (req, res) => {
  let campaign = null;

  try {
    const emailMessage = req.body.msg ?? req.body.message;
    const emailList = req.body.emailList;

    console.log("Received message:", emailMessage);
    console.log("Received recipients:", emailList);

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

    campaign = await Campaign.create({
      message: emailMessage.trim(),
      recipients: emailList,
      recipientCount: emailList.length,
      sentCount: 0,
      status: "pending",
    });

    await sendMails(
      emailMessage.trim(),
      emailList,
      campaign
    );

    campaign.status = "sent";
    campaign.error = "";
    await campaign.save();

    return res.status(200).json({
      success: true,
      message: "Emails sent successfully.",
      campaignId: campaign._id,
      recipientCount: campaign.recipientCount,
      sentCount: campaign.sentCount,
    });
  } catch (error) {
    console.error("Error sending emails:", error);

    if (campaign) {
      try {
        campaign.status = "failed";
        campaign.error = error.message || "Unknown error";
        await campaign.save();
      } catch (dbError) {
        console.error(
          "Could not update campaign:",
          dbError.message
        );
      }
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to send emails.",
      campaignId: campaign ? campaign._id : undefined,
    });
  }
});

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

async function startServer() {
  try {
    await mongoose.connect(MONGODB_URI);

    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`Server Started on port ${PORT}`);
    });
  } catch (error) {
    console.error(
      "MongoDB connection failed:",
      error.message
    );
    process.exit(1);
  }
}

startServer();