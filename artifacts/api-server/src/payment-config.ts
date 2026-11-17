export type PaymentMode = "mock" | "sandbox" | "production";

export function getPaymentMode(): PaymentMode {
  const value = process.env.PAYMENT_MODE ?? "mock";
  if (value !== "mock" && value !== "sandbox" && value !== "production") {
    throw new Error("PAYMENT_MODE doit valoir mock, sandbox ou production.");
  }
  return value;
}
