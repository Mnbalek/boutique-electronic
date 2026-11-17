export type PaymentMode = "mock" | "sandbox" | "production";

function hasKkiapaySandboxCredentials() {
  return ["KKIAPAY_PUBLIC_KEY", "KKIAPAY_PRIVATE_KEY", "KKIAPAY_SECRET_KEY"]
    .every((key) => Boolean(process.env[key]?.trim()));
}

export function getPaymentMode(): PaymentMode {
  const value = process.env.PAYMENT_MODE ?? "mock";
  if (value !== "mock" && value !== "sandbox" && value !== "production") {
    throw new Error("PAYMENT_MODE doit valoir mock, sandbox ou production.");
  }
  // Keep the demo usable until all test credentials are configured. As soon as
  // they exist, sandbox becomes active; production never falls back to mock.
  if (value === "sandbox" && !hasKkiapaySandboxCredentials()) return "mock";
  return value;
}
