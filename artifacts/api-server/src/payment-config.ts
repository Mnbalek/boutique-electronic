export type PaymentMode = "mock" | "sandbox" | "production";

export function getPaymentMode(): PaymentMode {
  const value = process.env.PAYMENT_MODE ?? "mock";
  if (value !== "mock" && value !== "sandbox" && value !== "production") {
    throw new Error("PAYMENT_MODE doit valoir mock, sandbox ou production.");
  }
  if (process.env.NODE_ENV === "production" && value === "mock") {
    throw new Error("Le mode de paiement mock est interdit en production.");
  }
  return value;
}
