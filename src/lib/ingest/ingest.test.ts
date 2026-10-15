import { describe, expect, it } from "vitest";
import { normalizeMerchant } from "./merchant";
import { normalizeSender, normalizeSmsBody, senderMatches } from "./normalize";
import { parseMessage } from "./parsers";
import { detectOtp, luhnValid, maskCardNumbers } from "./security";

describe("normalizeSmsBody", () => {
  it("normalizes digits and letters, strips markdown asterisks but keeps card masks", () => {
    expect(normalizeSmsBody("*بانک تجارت* \nکارت: ۶۲۱۹****۴۰۱۲۳۴\nخريد  شتابي")).toBe(
      "بانک تجارت\nکارت: 6219****401234\nخرید شتابی",
    );
  });
  it("drops empty lines and bidi marks", () => {
    expect(normalizeSmsBody("a\r\n\r\n‏b‌ c")).toBe("a\nb c");
  });
});

describe("senders", () => {
  it("normalizes and matches with country-code tolerance", () => {
    expect(normalizeSender("Bank Mellat")).toBe("bankmellat");
    expect(senderMatches("Bank Mellat", "bank mellat")).toBe(true);
    expect(senderMatches("+98986715000", "986715000")).toBe(true);
    expect(senderMatches("0098986715000", "986715000")).toBe(true);
    expect(senderMatches("TejaratBank", "Bank Mellat")).toBe(false);
    expect(senderMatches("5000", "986715000")).toBe(false); // too short for suffix matching
    expect(senderMatches("", "986715000")).toBe(false);
  });
});

describe("OTP detection", () => {
  it.each([
    "رمز پویا: 123456",
    "رمز دوم شما 99887766",
    "کد تأیید: 4821",
    "کد ورود به اینترنت بانک 12345",
    "Your verification code is 1234",
    "password: 9988",
    "۴۸۲۱۹۳",
  ])("flags %j", (body) => expect(detectOtp(body).isOtp).toBe(true));
  it.each([
    "بانک سپه\nواريز:166,000,000ريال\nمانده:300,650,000\nدستورپرداخت وارده پل کدپيگيري 1405062212331089",
    "حساب1029384756\nبرداشت5,001,000\nمانده294,607,975\n05/07/23-17:37",
    "رمزارز",
  ])("does not flag transactions %#", (body) => expect(detectOtp(body).isOtp).toBe(false));
});

describe("card masking", () => {
  it("validates Luhn", () => {
    expect(luhnValid("6037991234567893")).toBe(true);
    expect(luhnValid("1405062212331089")).toBe(false);
  });
  it("masks Luhn-valid 16-digit numbers in any grouping, keeps tracking codes and masks", () => {
    expect(maskCardNumbers("کارت 6037991234567893 خرید").text).toBe("کارت ****7893 خرید");
    expect(maskCardNumbers("6037-9912-3456-7893").text).toBe("****7893");
    expect(maskCardNumbers("6037 9912 3456 7893").masked).toBe(1);
    expect(maskCardNumbers("کدپیگیری 1405062212331089").masked).toBe(0);
    expect(maskCardNumbers("6219****401234").masked).toBe(0);
  });
});

describe("normalizeMerchant", () => {
  it.each([
    ["SNAPP*RIDE 12345678", "Snapp Ride"],
    ["فروشگاه رفاه ۱۲۳۴۵۶", "فروشگاه رفاه"],
    ["  Digikala - terminal 445566 ", "Digikala"],
    ["کافه لمیز ترمینال: 99881", "کافه لمیز"],
    ["123456", null],
    ["", null],
  ])("%j → %j", (raw, out) => expect(normalizeMerchant(raw)).toBe(out));
});

describe("parser edge cases", () => {
  const receivedAt = new Date("2026-10-15T12:00:00+03:30");
  it("converts Toman amounts to Rial", () => {
    expect(parseMessage("واریز: 50,000 تومان\nمانده: 80,000 تومان", { receivedAt })?.amountRial).toBe(500_000);
  });
  it("falls back to received time when the message has no date", () => {
    const r = parseMessage("بانک سپه\nبرداشت: 10,000\nمانده:5,000", { receivedAt });
    expect(r?.occurredAt.toISOString()).toBe(receivedAt.toISOString());
    expect(r?.occurredAtSource).toBe("received");
  });
  it("handles compact MMDD dates next to a time", () => {
    const r = parseMessage("بانک سپه\nبرداشت: 10,000\n0723-11:05", { receivedAt });
    expect(r?.occurredAt.toISOString()).toBe(new Date("2026-10-15T11:05:00+03:30").toISOString());
  });
  it("refund keywords win over purchase keywords", () => {
    expect(parseMessage("بانک ملت\nبرگشت خرید: 120,000\n1405/07/23 10:00", { receivedAt })?.type).toBe("refund");
  });
  it("penalizes dates far from the received time", () => {
    const r = parseMessage("بانک سپه\nبرداشت: 10,000\nحساب: 123456789\nمانده: 5\n1401/01/10 10:00", { receivedAt });
    expect(r!.confidence).toBeLessThan(0.9);
  });
  it("uses bank hints from matched cards", () => {
    expect(parseMessage("برداشت5,000\nمانده1,000\n05/07/23-10:00", { receivedAt, bankHints: ["mellat"] })?.bank).toBe(
      "mellat",
    );
  });
});
