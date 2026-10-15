/** English UI strings. Add `fa.ts` with the same keys to introduce a Persian translation. */
export const en = {
  "app.name": "Expense Manager",
  "app.tagline": "Your cards, one ledger.",

  "nav.dashboard": "Dashboard",
  "nav.transactions": "Transactions",
  "nav.inbox": "Inbox",
  "nav.cards": "Cards",
  "nav.categories": "Categories & Rules",
  "nav.categoriesShort": "Categories",
  "nav.budgets": "Budgets",
  "nav.recurring": "Recurring",
  "nav.insights": "Insights",
  "nav.import": "Import",
  "nav.settings": "Settings",
  "nav.more": "More",
  "nav.logout": "Log out",
  "nav.group.money": "Money",
  "nav.group.planning": "Planning",
  "nav.group.system": "System",

  "login.title": "Welcome back",
  "login.subtitle": "Enter your password to open your ledger.",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  "login.invalid": "Incorrect password.",
  "login.rateLimited": "Too many attempts. Try again in {seconds} seconds.",
  "login.notConfigured": "Login is not configured. Set ADMIN_PASSWORD_HASH and SESSION_SECRET.",

  "page.dashboard.subtitle": "This month at a glance",
  "page.transactions.subtitle": "Every expense, income and transfer across your cards",
  "page.inbox.subtitle": "Items waiting for your review",
  "page.cards.subtitle": "Bank cards, SMS senders and balances",
  "page.categories.subtitle": "Organise spending and automate categorisation",
  "page.budgets.subtitle": "Monthly limits per category",
  "page.recurring.subtitle": "Subscriptions and repeating payments",
  "page.insights.subtitle": "Trends, top merchants and reports",
  "page.import.subtitle": "Bring in CSV or Excel bank statements",
  "page.settings.subtitle": "Display, bot and data preferences",

  "empty.comingSoon": "Coming in phase {phase}",
  "empty.comingSoonBody": "This section is part of the build plan and will be filled in shortly.",
} as const;

export type MessageKey = keyof typeof en;
