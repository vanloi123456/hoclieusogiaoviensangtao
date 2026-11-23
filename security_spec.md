# Firestore Security Specification

## 1. Data Invariants
1. A `TeacherProfile` at `/users/{userId}` can only be created by the verified Google-authenticated user (`request.auth.uid == userId`) with `role == 'teacher'`, `credits == 20` (20 daily free credits), and server timestamps (`request.time`).
2. A teacher cannot self-promote to `admin`, tamper with `createdAt`, or self-grant arbitrary `credits`; 24-hour free credit reset to `20` is strictly gated by `request.time >= lastFreeResetAt + duration.value(24, 'h')`.
3. Consuming credits must strictly deduct a positive integer (`1 <= existing().credits - incoming().credits <= 100000` — 4 credits for Không gian ảo 3D / Kho ứng dụng / Học liệu số / Thí nghiệm mô phỏng, 0 without write for Hướng dẫn, and custom `creditCost` for Ứng dụng Tiện ích), cannot result in a negative balance, and must atomically increment `usedCredits` by the exact spent amount (`existing().credits - incoming().credits`).
4. `PromoCode` documents at `/promo_codes/{codeId}` can only be created, listed, or deleted by an Admin (`vanloiphuhiep.09@gmail.com` or `/admins/{uid}`). Non-admin users cannot `list` unused promo codes.
5. Redeeming or admin-assigning a promo code must transition `/promo_codes/{codeId}` from `is_used == false` to `is_used == true` (or admin creation directly for a target teacher UID), set `used_by` and `used_at == request.time`, and update `/users/{userId}` `credits` and `lastRedeemedCode` (for teachers, strictly via atomic `get` + `getAfter` and backend verification).
6. PII (`email`) is strictly readable only by the document owner or Admin.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated read/write**: `{ uid: "u1" }` with `request.auth == null` -> `PERMISSION_DENIED`.
2. **Unverified email write**: `request.auth.token.email_verified == false` -> `PERMISSION_DENIED`.
3. **Self-promotion to Admin on create**: `/users/u1` with `{ ..., role: "admin" }` -> `PERMISSION_DENIED`.
4. **Credit inflation on create**: `/users/u1` with `{ ..., credits: 999 }` -> `PERMISSION_DENIED`.
5. **Shadow / ghost field on update**: `/users/u1` update adding `{ isVerified: true }` -> `PERMISSION_DENIED`.
6. **Self-grant credits without valid promo code**: `/users/u1` update setting `{ credits: 100 }` without atomic unused `/promo_codes/{codeId}` commit -> `PERMISSION_DENIED`.
7. **Invalid credit deduction or `usedCredits` tampering**: `/users/u1` deduction subtracting `0`, inflating credits (`incoming().credits > existing().credits`), going negative, or mismatching/decreasing `usedCredits` -> `PERMISSION_DENIED`.
8. **Spoofed timestamp**: `/users/u1` create/update with client-supplied `updatedAt != request.time` -> `PERMISSION_DENIED`.
9. **Cross-user PII read**: User `u2` calling `get` on `/users/u1` or `list` on `/users` -> `PERMISSION_DENIED`.
10. **Non-admin listing unused promo codes**: User `u1` calling `list` on `/promo_codes` -> `PERMISSION_DENIED`.
11. **Non-admin forging a promo code**: User `u1` creating `/promo_codes/FREE999` `{ credit_value: 999, is_used: false }` -> `PERMISSION_DENIED`.
12. **Double-redeem / spoofing credit_value on promo code**: User `u1` redeeming an already-used code (`is_used == true`) or adding more than `credit_value` -> `PERMISSION_DENIED`.
