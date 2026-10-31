# 📋 Oikos (KCF Finance) — Expense Manager: Complete Project Report

> **Project Name:** Oikos — Expense Manager for Donation-Based Institutions  
> **Version:** 2.0.0  
> **Date:** 29 October 2026  
> **Tech Stack:** Node.js, Express, SQLite (local) / MongoDB Atlas (production), Vanilla JS, Chart.js  

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features (Detailed)](#2-features-detailed)
3. [Database Diagrams](#3-database-diagrams)
   - 3.1 [Entity-Relationship (ER) Diagram](#31-entity-relationship-er-diagram)
   - 3.2 [Data Flow Diagrams (DFD)](#32-data-flow-diagrams-dfd)
   - 3.3 [Use Case Diagram](#33-use-case-diagram)
   - 3.4 [Sequence Diagrams](#34-sequence-diagrams)
   - 3.5 [Class Diagram (API Architecture)](#35-class-diagram-api-architecture)
   - 3.6 [State Diagram (Budget Enforcement)](#36-state-diagram-budget-enforcement)
4. [Implementation in Real](#4-implementation-in-real)
5. [Project Report (Progress)](#5-project-report-progress)

---

## 1. Project Overview

**Oikos (KCF Finance)** is a comprehensive web-based expense and budget management application specifically designed for **donation-based institutions** — orphanages, churches, NGOs, and similar organizations. The system allows administrators to manage multiple organisations, categorize expenses, track income sources (donations, grants), set per-category budget limits, and visualize spending via a dashboard with interactive charts.

The application features a **dual-database architecture**:
- **SQLite** (via Node.js built-in `node:sqlite`) for local development
- **MongoDB Atlas** for cloud production deployment on Vercel

> [!IMPORTANT]
> The project is hosted **100% free 24/7** using GitHub (source code), Vercel (serverless hosting), and MongoDB Atlas Free Tier (512 MB cloud database).

---

## 2. Features (Detailed)

### 2.1 Organisation Management
| Feature | Description |
|:--------|:------------|
| **Create Organisation** | Add new institutions with name, type (Orphanage / Church / NGO), address, and contact |
| **Edit Organisation** | Inline form-based editing with pre-populated fields |
| **Delete Organisation** | Cascade delete — removes all associated categories, expenses, income, and budgets |
| **View All** | Tabular listing with highlighted "Selected" row badge |

### 2.2 Category Management
| Feature | Description |
|:--------|:------------|
| **Per-Organisation Categories** | Each organisation has its own set of expense categories (e.g., Food, Utilities, Games) |
| **Cascading Dropdown** | When an org is selected, only its categories appear in expense & budget forms |
| **Quick Add** | Inline category creation form within the Expenses view |

### 2.3 Expense Tracking
| Feature | Description |
|:--------|:------------|
| **Record Expenses** | Log expenditures with organisation, category, amount, and date |
| **Budget Enforcement** | Before insertion, the system checks if the expense would exceed any active budget — **blocks** the expense if it would |
| **Budget Warning** | If the expense pushes spending past 75% of budget, a warning toast is shown |
| **Live Budget Indicator** | Real-time progress bar appears on the expense form showing budget status as category/date changes |
| **Filtered View** | Expenses can be filtered by organisation |
| **Delete** | Individual expense deletion with automatic dashboard/budget refresh |

### 2.4 Income Tracking
| Feature | Description |
|:--------|:------------|
| **Record Income** | Log donations, grants, and other revenue with source, amount, date, and description |
| **Per-Org Filtering** | Income is scoped to the selected organisation |
| **Delete** | Individual income record deletion |

### 2.5 Budget & Alerts System
| Feature | Description |
|:--------|:------------|
| **Create Budget** | Allocate a spending limit to a specific category for a period |
| **Period Types** | Monthly (`2026-10`), Quarterly (`2026-Q1`), and Yearly (`2026`) |
| **Progress Cards** | Visual cards showing allocated vs spent with animated progress bars |
| **Status Indicators** | On Track (≤75%), Warning (75–100%), Over Budget (>100%) with color coding |
| **Summary Statistics** | Total budgets, total allocated, total spent, and count of over-budget items |
| **Status Filter** | Filter budget cards by On Track / Warning / Over Budget |
| **Enforcement** | Hard block on expenses that would exceed budget limits |

### 2.6 Dashboard & Analytics
| Feature | Description |
|:--------|:------------|
| **Summary Cards** | Total Income, Total Expenses, and Net Balance at a glance |
| **Doughnut Chart** | Expenses broken down by category using Chart.js |
| **Per-Organisation** | All metrics are scoped to the currently selected organisation |

### 2.7 UI/UX Features
| Feature | Description |
|:--------|:------------|
| **Dark Theme** | Modern dark-mode UI with gradient accents |
| **Sidebar Navigation** | Five-section nav: Dashboard, Organisations, Expenses, Income, Budgets |
| **Mobile Responsive** | Hamburger menu with overlay sidebar for mobile devices |
| **Toast Notifications** | Animated success/warning/danger toasts with auto-dismiss and progress bar |
| **localStorage Persistence** | Selected org is remembered across page reloads |

### 2.8 Deployment & DevOps
| Feature | Description |
|:--------|:------------|
| **Vercel Serverless** | Auto-deploys on `git push` with serverless API functions |
| **MongoDB Atlas** | Free-tier cloud database with connection pooling |
| **Local Dev Mode** | `npm start` / `npm run dev` with nodemon hot-reload |
| **Seed Data** | Auto-seeds sample data into empty SQLite database on first run |

---

## 3. Database Diagrams

### 3.1 Entity-Relationship (ER) Diagram

This diagram shows all five core entities, their attributes, primary keys (PK), and foreign key relationships. The `counters` collection (MongoDB-only, used for auto-increment sequences) is also shown.

```mermaid
erDiagram
    ORGANISATIONS {
        INTEGER org_id PK "Auto-increment"
        TEXT name "NOT NULL"
        TEXT type "Default: Standard"
        TEXT address "Default: empty"
        TEXT Contact "Default: empty"
        TEXT createdAt "ISO 8601 timestamp"
        TEXT updatedAt "ISO 8601 timestamp"
    }

    CATEGORIES {
        INTEGER cat_id PK "Auto-increment"
        INTEGER org_id FK "References organisations"
        TEXT cat_name "NOT NULL"
        TEXT description "Default: empty"
        TEXT createdAt "ISO 8601 timestamp"
        TEXT updatedAt "ISO 8601 timestamp"
    }

    EXPENSES {
        INTEGER exp_id PK "Auto-increment"
        INTEGER org_id FK "References organisations"
        INTEGER cat_id FK "References categories"
        REAL amount "NOT NULL, positive"
        TEXT e_date "NOT NULL, YYYY-MM-DD"
        TEXT createdAt "ISO 8601 timestamp"
        TEXT updatedAt "ISO 8601 timestamp"
    }

    INCOME {
        INTEGER income_id PK "Auto-increment"
        INTEGER org_id FK "References organisations"
        TEXT Source "NOT NULL"
        REAL amount "NOT NULL, positive"
        TEXT income_date "NOT NULL, YYYY-MM-DD"
        TEXT description "Default: empty"
        TEXT createdAt "ISO 8601 timestamp"
        TEXT updatedAt "ISO 8601 timestamp"
    }

    BUDGETS {
        INTEGER bud_id PK "Auto-increment"
        INTEGER org_id FK "References organisations"
        INTEGER cat_id FK "References categories"
        REAL amount "NOT NULL, positive"
        TEXT period "NOT NULL, e.g. 2026-10"
        TEXT createdAt "ISO 8601 timestamp"
        TEXT updatedAt "ISO 8601 timestamp"
    }

    COUNTERS {
        TEXT _id PK "Sequence name"
        INTEGER seq "Current counter value"
    }

    ORGANISATIONS ||--o{ CATEGORIES : "has many"
    ORGANISATIONS ||--o{ EXPENSES : "has many"
    ORGANISATIONS ||--o{ INCOME : "has many"
    ORGANISATIONS ||--o{ BUDGETS : "has many"
    CATEGORIES ||--o{ EXPENSES : "categorizes"
    CATEGORIES ||--o{ BUDGETS : "has budget for"
```

#### ER Diagram — Detailed Explanation

| Relationship | Cardinality | Constraint | Description |
|:-------------|:------------|:-----------|:------------|
| Organisation → Categories | 1:N | `ON DELETE CASCADE` | Deleting an org removes all its categories |
| Organisation → Expenses | 1:N | `ON DELETE CASCADE` | Deleting an org removes all its expenses |
| Organisation → Income | 1:N | `ON DELETE CASCADE` | Deleting an org removes all its income records |
| Organisation → Budgets | 1:N | `ON DELETE CASCADE` | Deleting an org removes all its budgets |
| Category → Expenses | 1:N | `ON DELETE CASCADE` | Deleting a category removes its expenses |
| Category → Budgets | 1:N | `ON DELETE CASCADE` | Deleting a category removes its budget allocations |

> [!NOTE]
> The `counters` table/collection exists **only in MongoDB** to provide atomic auto-incrementing integer IDs (via `findOneAndUpdate` with `$inc`). In SQLite, `AUTOINCREMENT` handles this natively.

---

### 3.2 Data Flow Diagrams (DFD)

#### Level 0 — Context Diagram

```mermaid
flowchart LR
    Admin["👤 Administrator"]
    System["📦 KCF Finance\nExpense Manager"]
    DB[("🗄️ Database\nSQLite / MongoDB")]

    Admin -->|"Org, Category, Expense,\nIncome, Budget data"| System
    System -->|"Dashboard analytics,\nBudget alerts, Reports"| Admin
    System <-->|"CRUD operations"| DB
```

#### Level 1 — Major Process Decomposition

```mermaid
flowchart TD
    Admin["👤 Administrator"]

    subgraph P1["1.0 Organisation Management"]
        P1A["Add / Edit / Delete\nOrganisation"]
    end

    subgraph P2["2.0 Category Management"]
        P2A["Add / Delete\nCategories per Org"]
    end

    subgraph P3["3.0 Expense Management"]
        P3A["Record Expense"]
        P3B["Budget Check\nBefore Insert"]
        P3C["Delete Expense"]
    end

    subgraph P4["4.0 Income Management"]
        P4A["Record / Delete\nIncome"]
    end

    subgraph P5["5.0 Budget Management"]
        P5A["Create / Delete Budget"]
        P5B["Budget Progress\nCalculation"]
        P5C["Live Budget Check"]
        P5D["Budget Summary"]
    end

    subgraph P6["6.0 Dashboard & Analytics"]
        P6A["Aggregate Income\nvs Expenses"]
        P6B["Expenses by\nCategory Chart"]
    end

    DB[("🗄️ Database")]

    Admin --> P1A --> DB
    Admin --> P2A --> DB
    Admin --> P3A --> P3B
    P3B -->|"Allowed"| DB
    P3B -->|"Blocked"| Admin
    P3C --> DB
    Admin --> P4A --> DB
    Admin --> P5A --> DB
    P5B --> DB
    P5C --> DB
    P5D --> DB
    P6A --> DB
    P6B --> DB
    DB --> P6A --> Admin
    DB --> P5B --> Admin
```

#### Level 2 — Expense Recording Process (Detailed)

```mermaid
flowchart TD
    A["User submits\nexpense form"] --> B{"Validate Input"}
    B -->|"Invalid"| C["Return 400 error\nwith message"]
    B -->|"Valid"| D["Query budgets table\nfor org_id + cat_id"]
    D --> E{"Budget exists\nfor this period?"}
    E -->|"No"| H["INSERT expense\ninto database"]
    E -->|"Yes"| F["Calculate:\nalreadySpent + newAmount"]
    F --> G{"Exceeds budget\namount?"}
    G -->|"Yes"| I["Return BLOCKED\nwith remaining balance"]
    G -->|"No"| J{">75% of\nbudget used?"}
    J -->|"Yes"| K["INSERT expense +\nreturn WARNING"]
    J -->|"No"| H
    H --> L["Return success\nwith expense record"]
```

---

### 3.3 Use Case Diagram

```mermaid
flowchart TD
    subgraph Actors
        Admin["👤 Administrator"]
    end

    subgraph UC_System["KCF Finance — Expense Manager"]
        subgraph UC_Org["Organisation Module"]
            UC1["Add Organisation"]
            UC2["Edit Organisation"]
            UC3["Delete Organisation"]
            UC4["View Organisations"]
        end

        subgraph UC_Cat["Category Module"]
            UC5["Add Category"]
            UC6["Delete Category"]
        end

        subgraph UC_Exp["Expense Module"]
            UC7["Record Expense"]
            UC8["View Expenses"]
            UC9["Delete Expense"]
            UC10["Check Budget\nBefore Expense"]
        end

        subgraph UC_Inc["Income Module"]
            UC11["Record Income"]
            UC12["View Income"]
            UC13["Delete Income"]
        end

        subgraph UC_Bud["Budget Module"]
            UC14["Create Budget"]
            UC15["View Budget Progress"]
            UC16["Delete Budget"]
            UC17["Live Budget Check"]
            UC18["Budget Summary"]
        end

        subgraph UC_Dash["Dashboard Module"]
            UC19["View Dashboard"]
            UC20["View Expense Chart"]
        end
    end

    Admin --- UC1
    Admin --- UC2
    Admin --- UC3
    Admin --- UC4
    Admin --- UC5
    Admin --- UC6
    Admin --- UC7
    Admin --- UC8
    Admin --- UC9
    Admin --- UC11
    Admin --- UC12
    Admin --- UC13
    Admin --- UC14
    Admin --- UC15
    Admin --- UC16
    Admin --- UC19

    UC7 -.->|"includes"| UC10
    UC8 -.->|"extends"| UC17
    UC19 -.->|"includes"| UC20
    UC15 -.->|"includes"| UC18
```

#### Use Case Descriptions

| Use Case | Actor | Pre-condition | Post-condition | Description |
|:---------|:------|:--------------|:---------------|:------------|
| **Add Organisation** | Admin | None | Organisation created with unique ID | Admin fills name, type, address, contact and submits |
| **Edit Organisation** | Admin | Org exists | Org data updated | Admin clicks Edit, modifies fields, submits |
| **Delete Organisation** | Admin | Org exists | Org + all children deleted | Cascade deletes categories, expenses, income, budgets |
| **Add Category** | Admin | Org selected | Category created under org | Admin enters category name linked to current org |
| **Record Expense** | Admin | Org & category exist | Expense recorded OR blocked | System checks budget constraints before inserting |
| **Record Income** | Admin | Org selected | Income record created | Admin enters source, amount, date, description |
| **Create Budget** | Admin | Org & category exist | Budget allocated | Admin sets amount for a category over a period |
| **View Dashboard** | Admin | Org selected | Analytics displayed | Shows income/expense totals, category chart |
| **Live Budget Check** | System | Expense form active | Budget status displayed | Real-time indicator as user selects category/date |

---

### 3.4 Sequence Diagrams

#### Sequence 1: Recording an Expense (with Budget Enforcement)

```mermaid
sequenceDiagram
    actor Admin
    participant UI as Frontend (app.js)
    participant API as /api/expenses
    participant BH as budget-helpers.js
    participant DB as SQLite Database

    Admin->>UI: Fill expense form (org, category, amount, date)
    UI->>API: POST /api/expenses {org_id, cat_id, amount, e_date}
    API->>API: Validate input fields
    
    alt Invalid input
        API-->>UI: 400 {error: "validation message"}
        UI-->>Admin: Show error toast
    end
    
    API->>BH: checkBudgetBeforeExpense(org_id, cat_id, e_date, amount)
    BH->>DB: SELECT * FROM budgets WHERE org_id=? AND cat_id=?
    DB-->>BH: Budget records
    
    loop For each matching budget
        BH->>BH: getDateRangeForPeriod(budget.period)
        BH->>BH: Check if e_date falls within range
        BH->>DB: SELECT SUM(amount) FROM expenses WHERE org_id=? AND cat_id=? AND date range
        DB-->>BH: alreadySpent total
        BH->>BH: Calculate remaining = budget.amount - alreadySpent
    end
    
    alt Expense exceeds budget
        BH-->>API: {blocked: true, message, remaining}
        API-->>UI: 400 {blocked: true, message}
        UI-->>Admin: Show BLOCKED danger toast
    else >75% budget used
        BH-->>API: {blocked: false, warning: "..."}
        API->>DB: INSERT INTO expenses VALUES(...)
        DB-->>API: lastInsertRowid
        API-->>UI: 200 {exp_id, warning}
        UI-->>Admin: Show WARNING toast + refresh tables
    else Within budget
        BH-->>API: {blocked: false}
        API->>DB: INSERT INTO expenses VALUES(...)
        DB-->>API: lastInsertRowid
        API-->>UI: 200 {exp_id}
        UI-->>Admin: Show SUCCESS toast + refresh tables
    end
```

#### Sequence 2: Loading the Dashboard

```mermaid
sequenceDiagram
    actor Admin
    participant UI as Frontend (app.js)
    participant API as /api/dashboard
    participant DB as SQLite Database

    Admin->>UI: Select Organisation from dropdown
    UI->>UI: onGlobalOrgChange()
    UI->>UI: Save org_id to localStorage
    
    par Load Dashboard
        UI->>API: GET /api/dashboard?org_id=1
        API->>DB: SELECT SUM(amount) FROM income WHERE org_id=1
        DB-->>API: totalIncome
        API->>DB: SELECT SUM(amount) FROM expenses WHERE org_id=1
        DB-->>API: totalExpense
        API->>DB: SELECT cat_id, cat_name, SUM(amount) FROM expenses GROUP BY cat_id
        DB-->>API: expensesByCategory
        API-->>UI: {totalIncome, totalExpense, expensesByCategory}
        UI->>UI: Update summary cards
        UI->>UI: renderChart() with Chart.js doughnut
    and Load Expenses
        UI->>API: GET /api/expenses?org_id=1
        API->>DB: SELECT expenses with JOIN organisations, categories
        DB-->>API: expense rows
        API-->>UI: Expense array
        UI->>UI: Populate expense table
    and Load Income
        UI->>API: GET /api/income?org_id=1
        API->>DB: SELECT income with JOIN organisations
        DB-->>API: income rows
        API-->>UI: Income array
        UI->>UI: Populate income table
    and Load Budgets
        UI->>API: GET /api/budgets/progress?org_id=1
        API->>DB: SELECT budgets with JOINs + compute spent
        DB-->>API: budget progress data
        API-->>UI: Budget array with spent/remaining
        UI->>UI: Render budget cards with progress bars
    end
    
    UI-->>Admin: Display complete dashboard
```

#### Sequence 3: Creating a New Organisation

```mermaid
sequenceDiagram
    actor Admin
    participant UI as Frontend (app.js)
    participant API as /api/organisations
    participant DB as SQLite Database

    Admin->>UI: Fill org form (name, type, address, contact)
    Admin->>UI: Click "Add Organisation"
    UI->>UI: Validate name is not empty
    UI->>API: POST /api/organisations {name, type, address, Contact}
    API->>API: Validate name field
    API->>DB: INSERT INTO organisations VALUES(...)
    DB-->>API: lastInsertRowid (new org_id)
    API-->>UI: 200 {org_id, name, type, ...}
    UI->>UI: Reset form
    UI->>UI: Show success toast
    UI->>API: GET /api/organisations
    API->>DB: SELECT * FROM organisations
    DB-->>API: All organisations
    API-->>UI: Organisation array
    UI->>UI: Re-populate all dropdowns
    UI->>UI: Auto-select new organisation
    UI->>UI: Trigger onGlobalOrgChange()
    UI-->>Admin: New org selected, data refreshed
```

#### Sequence 4: Budget Creation with Period Type Selection

```mermaid
sequenceDiagram
    actor Admin
    participant UI as Frontend (app.js)
    participant API as /api/budgets
    participant DB as SQLite Database

    Admin->>UI: Select org, category, amount
    Admin->>UI: Choose period type (Monthly/Quarterly/Yearly)
    Admin->>UI: Select month input (e.g., 2026-10)
    Admin->>UI: Click "Create Budget"
    
    UI->>UI: Derive period string from type
    Note right of UI: Monthly: "2026-10"
    Note right of UI: Quarterly: "2026-Q4"
    Note right of UI: Yearly: "2026"
    
    UI->>API: POST /api/budgets {org_id, cat_id, amount, period}
    API->>API: Validate all fields
    API->>DB: INSERT INTO budgets VALUES(...)
    DB-->>API: lastInsertRowid (new bud_id)
    API-->>UI: 200 {bud_id, org_id, cat_id, amount, period}
    UI->>UI: Show success toast
    UI->>UI: Reload budget dashboard
    UI->>UI: Update budget indicator on expense form
    UI-->>Admin: New budget card appears with 0% progress
```

---

### 3.5 Class Diagram (API Architecture)

```mermaid
classDiagram
    class Server {
        +Express app
        +Number PORT
        +listen()
        +use(cors, json, static)
    }

    class OrganisationsAPI {
        +GET() List~Organisation~
        +POST(name, type, address, Contact) Organisation
        +PUT(id, name, type, address, Contact) Message
        +DELETE(id) Message
    }

    class CategoriesAPI {
        +GET() List~Category~
        +POST(org_id, cat_name, description) Category
        +PUT(id, org_id, cat_name, description) Message
        +DELETE(id) Message
    }

    class ExpensesAPI {
        +GET(org_id?) List~Expense~
        +POST(org_id, cat_id, amount, e_date) Expense
        +PUT(id, org_id, cat_id, amount, e_date) Message
        +DELETE(id) Message
    }

    class IncomeAPI {
        +GET(org_id?) List~Income~
        +POST(org_id, Source, amount, income_date, description) Income
        +PUT(id, org_id, Source, amount, income_date, description) Message
        +DELETE(id) Message
    }

    class BudgetsAPI {
        +GET() List~Budget~
        +POST(org_id, cat_id, amount, period) Budget
        +PUT(id, org_id, cat_id, amount, period) Message
        +DELETE(id) Message
    }

    class BudgetProgressAPI {
        +GET(org_id?) List~BudgetWithSpent~
    }

    class BudgetLiveCheckAPI {
        +GET(org_id, cat_id, date) LiveCheckResult
    }

    class BudgetSummaryAPI {
        +GET(org_id, cat_id, period?) List~BudgetSummary~
    }

    class DashboardAPI {
        +GET(org_id) DashboardData
    }

    class BudgetHelpers {
        +getDateRangeForPeriod(period) DateRange
        +checkBudgetBeforeExpense(org_id, cat_id, e_date, amount) BudgetCheck
    }

    class SQLiteDB {
        +getDb() DatabaseSync
        -exec(sql)
        -prepare(sql)
    }

    class MongoDBClient {
        +getClientPromise() Promise~MongoClient~
        +getDb() Promise~Db~
        +getNextSequence(name) Promise~Number~
    }

    Server --> OrganisationsAPI
    Server --> CategoriesAPI
    Server --> ExpensesAPI
    Server --> IncomeAPI
    Server --> BudgetsAPI
    Server --> BudgetProgressAPI
    Server --> BudgetLiveCheckAPI
    Server --> BudgetSummaryAPI
    Server --> DashboardAPI

    ExpensesAPI --> BudgetHelpers
    BudgetProgressAPI --> BudgetHelpers
    BudgetLiveCheckAPI --> BudgetHelpers
    BudgetSummaryAPI --> BudgetHelpers

    OrganisationsAPI --> SQLiteDB
    CategoriesAPI --> SQLiteDB
    ExpensesAPI --> SQLiteDB
    IncomeAPI --> SQLiteDB
    BudgetsAPI --> SQLiteDB
    DashboardAPI --> SQLiteDB
    BudgetHelpers --> SQLiteDB
```

---

### 3.6 State Diagram (Budget Enforcement)

```mermaid
stateDiagram-v2
    [*] --> ExpenseSubmitted : User submits expense

    ExpenseSubmitted --> InputValidation : Validate fields
    
    InputValidation --> ValidationFailed : Invalid data
    InputValidation --> BudgetLookup : All fields valid
    
    ValidationFailed --> [*] : Return 400 error

    BudgetLookup --> NoBudgetExists : No budget for org+cat
    BudgetLookup --> BudgetFound : Budget record found

    NoBudgetExists --> ExpenseInserted : Insert freely

    BudgetFound --> DateRangeCheck : Resolve period to date range
    DateRangeCheck --> OutOfRange : Expense date outside budget period
    DateRangeCheck --> InRange : Expense date within budget period

    OutOfRange --> ExpenseInserted : No enforcement needed

    InRange --> SpendingCalculation : SUM existing expenses in range
    SpendingCalculation --> OverBudget : alreadySpent + newAmount > budget
    SpendingCalculation --> WarningZone : >75% used but within limit
    SpendingCalculation --> SafeZone : ≤75% used

    OverBudget --> ExpenseBlocked : Return blocked=true
    ExpenseBlocked --> [*] : 400 with remaining balance

    WarningZone --> ExpenseInserted : Insert with warning
    SafeZone --> ExpenseInserted : Insert normally

    ExpenseInserted --> [*] : Return 200 with expense record
```

---

## 4. Implementation in Real

### 4.1 System Architecture

```mermaid
flowchart LR
    subgraph Client["🖥️ Client (Browser)"]
        HTML["index.html"]
        CSS["styles.css\n(Dark Theme)"]
        JS["app.js\n(1081 lines)"]
        ChartJS["Chart.js CDN"]
    end

    subgraph Server["⚙️ Server (Node.js + Express)"]
        SRV["server.js\n(Express App)"]
        
        subgraph APIs["API Layer (/api/*)"]
            A1["/organisations"]
            A2["/categories"]
            A3["/expenses"]
            A4["/income"]
            A5["/budgets"]
            A6["/budgets/progress"]
            A7["/budgets/live-check"]
            A8["/budgets/summary"]
            A9["/dashboard"]
            A10["/init-db"]
        end

        subgraph Libs["Library Layer"]
            L1["sqlite.js"]
            L2["mongodb.js"]
            L3["budget-helpers.js"]
        end
    end

    subgraph Storage["🗄️ Storage"]
        SQLite["data.sqlite\n(Local Dev)"]
        Mongo["MongoDB Atlas\n(Production)"]
    end

    Client -->|"HTTP REST API"| Server
    APIs --> Libs
    L1 --> SQLite
    L2 --> Mongo
    L3 --> L1
```

### 4.2 Technology Stack Implementation

| Layer | Technology | Implementation Details |
|:------|:-----------|:----------------------|
| **Frontend** | HTML5, CSS3, Vanilla JS | Single-page app with view switching (no framework). Dark theme with CSS variables. 471-line HTML, 1081-line JS |
| **Charts** | Chart.js | Doughnut chart for category-wise expense breakdown |
| **Backend** | Node.js + Express 4.18 | RESTful API with `app.all()` routing. ES Modules (`"type": "module"`) |
| **Local DB** | SQLite via `node:sqlite` | Built-in Node.js SQLite module (no npm dependency). WAL mode + foreign keys enabled |
| **Cloud DB** | MongoDB 7.x via `mongodb` npm | Connection pooling, atomic counters, serverless-compatible |
| **Hosting** | Vercel (Serverless) | Auto-deploy on git push. `vercel.json` with `cleanUrls: true` |
| **Dev Tools** | nodemon 3.x | Hot-reload during development |

### 4.3 API Endpoints (Complete)

| Method | Endpoint | Purpose |
|:-------|:---------|:--------|
| `GET/POST/PUT/DELETE` | `/api/organisations` | Full CRUD for organisations |
| `GET/POST/PUT/DELETE` | `/api/categories` | Full CRUD for categories |
| `GET/POST/PUT/DELETE` | `/api/expenses` | Full CRUD for expenses (with budget enforcement on POST) |
| `GET/POST/PUT/DELETE` | `/api/income` | Full CRUD for income records |
| `GET/POST/PUT/DELETE` | `/api/budgets` | Full CRUD for budgets |
| `GET` | `/api/budgets/progress` | Budget progress with computed spent/remaining |
| `GET` | `/api/budgets/live-check` | Real-time budget check for expense form |
| `GET` | `/api/budgets/summary` | Budget summary for specific org + category |
| `GET` | `/api/dashboard` | Aggregated income, expenses, category breakdown |
| `GET/POST` | `/api/init-db` | Database initialization and index setup |

### 4.4 Key Implementation Patterns

#### Budget Period Resolution
The system supports three period formats that are resolved into date ranges:

| Period Format | Example | Date Range |
|:--------------|:--------|:-----------|
| Monthly | `2026-10` | 2026-10-01 → 2026-10-31 |
| Quarterly | `2026-Q1` | 2026-01-01 → 2026-03-31 |
| Yearly | `2026` | 2026-01-01 → 2026-12-31 |

#### Cascade Delete Strategy
When an organisation is deleted, the system manually deletes child records in order:
1. Expenses (by `org_id`)
2. Income (by `org_id`)
3. Budgets (by `org_id`)
4. Categories (by `org_id`)
5. Organisation itself

> [!TIP]
> SQLite's `FOREIGN KEY ... ON DELETE CASCADE` is also enabled via `PRAGMA foreign_keys = ON`, providing a safety net.

### 4.5 Frontend Navigation Architecture

The SPA uses a view-switching pattern with CSS classes:

```
Sidebar Navigation (5 items)
  ├── Dashboard View    → summary cards + Chart.js doughnut
  ├── Organisations View → form + table (all orgs)
  ├── Expenses View     → expense form + category form + budget indicator + table
  ├── Income View       → income form + table
  └── Budgets View      → stats cards + budget form + filter bar + budget cards grid
```

Each view is a `<section>` with class `view`. The active view gets class `active-view`. Org-scoped views show a "No Organisation Selected" prompt until an org is chosen.

---

## 5. Project Report (Progress)

### 5.1 Overall Completion Summary

```mermaid
xychart-beta
    title "Module Completion Percentage"
    x-axis ["Organisations", "Categories", "Expenses", "Income", "Budgets", "Dashboard", "UI/UX", "Deployment"]
    y-axis "Completion %" 0 --> 100
    bar [100, 100, 100, 100, 100, 85, 90, 95]
```

### 5.2 Module-wise Completion

| Module | Status | Completion | Remarks |
|:-------|:-------|:-----------|:--------|
| **Organisation CRUD** | ✅ Complete | 100% | Add, Edit, Delete, View all working. Cascade delete implemented |
| **Category CRUD** | ✅ Complete | 100% | Per-org categories with cascading dropdowns |
| **Expense CRUD** | ✅ Complete | 100% | Full CRUD with budget enforcement and blocking |
| **Income CRUD** | ✅ Complete | 100% | Full CRUD with source, date, description |
| **Budget CRUD** | ✅ Complete | 100% | Monthly, Quarterly, Yearly periods. Progress cards. Status filtering |
| **Budget Enforcement** | ✅ Complete | 100% | Hard block when over-budget. 75% warning threshold |
| **Live Budget Indicator** | ✅ Complete | 100% | Real-time indicator on expense form |
| **Dashboard** | 🟡 Mostly Done | 85% | Income/expense totals + doughnut chart. Missing: multi-org comparison, date range filters, trend analysis |
| **UI/UX** | 🟡 Mostly Done | 90% | Dark theme, mobile responsive, toast notifications. Missing: loading skeletons, form validation feedback icons |
| **Deployment** | 🟡 Mostly Done | 95% | Vercel + MongoDB Atlas stack working. Missing: CI/CD tests, environment health checks |
| **Authentication** | ❌ Not Started | 0% | No user login, roles, or access control |
| **Data Export** | ❌ Not Started | 0% | No CSV/PDF export capability |
| **Audit Trail** | ❌ Not Started | 0% | No logging of who made what changes |

### 5.3 What Is Done (Completed Features)

1. ✅ **Full 5-module backend** — Organisations, Categories, Expenses, Income, Budgets with complete REST APIs
2. ✅ **Dual-database support** — SQLite for local dev, MongoDB Atlas for production
3. ✅ **Smart budget enforcement** — Expenses blocked when exceeding budget; 75% warning threshold
4. ✅ **Live budget indicator** — Real-time budget status on expense form
5. ✅ **Dashboard with charts** — Income vs Expense summary with Chart.js doughnut
6. ✅ **Budget progress cards** — Animated progress bars with On Track / Warning / Over Budget status
7. ✅ **Mobile responsive UI** — Sidebar + hamburger menu + overlay
8. ✅ **Toast notification system** — Success/warning/danger with progress bar auto-dismiss
9. ✅ **Organisation scoping** — All data is filtered by selected organisation
10. ✅ **Seed data migration** — Auto-populates sample data on first run
11. ✅ **Vercel serverless deployment** — Production-ready with auto-deploy

### 5.4 What Is Remaining (Future Scope)

| Priority | Feature | Description |
|:---------|:--------|:------------|
| 🔴 High | **User Authentication** | Login/signup, JWT or session-based auth, role-based access (admin, viewer) |
| 🔴 High | **Multi-user Support** | Different users managing different organisations |
| 🟡 Medium | **Data Export** | Export expenses, income, and budgets to CSV or PDF |
| 🟡 Medium | **Date Range Filters** | Filter dashboard and tables by custom date ranges |
| 🟡 Medium | **Expense Edit** | Currently expenses can only be added/deleted, not edited from the UI |
| 🟡 Medium | **Income Edit** | Same as above — no inline edit from the UI |
| 🟢 Low | **Loading Skeletons** | Placeholder UI while data is being fetched |
| 🟢 Low | **Search & Pagination** | Search across records, paginate large tables |
| 🟢 Low | **Trend Charts** | Month-over-month spending trends, income growth |
| 🟢 Low | **Budget Notifications** | Email or push alerts when approaching budget limits |
| 🟢 Low | **Audit Trail** | Log of all CRUD operations with timestamps and user info |
| 🟢 Low | **Unit Tests** | Automated test suite for API endpoints |

### 5.5 Overall Project Health

| Metric | Value |
|:-------|:------|
| **Core Feature Completion** | **~95%** |
| **Overall Project Completion (incl. future scope)** | **~75%** |
| **Backend Readiness** | **Production-ready** ✅ |
| **Frontend Readiness** | **Production-ready (MVP)** ✅ |
| **Security Readiness** | **Not production-safe** ❌ (no auth) |
| **Total Source Files (excl. node_modules)** | **15 files** |
| **Frontend JS Lines** | **~1,081** |
| **Backend JS Lines** | **~750** |
| **Database Tables** | **5 (+1 MongoDB-only counters)** |
| **API Endpoints** | **10 routes** |

> [!WARNING]
> The biggest gap for production use is the **lack of authentication and authorization**. Currently, anyone with the URL can read/modify/delete all data. This must be addressed before any real-world deployment with sensitive financial data.

---

*Report generated on 29 October 2026 by analysis of the complete Oikos Expense Manager codebase.*
