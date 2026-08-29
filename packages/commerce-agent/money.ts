import type { CommerceMoney } from "@commerce-agent/providers/types";

export type CanonicalMoney = {
  amount: string;
  currencyCode: string;
  display: string;
};

export function currencyFractionDigits(currency: string) {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

export function majorUnits(money: CommerceMoney) {
  assertCommerceMoney(money);
  return money.amountMinor / 10 ** currencyFractionDigits(money.currency);
}

export function canonicalMoney(money: CommerceMoney): CanonicalMoney {
  const digits = currencyFractionDigits(money.currency);
  const amount = majorUnits(money).toFixed(digits);
  return {
    amount,
    currencyCode: money.currency,
    display: formatCommerceMoney(money),
  };
}

export function canonicalMajorMoney(
  amount: number,
  currencyCode: string,
): CanonicalMoney {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new TypeError("Major currency amount must be a non-negative number");
  }
  const digits = currencyFractionDigits(currencyCode);
  return {
    amount: amount.toFixed(digits),
    currencyCode,
    display: new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currencyCode,
    }).format(amount),
  };
}

export function formatCommerceMoney(money: CommerceMoney, locale = "en-IN") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  }).format(majorUnits(money));
}

export function assertCommerceMoney(money: CommerceMoney) {
  if (
    !Number.isSafeInteger(money.amountMinor) ||
    money.amountMinor < 0 ||
    !/^[A-Z]{3}$/.test(money.currency)
  ) {
    throw new TypeError(
      "CommerceMoney must contain a non-negative integer amountMinor and ISO currency",
    );
  }
}
