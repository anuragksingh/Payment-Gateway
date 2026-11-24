import { validatePaymentVerification } from "razorpay/dist/utils/razorpay-utils.js";
import razorpayInstance from "../config/razorpay.js";
import Payment from "../models/payment.routes.js";

// sending key on frontend
export const getRazorpayKey = (req, res) => {
  res.status(200).json({
    success: true,
    key: process.env.RAZORPAY_KEY_ID,
  });
};

// Order Create
export const createOrder = async (req, res) => {
  try {
    // Frontend se amount lo (agar nahi bheja to default ₹50)
    const { amount } = req.body;
    const courseAmount = amount || 50;

    // RULE: Razorpay amount ko "Paise" me leta hai
    // 1 Rupee = 100 Paise
    // ₹50 = 50 * 100 = 5000 paise
    const options = {
      amount: Number(courseAmount) * 100, // Amount in paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    };

    // A. Razorpay pe order banaya
    const order = await razorpayInstance.orders.create(options);

    // B. Database me initial order save kiya (status: 'pending')
    await Payment.create({
      orderId: order.id,
      amount: courseAmount,
      currency: order.currency,
      status: 'pending',
    });

    // C. Frontend ko order details bhej di (order.id isme hoti hai)
    res.status(200).json(order);
  } catch (error) {
    console.error('Error in createOrder:', error);
    res.status(500).json({
      success: false,
      message: 'Order create karne me error aaya',
      error: error.message,
    });
  }
};

// Payment verificatin
export const verifyPayment = async (req, res) => {
  try {
    const { razorpayOrderId, razorpayPaymentId, signature } = req.body;
    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!razorpayOrderId || !razorpayPaymentId || !signature) {
      return res.status(400).json({
        success: false,
        message: 'Order ID, Payment ID ya Signature missing hai!',
      });
    }

    // Razorpay's official utility function to validate signature
    const isAuthentic = validatePaymentVerification(
      { order_id: razorpayOrderId, payment_id: razorpayPaymentId },
      signature,
      secret
    );

    if (isAuthentic) {
      // Payment Successful! Database me update karo
      const payment = await Payment.findOne({ orderId: razorpayOrderId });

      if (payment) {
        payment.paymentId = razorpayPaymentId;
        payment.signature = signature;
        payment.status = 'completed';
        await payment.save();
      }

      return res.status(200).json({
        success: true,
        message: 'Payment verified successfully! 🎉',
      });
    } else {
      // Fake ya tampered payment! Status failed mark karo
      await Payment.findOneAndUpdate(
        { orderId: razorpayOrderId },
        { status: 'failed' }
      );

      return res.status(400).json({
        success: false,
        message: 'Invalid signature! Payment fake ya tampered ho sakti hai.',
      });
    }
  } catch (error) {
    console.error('Error in verifyPayment:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification ke waqt error aaya',
      error: error.message,
    });
  }
};

// Get all payment history
export const getAllPayments = async (req, res) => {
  try {
    const payments = await Payment.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: payments.length,
      data: payments,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};