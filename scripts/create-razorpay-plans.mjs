import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const plans = [
  {
    id: "cloudx_30",
    name: "CloudX 30",
    amount: 5000,
  },
  {
    id: "cloudx_100",
    name: "CloudX 100",
    amount: 59900,
  },
  {
    id: "cloudx_200",
    name: "CloudX 200",
    amount: 109900,
  },
  {
    id: "cloudx_1tb",
    name: "CloudX 1TB",
    amount: 499900,
  },
];

for (const plan of plans) {
  const result = await razorpay.plans.create({
    period: "yearly",
    interval: 1,
    item: {
      name: plan.name,
      amount: plan.amount,
      currency: "INR",
      description: `${plan.name} yearly CloudX storage plan`,
    },
  });

  console.log(`${plan.id} = ${result.id}`);
}