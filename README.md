# Oikos - Expense Manager

A comprehensive expense manager for donation-based institutions, built with Node.js, Express, and vanilla HTML/CSS/JS. **Hosted 100% Free 24/7** using GitHub, Vercel, and MongoDB Atlas.

---

## 🌐 How the 24/7 Free Stack Works

| Service | Role | Cost |
| :--- | :--- | :--- |
| **GitHub** | Stores your source code and version history | **Free** |
| **Vercel** | Runs the frontend & serverless API 24/7 (auto-deploys on every git push) | **Free** (Hobby Plan) |
| **MongoDB Atlas** | Stores application data in the cloud (M0 Shared Cluster) | **Free** (512MB forever, no credit card required) |

---

## 🚀 Complete Step-by-Step Deployment Guide

### Step 1: Create Your Free MongoDB Atlas Database

1. **Sign Up**:
   - Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register) and create a free account.
2. **Create a Free Cluster**:
   - Choose the **M0 (Free)** tier.
   - Cloud Provider: **AWS**.
   - Region: Select the region geographically closest to you (e.g., `ap-south-1` Mumbai, `eu-central-1` Frankfurt, or `us-east-1` N. Virginia).
   - Cluster Name: Keep default (`Cluster0`) or name it `expense-manager`.
   - Click **Create Deployment**.
3. **Create Database User Credentials**:
   - Under Authentication Method, choose **Username and Password**.
   - Set a username (e.g. `expense_admin`) and a secure password.
   - ⚠️ *Tip: Avoid special characters like `@`, `:`, `/`, or `#` in your password, as they can break URI formatting.*
   - Click **Create Database User**.
4. **Configure Network Access (Crucial for Vercel)**:
   - In the left sidebar under **Security**, click **Network Access**.
   - Click **+ Add IP Address**.
   - Click **Allow Access from Anywhere** (`0.0.0.0/0`).
   - ⚠️ *Note: Vercel functions run on dynamic serverless IPs. If you don't whitelist `0.0.0.0/0`, your app will not be able to connect to the database in production.*
   - Click **Confirm**.
5. **Get Your Connection String**:
   - In the left sidebar, click **Database** (or **Clusters**).
   - Click **Connect** next to your cluster.
   - Select **Drivers** (Node.js).
   - Copy the connection URI:
     ```text
     mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
     ```
   - Replace `<password>` with your database user password, and add your database name right before the `?` (e.g. `/expense_manager`):
     ```text
     mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/expense_manager?retryWrites=true&w=majority
     ```

---

### Step 2: Push Your Code to GitHub

1. If you haven't initialized Git locally, open your project terminal and run:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Vercel and MongoDB Atlas"
   ```
2. Create a new repository on [GitHub](https://github.com/new) (public or private).
3. Link your local repo and push your code:
   ```bash
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

---

### Step 3: Deploy to Vercel (24/7 Hosting)

1. Go to [vercel.com](https://vercel.com) and log in with your GitHub account.
2. Click **Add New...** → **Project**.
3. Locate your GitHub repository from the list and click **Import**.
4. Under **Environment Variables**, add:
   - **Key**: `MONGODB_URI`
   - **Value**: your full MongoDB Atlas connection string from Step 1.5:
     ```text
     mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/expense_manager?retryWrites=true&w=majority
     ```
   - Ensure **Production**, **Preview**, and **Development** checkboxes are all checked.
5. Click **Deploy**.
6. Vercel will build your project and give you a live production URL (e.g., `https://your-expense-manager.vercel.app`).
   > Every time you run `git push origin main`, Vercel automatically redeploys your latest code!

---

### Step 4: Initialize Database Indexes (One-Time)

After your first deployment, visit your live URL to initialize collections and performance indexes:

- Open in your browser: `https://your-expense-manager.vercel.app/api/init-db`
- Or from your browser console:
  ```javascript
  fetch('/api/init-db').then(r => r.json()).then(console.log);
  ```
You will receive:
```json
{
  "message": "MongoDB Atlas connected and collections initialized successfully!",
  "collections": ["organisations", "categories", "expenses", "income", "budgets", "counters"]
}
```

---

### Step 5: Local Development Setup

To run and test the app locally on your machine:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   Create a `.env.local` file in your project root:
   ```env
   MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/expense_manager?retryWrites=true&w=majority
   ```

3. **Start the local server**:
   ```bash
   npm start
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🛠️ Common Troubleshooting

| Issue | Cause | Fix |
| :--- | :--- | :--- |
| **`MongoServerSelectionError` / Connection Timeout** | Network Access blocked | Go to MongoDB Atlas → **Network Access** → ensure `0.0.0.0/0` is active. |
| **`bad auth : authentication failed`** | Incorrect username or password | Re-check your user in **Database Access**. Ensure special characters in password are URL-encoded. |
| **API returns 500 on Vercel** | Missing environment variable | Go to Vercel → **Settings** → **Environment Variables** → check that `MONGODB_URI` exists and redeploy. |

---

## 📋 Features
- **Organisations:** Add and manage institutions (Orphanages, Churches, NGOs).
- **Categories:** Add expense categories specific to each organisation.
- **Expenses & Income:** Track spending and income flows.
- **Budgets & Alerts:** Set budget limits for categories over a period (e.g. 2026-10). If an expense would exceed the budget, the system blocks it.
- **Dashboard:** Visual tracking of total income vs expenses per organisation, with Chart.js.

## 💻 Tech Stack
- **Backend:** Node.js, Express (local) / Vercel Serverless Functions (production)
- **Database:** MongoDB Atlas (Cloud NoSQL)
- **Frontend:** HTML5, CSS3 (dark theme), Vanilla JavaScript, Chart.js
- **Hosting & CI/CD:** GitHub + Vercel

