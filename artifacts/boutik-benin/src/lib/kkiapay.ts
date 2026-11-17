type KkiapaySuccess = { transactionId?: unknown; id?: unknown };
type KkiapayWindow = Window & {
  openKkiapayWidget?: (options: Record<string, unknown>) => void;
  addSuccessListener?: (callback: (response: KkiapaySuccess) => void) => void;
  addFailedListener?: (callback: (response: unknown) => void) => void;
};

type WidgetConfig = { publicKey: string; sandbox: boolean };
type WidgetPayment = {
  amount: number;
  partnerId: string;
  orderReference: string;
  customerName?: string;
  email?: string;
  phone?: string;
};

let scriptPromise: Promise<void> | undefined;
let listenersRegistered = false;
let currentResolve: ((result: { transactionId: string; success: boolean }) => void) | undefined;
let currentReject: ((error: Error) => void) | undefined;

async function loadKkiapay(config: WidgetConfig) {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.kkiapay.me/k.js";
    script.async = true;
    script.dataset.boutikKkiapay = "true";
    script.setAttribute("key", config.publicKey);
    script.setAttribute("sandbox", String(config.sandbox));
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = undefined;
      script.remove();
      reject(new Error("Le widget Kkiapay n’a pas pu être chargé. Vérifiez votre connexion puis réessayez."));
    };
    document.body.appendChild(script);
  });
  await scriptPromise;
  const sdk = window as KkiapayWindow;
  if (!sdk.openKkiapayWidget || !sdk.addSuccessListener || !sdk.addFailedListener) {
    scriptPromise = undefined;
    throw new Error("Le widget Kkiapay est indisponible. Actualisez la page puis réessayez.");
  }
  if (!listenersRegistered) {
    sdk.addSuccessListener((response) => {
      const transactionId = response?.transactionId ?? response?.id;
      if (typeof transactionId === "string" && currentResolve) {
        const resolve = currentResolve;
        currentResolve = undefined;
        currentReject = undefined;
        resolve({ transactionId, success: true });
      }
    });
    sdk.addFailedListener((response) => {
      if (currentReject) {
        const transactionId = typeof response === "object" && response !== null
          ? (response as KkiapaySuccess).transactionId ?? (response as KkiapaySuccess).id
          : undefined;
        if (typeof transactionId === "string" && currentResolve) {
          const resolve = currentResolve;
          currentResolve = undefined;
          currentReject = undefined;
          resolve({ transactionId, success: false });
          return;
        }
        const reject = currentReject;
        currentResolve = undefined;
        currentReject = undefined;
        const detail = typeof response === "string" ? response : "Le paiement a été refusé ou annulé.";
        reject(new Error(detail));
      }
    });
    listenersRegistered = true;
  }
}

export async function openKkiapayPayment(config: WidgetConfig, payment: WidgetPayment) {
  await loadKkiapay(config);
  if (currentResolve) throw new Error("Une fenêtre de paiement est déjà ouverte.");
  return new Promise<{ transactionId: string; success: boolean }>((resolve, reject) => {
    currentResolve = resolve;
    currentReject = reject;
    try {
      (window as KkiapayWindow).openKkiapayWidget!({
        amount: payment.amount,
        key: config.publicKey,
        sandbox: config.sandbox,
        position: "center",
        theme: "#08734f",
        reason: `Commande ${payment.orderReference}`,
        partnerId: payment.partnerId,
        name: payment.customerName,
        email: payment.email,
        phone: payment.phone?.replace(/\D/g, ""),
        countries: ["BJ"],
        paymentMethods: ["momo", "card"],
        paymentmethod: ["momo", "card"],
      });
    } catch (error) {
      currentResolve = undefined;
      currentReject = undefined;
      reject(error instanceof Error ? error : new Error("Impossible d’ouvrir le paiement Kkiapay."));
    }
  });
}
