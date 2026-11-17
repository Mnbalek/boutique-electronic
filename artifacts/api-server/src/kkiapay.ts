import { kkiapay } from "@kkiapay-org/nodejs-sdk";
import { getPaymentMode } from "./payment-config";

export type KkiapayTransaction = {
  transactionId?: unknown;
  status?: unknown;
  amount?: unknown;
  currency?: unknown;
  partnerId?: unknown;
  failureCode?: unknown;
  failureMessage?: unknown;
};

export function getKkiapayPublicConfig() {
  const mode = getPaymentMode();
  const publicKey = process.env.KKIAPAY_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.KKIAPAY_PRIVATE_KEY?.trim() ?? "";
  const secretKey = process.env.KKIAPAY_SECRET_KEY?.trim() ?? "";
  const sandbox = mode === "sandbox";
  return {
    mode,
    enabled: sandbox && !!publicKey && !!privateKey && !!secretKey,
    publicKey: publicKey || null,
    sandbox,
  } as const;
}

export function verifyKkiapayTransaction(transactionId: string): Promise<KkiapayTransaction> {
  const config = getKkiapayPublicConfig();
  const privatekey = process.env.KKIAPAY_PRIVATE_KEY?.trim();
  const secretkey = process.env.KKIAPAY_SECRET_KEY?.trim();
  if (!config.enabled || !privatekey || !secretkey || !config.publicKey) {
    throw new Error("Kkiapay Sandbox n’est pas configuré. Ajoutez les trois clés de test dans Netlify.");
  }
  const client = kkiapay({ publickey: config.publicKey, privatekey, secretkey, sandbox: true });
  return client.verify(transactionId) as Promise<KkiapayTransaction>;
}
