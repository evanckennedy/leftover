# Leftover

Leftover is a simple personal budgeting app that estimates how much recurring income remains available for discretionary spending.

## Features

- Add multiple recurring income sources.
- Add, edit, and delete recurring expenses.
- Track recurring savings and investment contributions separately.
- Choose weekly, biweekly, monthly, or annual frequencies.
- View estimated discretionary money per day, week, two weeks, month, and year.
- Export a budget summary as a PDF or PNG image.
- Persist budget data in the browser with `localStorage`.
- Reset all saved budget data with confirmation.

## How calculations work

All recurring amounts are converted to annual amounts:

- Weekly: amount × 52
- Biweekly: amount × 26
- Monthly: amount × 12
- Annual: amount × 1

The app calculates discretionary money as:

```text
annual income - annual expenses - annual savings/investments
```

## Getting started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available scripts

```bash
npm run dev      # Start the development server
npm run lint     # Run ESLint
npm run build    # Create a production build
npm start        # Start the production server
```

## Privacy

Leftover has no backend, accounts, or database. Budget data stays in the browser where the app is being used. Exports are generated locally on the device.

## Built with

- Next.js
- React
- TypeScript
- Tailwind CSS
- Lucide React
- html-to-image
