# Kkiapay Sandbox setup

## Netlify environment

Add these variables in **Site configuration → Environment variables**. Set their scope to include **Functions** (and Builds if offered), and use the test credentials from the Kkiapay Sandbox dashboard only:

- `PAYMENT_MODE=sandbox`
- `KKIAPAY_PUBLIC_KEY`
- `KKIAPAY_PRIVATE_KEY`
- `KKIAPAY_SECRET_KEY`
- `KKIAPAY_WEBHOOK_SECRET` (the webhook hash configured in Kkiapay)

Never put the private key, secret key, or webhook hash in the repository, `netlify.toml`, frontend variables, or a browser request. Values in `netlify.toml` are build-only and are not available to Netlify Functions at runtime. The public key is returned by the API only to configure the browser widget.

After saving environment variables, trigger a fresh production deploy. When `PAYMENT_MODE=sandbox` is selected but one or more of the three API keys are missing, the backend safely keeps the payment simulation active. Once all three keys are present, the checkout switches to the Sandbox widget.

## Kkiapay webhook

Register this HTTPS URL in the Kkiapay Sandbox dashboard and subscribe to successful and failed transaction events:

`https://boutiqueelectro.netlify.app/api/payments/kkiapay/webhook`

Set the webhook's hash to the same value as `KKIAPAY_WEBHOOK_SECRET`. The endpoint checks the `x-kkiapay-secret` header, looks up the attempt using `partnerId`, and then verifies the transaction through Kkiapay's server SDK. It does not trust a webhook's success flag by itself.

## Test path

1. Sign in and complete an order with an active delivery address.
2. Select **Payer**; the Kkiapay Sandbox widget should open with the server-calculated total.
3. Use Kkiapay's published Sandbox test account/phone/card scenarios. Do not use a real customer account or send a real payment.
4. On success, the site verifies transaction ID, status, amount, partner reference, and XOF currency (when returned) server-side before confirming the order and consuming stock.
5. On refusal, the order remains unpaid and its customer can retry while its reservation is active. An amount/reference mismatch or a payment arriving after expiry is recorded for manual reconciliation and never consumes stock automatically.

For local simulation, leave `PAYMENT_MODE=mock`. Sandbox payment confirmation is never performed by the mock path or by the browser success callback alone.
