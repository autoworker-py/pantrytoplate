/**
 * The privacy notice, and the record of which version each person accepted.
 *
 * Kept in code rather than in a database row so that changing it is a reviewed
 * commit with a date attached, and so the version a person agreed to can always
 * be reconstructed from history.
 *
 * Bumping VERSION withdraws existing consent: everyone is asked again on their
 * next visit. Only bump it for changes that alter what is collected, why, who
 * receives it, or how long it is kept — not for typos.
 */
import { env } from '../env.js';

export const PRIVACY_VERSION = '2026-10-02';
export const PRIVACY_EFFECTIVE = '2 October 2026';

/** who runs the app and how to reach them: OPERATOR_NAME and SUPPORT_EMAIL on the server */
const WHO = env.operatorName || 'its developer';
const REACH = env.supportEmail ? `email ${env.supportEmail}` : 'use the contact details on the app’s App Store page';

export const PRIVACY_POLICY = `# Privacy Notice

**Version ${PRIVACY_VERSION} · Effective ${PRIVACY_EFFECTIVE}**

This notice explains what Pantry2Plate ("the app") collects about you, why,
where it goes, and what you can make it do. It is written to be read, not to be
survived. If something here is unclear, treat that as a fault in the notice and
ask.

---

## 1. Who is responsible

Pantry2Plate is made and run by ${WHO} ("we"). We are the data controller for
everything described below. To ask about any of it, or to use any of your
rights, ${REACH}.

The people who run the app can technically read its database, as anyone running
a server can. We only look at an account's data to fix a problem you have
reported, or when the law requires it.

---

## 2. What is collected

### 2.1 Things you type in

- **Account**: your email address and a password. The password is never stored.
  What is stored is a bcrypt hash, which cannot be reversed into your password.
- **Food and pantry**: the foods you add, quantities, units, storage locations,
  expiry dates, and low-stock thresholds.
- **What you eat**: every consumption entry, with amounts, meal slot, timestamp,
  and the calories and macronutrients calculated for it.
- **Waste**: what you threw away, when, and the reason you gave.
- **Recipes**: recipes you write, recipes you import from a link, ratings, meal
  plans, and per-cook decisions such as leaving an ingredient out.
- **Shopping list**: items, quantities, and whether they are ticked.
- **Settings**: your calorie and macronutrient targets, dietary tags, unit
  system, and notification preferences.

### 2.2 Health-related information

If you choose to use the calorie calculator, the app stores your **height,
weight, year of birth, sex, activity level, and weight goal**.

This is health-related information, and it deserves naming separately for three
reasons:

1. **It is entirely optional.** Every feature except the personalised calorie
   estimate works without it. You can use the app indefinitely and never enter
   any of it.
2. **It is used for one purpose only** — calculating a suggested daily calorie
   target and macronutrient split. It is not used for anything else, ever.
3. **You can delete it at any time** without deleting your account, and the app
   will fall back to a plain default target.

Your diary is also health-related information by nature: what a person eats over
months says a great deal about them. It is treated with the same care.

### 2.3 Things collected automatically

- **Server logs.** Each request is logged with its method, path, response status
  and duration. Logs may include your IP address. They exist to diagnose faults
  and are not used to build a profile of you.
- **Session tokens.** Signing in issues a token that your browser stores and
  sends with each request. It expires after 30 days.
- **Storage on your device.** Your session token, and the receipt lines you have
  matched to foods, are stored on your phone or in your browser. No analytics or
  tracking cookies are set, and the app does not use Google Analytics or any
  equivalent.
- **Ads, on the iPhone app without Pro.** Google's advertising SDK collects some
  information about the device in order to show ads. Section 5 says exactly
  what, and how to limit it.

### 2.4 What is never collected

- Payment or card details. The app takes no payments.
- Precise location. The app never requests it.
- Contacts, calendar, microphone, or files.
- **Camera images, apart from meal photos.** Barcodes and receipts are read on
  your phone: the camera picture never leaves it, is never uploaded and is never
  recorded. Only the barcode number, or the words read off a receipt, go to the
  server to find the food. The one exception is a photo you take in Snap a meal,
  described in section 4.3.

---

## 3. Why it is used

| Purpose | What it uses | Lawful basis (UK/EU GDPR) |
|---|---|---|
| Running your account | Email, password hash | Contract |
| Tracking your pantry and suggesting recipes | Food, inventory, recipe data | Contract |
| Calculating a calorie target and macros | Height, weight, age, sex, activity | **Explicit consent** |
| Showing your diary and reports | Consumption and waste logs | Contract |
| Looking up barcodes and nutrition | Barcode numbers, search terms | Legitimate interests |
| Estimating a meal from a photo (Snap a meal) | The photo, and anything you type about it | Contract |
| Writing recipes to order (Make me something) | What you write and mark on the order, your diet setting, and the foods in your kitchen | Contract |
| Confirming your email and resetting a forgotten password | Your email address and the codes sent to it | Contract |
| Refusing a password already leaked elsewhere | The first five characters of a one-way hash of the new password | Legitimate interests |
| Keeping the service working and secure | Server logs | Legitimate interests |
| Showing ads to accounts without Pro (iPhone app) | Device and ad information collected by Google's SDK; the advertising identifier only if you allow tracking | Consent where the law requires it; otherwise legitimate interests |

Consent for the calorie calculator is separate from your agreement to this
notice, is asked for at the point of use, and can be withdrawn by deleting those
fields. Withdrawing it does not affect the rest of the app.

What you put into the app — your pantry, diary, recipes, body data and email —
is **never** used for advertising, sold, rented, shared with data brokers, or
used to train machine-learning models. The ads in section 5 are chosen by Google
from the device information its own SDK collects; the app passes Google nothing
about you.

---

## 4. Who else sees it

### 4.1 Nobody, mostly

The app has no analytics provider and no customer-support tool. Its one
third-party SDK is Google's advertising SDK in the iPhone app, described in
section 5, and no ads are requested for Pro accounts. Other users of the same installation cannot see
your pantry, your diary, or the recipes you import — that separation is enforced
in the code and covered by automated tests.

### 4.2 Two outside services, for food data only

When you scan a barcode or search for a food, a request goes to:

- **Open Food Facts** (openfoodfacts.org), a non-profit food database. It
  receives the barcode number and an identifying user-agent string. Their
  privacy policy governs what they do with it.
- **USDA FoodData Central** (fdc.nal.usda.gov), a United States government
  database. It receives your search term and an API key.

**Neither receives your identity, your email, your pantry, or your diary.** They
see an anonymous request for a barcode or a food name and nothing tying it to
you. Results are cached locally so the same lookup is not repeated.

If you import a recipe from a link, the server fetches that page. The site you
linked to will see the server's IP address, not yours.

### 4.3 The AI service: meal photos and recipe orders

If you photograph a meal with Snap a meal, the photo is sent to an outside AI
service so it can estimate what is on the plate: Google's Gemini (or, if that is
ever unavailable, Anthropic's Claude). It is sent without
your name, email or anything else about you, and this app does not keep the
photo: once the estimate comes back, it is discarded. What you then log is
stored like any other diary entry.

That service's own terms govern what it does with the photo. The app uses
Google's paid service, under which Google does not use what it receives to
improve its products or train its models, and keeps it only for a limited time
to detect abuse. Nothing is sent unless you take or choose a photo in Snap a
meal.

If you use Make me something, your order goes to the same service so it can
write recipes: what you typed (which may say how you feel), the tags you
marked, your diet setting, and a list of the foods in your kitchen with their
amounts and dates. It is sent without your name or email, and this app does
not keep the order or the replies; a recipe is only stored if you save it to
your recipes. Nothing is sent unless you send an order.

### 4.4 Hosting

The app's server runs on Render (render.com) in Oregon, in the United States,
and keeps your data in a database hosted by Neon (neon.tech). Both store it on
their hardware under contract, may have technical access to it, and process it
only to provide their service.

### 4.5 Email

When you sign up, and if you ask to reset your password, a six-digit code is
emailed to you through Resend (resend.com), an email delivery service in the
United States. Resend receives your email address and that email, and nothing
else about you. The app sends no other email: no newsletters, no marketing.

### 4.6 Legal requests

If validly compelled by law, we may have to disclose data. We will tell you
unless legally prohibited from doing so.

---

## 5. Advertising

Accounts without Pro see a few ads in the iPhone app, and nowhere else: a slim
banner on the Recipes and Eaten screens, and, once the free meal photos are
used, a short ad you can choose to watch for one more. Pro accounts see no ads,
and no ads are requested for them.

The ads come from **Google AdMob**. To choose and show an ad, and to count views,
clicks and fraud, Google's SDK collects information about the device: its model
and operating system, its IP address, the app, and how you interact with the
ads. It does not receive your pantry, your diary, your email or anything else
you have put into the app.

- **Personalised ads.** The first time an ad would appear, iOS asks whether the
  app may track you. If you allow it, Google may use your device's advertising
  identifier to personalise and measure ads. If you decline, it is not used.
  You can change your answer at any time in the iPhone's Settings, under
  Privacy & Security, Tracking.
- **UK, EEA and Switzerland.** Before any ad is requested, Google's consent form
  asks what you agree to, as the law there requires.

What Google does with this information is governed by Google's privacy policy
(policies.google.com/privacy), including how it uses information from apps that
use its services (policies.google.com/technologies/partner-sites).

---

## 6. How long it is kept

- **While your account exists**, your data is kept so the app can work. A pantry
  that forgets is not a pantry.
- **Server logs** are kept only as long as the hosting platform retains them,
  typically days to weeks.
- **Cached food data** from external lookups is kept indefinitely, because it
  describes a product rather than a person.
- **When you delete your account**, everything belonging to you is removed
  immediately and permanently: pantry, diary, waste log, shopping list, recipes
  you added, ratings and meal plans, and all body data. This is a real deletion
  from the database, not a flag. It cannot be undone and there is no grace
  period.

- **Email codes** are kept only as a one-way hash and deleted as soon as they are
  used; an unused one stops working after fifteen minutes.

The database host keeps short-term backups, which may hold a copy for a few days
until they age out on their normal cycle.

---

## 7. Your rights

Under UK and EU data protection law you have the right to:

- **Access** a copy of your data. Settings has an export that produces a
  complete machine-readable file, immediately, without asking anyone.
- **Rectify** anything wrong. Every value in the app is editable.
- **Erase** your data — see account deletion above.
- **Restrict or object** to processing.
- **Portability** — the export is JSON, a standard format.
- **Withdraw consent** for the calorie calculator at any time.
- **Complain** to a supervisory authority. In the UK that is the Information
  Commissioner's Office (ico.org.uk).

You do not need to ask permission to exercise the first four; the app implements
them as buttons. For anything else, ${REACH}.

---

## 8. Security

- Passwords are hashed with bcrypt (cost factor 10). Nobody, including us, can
  read your password.
- A new password is checked against Have I Been Pwned's list of passwords
  exposed in other sites' breaches, and refused if it is on it. Only the first
  five characters of a one-way hash of it are sent, which cannot be turned back
  into the password.
- Signing in is rate limited, and an email code works only for fifteen minutes
  and a few tries, so neither can be guessed.
- Sessions use signed tokens with a 30-day expiry. Changing or resetting your
  password signs out every other device.
- Everything between the app and the server is encrypted (HTTPS).
- Each account's data is isolated by queries scoped to the signed-in user, and
  that isolation is covered by automated tests.

No system is perfectly secure. Pantry2Plate is a small app, not a bank, and it
has not had an independent security audit. Use a password you do not use
anywhere else. If we learn that your data has been exposed, we will tell you,
and the authorities where the law requires, without undue delay.

---

## 9. Children

The app is not intended for anyone under 16, and accounts should not be created
for them: signing up asks you to confirm you are 16 or older. It is not designed for supervised or clinical use, and calorie
tracking can be harmful for people with a history of disordered eating. If that
applies to you, please speak to a professional before using the calorie
features — or use the pantry and recipe features alone, which work perfectly
well without them.

---

## 10. This is not medical advice

Calorie targets and macronutrient suggestions are estimates from a standard
formula (Mifflin-St Jeor with an activity multiplier). They are not a
measurement of your metabolism, not personalised medical advice, and not a
substitute for a doctor or a registered dietitian. Actual energy needs vary
substantially between people with identical measurements.

Nutrition figures come from public databases and from what you enter. They may
be wrong. **Do not rely on this app for anything medical**, including managing
diabetes, allergies, or any other condition. Always check the packaging for
allergens.

---

## 11. International transfers

The app's server and the services it uses (sections 4.3 to 4.5) are in the
United States, so if you use the app from anywhere else, your data is
transferred there. External food lookups receive only an anonymous barcode
number or search term. On the iPhone app without Pro, Google's advertising SDK
sends device information to Google, which may process it in the United States
(section 5).

---

## 12. Changes

If this notice changes in a way that affects what is collected, why, who
receives it, or how long it is kept, the version number changes and you will be
asked to review and accept the new version before continuing to use the app.
Cosmetic corrections will not interrupt you.

The version you accepted, and when, is recorded against your account.

---

## 13. Contact

To ask about this notice or your data, ${REACH}.

---

## 14. Consumer health data (Washington, Nevada and similar laws)

Some US state laws, such as Washington's My Health My Data Act, treat
information about your body and what you eat as consumer health data. In
Pantry2Plate that is the body data in section 2.2 and your food diary.

- **Collected** only from what you type in: the diary to keep your diary, and
  the body data, only if you choose to enter it, to work out your calorie target.
- **Shared with nobody** but the AI service that writes your recipes, and
  only when you send an order (section 4.3). It is not sold, not given to
  advertisers, and never passed to Google's advertising SDK, which receives
  nothing you enter.
- **Yours to see, export and delete** at any time in Settings. For anything
  else, ${REACH}.

---

**By creating an account you confirm you are 16 or older, have read this notice,
and agree to your data being handled as described.**
`;
