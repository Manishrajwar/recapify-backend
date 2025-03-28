require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const Razorpay = require("razorpay");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
const port = 5000;

// Middleware
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Initialize Razorpay Instance (Secure Keys in .env)
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// 📌 Route to Create an Order
app.post("/orders", async (req, res) => {
  try {
    const { amount } = req.body; // Get amount from frontend

    const options = {
      amount: amount, // Convert amount to paise
      currency: "INR",
      receipt: `order_rcptid_${Math.floor(Math.random() * 10000)}`,
      payment_capture: 1, // Auto capture payment
    };

    const order = await razorpay.orders.create(options);

    res.json({
      order_id: order.id,
      currency: order.currency,
      amount: order.amount,
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ error: "Error creating order" });
  }
});

// 📌 Route to Fetch Payment Details
app.get("/payment/:paymentId", async (req, res) => {
  try {
    const { paymentId } = req.params;
    const payment = await razorpay.payments.fetch(paymentId);

    if (!payment) {
      return res.status(404).json({ error: "Payment not found" });
    }

    res.json({
      status: payment.status,
      amount: payment.amount / 100, // Convert back to rupees
      currency: payment.currency,
      method: payment.method,
    });
  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ error: "Error fetching payment details" });
  }
});

// 📌 **Fetch Payments Linked to an Order**
app.get("/order-payments/:orderId", async (req, res) => {
  try {
    const { orderId } = req.params;

    console.log("orderid", orderId);
    // Fetch all payments for the given order
    const payments = await razorpay.orders.fetchPayments(orderId);

    console.log("payments", payments);

    if (!payments.items || payments.items.length === 0) {
      return res
        .status(404)
        .json({ message: "No payments found for this order." });
    }

    res.json({ payments: payments.items });
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ error: "Error fetching payments for the order" });
  }
});

app.post("/verify-payment", (req, res) => {
  try {
    const { order_id, payment_id, signature } = req.body;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(order_id + "|" + payment_id)
      .digest("hex");

    if (expectedSignature === signature) {
      return res.json({ verified: true });
    } else {
      return res
        .status(400)
        .json({ verified: false, error: "Invalid signature" });
    }
  } catch (error) {
    console.error("Payment verification error:", error.message);
    res.status(500).json({ error: "Payment verification failed" });
  }
});



// THIS IS FOR THE RAZORPAY SUBSCRIPTION MODEL 

// 🟢 1️⃣ Create a Plan (Admin Only, Test in Postman)
app.post("/createPlan", async (req, res) => {
  try {
    const { amount } = req.body; // Amount in paise (49900 = ₹499)

    const plan = await razorpay.plans.create({
      period: "yearly",
      interval: 1,
      item: {
        name: "Premium Yearly Plan",
        amount: amount,
        currency: "INR",
        description: "Yearly Subscription Plan",
      },
      notes: {
        createdBy: "Admin",
        featureSet: "Premium",
      },
    });

    res.json({ success: true, plan });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🟢 2️⃣ Create a Subscription for User
app.post("/createSubscription", async (req, res) => {
  try {
    const { plan_id } = req.body; // Plan ID from Razorpay

    const subscription = await razorpay.subscriptions.create({
      plan_id: plan_id,
      customer_notify: 1,
      quantity: 1,
      total_count: 12, // 1 Year (12 months)
      // start_at: Math.floor(Date.now() / 1000), // Start immediately
      notes: {
        user: "Subscribed via React",
      },
    });

    res.json({ success: true, subscription });
  } catch (error) {
    console.log("error" , error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🟢 3️⃣ Payment Verification (After Checkout)
app.post("/verifyPayment", async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_subscription_id, razorpay_signature } = req.body;

    const secret = process.env.RAZORPAY_KEY_SECRET;
    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(razorpay_payment_id + "|" + razorpay_subscription_id)
      .digest("hex");

    if (generated_signature === razorpay_signature) {
      res.json({ success: true, message: "Payment verified successfully" });
    } else {
      res.status(400).json({ success: false, message: "Invalid payment signature" });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 🟢 4️⃣ Webhook for Payment Status Update
app.post("/webhook", async (req, res) => {
  try {
    const secret = process.env.RAZORPAY_KEY_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    const generated_signature = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (signature === generated_signature) {
      console.log("✅ Webhook verified:", req.body);
      res.status(200).json({ success: true });
    } else {
      res.status(400).json({ success: false, message: "Invalid Webhook Signature" });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});



// Test Route
app.get("/", (req, res) => {
  res.send("Hello, Razorpay API is running!");
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
