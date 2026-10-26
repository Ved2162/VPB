// Disposable protocol fixtures only. Never used by application code or real PayU.
export function configureTestPayu() {
  Object.assign(process.env, { PAYU_ENABLED: 'true', PAYU_ENV: 'test', PAYU_CURRENCY: 'INR',
    PAYU_MERCHANT_KEY: 'unit-test-key', PAYU_MERCHANT_SALT: 'isolated-payu-merchant-salt', PAYU_BASE_URL: 'http://localhost:3100' });
}
