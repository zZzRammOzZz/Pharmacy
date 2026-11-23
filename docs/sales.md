# PharmacyOS

A counter for a pharmacy. One place for the till, the shelf, the clients, and what the shop still owes.

The pharmacy works in the browser. Each shop gets its own account and a license file that lasts one year. Staff sign in with that file. When the year ends, or if the license is stopped, the counter refuses the sign-in.

## Who it is for

- A single pharmacy that sells from one till and wants the shelf and the clients in the same system.
- A pharmacy that buys from wholesalers and needs to see what is still unpaid.
- An owner with more than one branch, who wants each branch to keep its own till and stock, and still see the whole group.

## A normal day

**The till.** Sell for cash in dollars, cash in Lebanese lira, card, or charge the sale to the client’s account. Refund a line or replace it. Each receipt has a number. An expired pack cannot be sold. Write it off first.

**The shelf.** Search the catalog by name, strength, SKU, or barcode. Receive a delivery against a supplier invoice. Count a pack and correct its expiry. Write off damaged or expired stock. The morning list says what to reorder, grouped by the last wholesaler.

**The clients.** Keep a profile, the receipts, and the open credit. See how old each balance is, and print a receipt when the client pays it down.

**The scripts.** File a prescription, leave it waiting, then dispense it. Waiting and dispensed stay in separate lists.

**The wholesalers.** Each supplier has a profile and the invoices received from them. Open invoices are listed by age. Paying a supplier records a receipt.

**The close.** The shift shows today’s takings, what to reorder, and what is near expiry. Reports cover today, this month, or any dates inside a year: what sold, what it cost, the profit, how it was paid, and what is still owed. The owner can also open an employee log: who signed in, who signed out, and what they did, including sales and refunds.

## Plans

Prices are set by us. The product difference is seats and what the license unlocks.

| Plan | Seats | What the pharmacy gets |
| --- | --- | --- |
| Standard | 5 | Till, stock, and clients, including credit |
| Professional | 15 | Standard, plus prescriptions, suppliers, wholesaler balances, the morning order list, and reports |
| Group | 40 | Professional, plus several branches under one owner |

A seat is a person who can sign in. The owner counts as one. Extra people are blocked once the license is full.

On Group, each branch keeps its own till, stock, staff, wholesaler debt, and order list. The catalog, the clients, and the supplier companies stay shared. The owner switches branch from the sidebar and can read every till together. A person assigned to one branch stays on that branch.

## Who can do what

- **Owner.** Full access. The only person who sees the employee log. On Group, the only person who can move between branches.
- **Manager.** Can correct a purchase or a write-off after it was posted, and can pay a supplier. Can be allowed to refund, see the main till reading, and open reports.
- **Pharmacist.** Can receive stock, count it, write it off, and dispense. Cannot rewrite a posted invoice or write-off.
- **Cashier.** Sells on the till and sees their own reading.

## How a pharmacy starts

1. We create the pharmacy and its owner.
2. We issue a license for 12 months and send the license file.
3. The pharmacy opens the counter, chooses that file, and signs in.
4. They add staff up to the seat limit, then start selling.

The same counter serves every pharmacy. Each license only opens that pharmacy’s own stock, sales, and clients.

## Five-minute walkthrough

1. Open the shift. Point at today’s takings, what to reorder, and what is expiring.
2. Open the register. Show a sale on cash, then one charged to a client.
3. Open clients and show the open credit, then the aged list.
4. Open stock. Receive a line on an invoice, then show a shelf count.
5. On Professional or Group, open a waiting prescription, the wholesaler balance, and a report for this month.
6. On Group, switch branch and show that the other till and shelf are separate.
7. As the owner, open the employee log and show a sale and a refund with a name and a time.

## Straight answers

**Does each branch need its own system?** No. Group is one license. Each branch has its own till and shelf. The owner sees all of them.

**Can a cashier change an old invoice?** No. Only the owner or a manager can correct a posted purchase or write-off.

**What if someone leaves?** Remove them from the staff list. The seat frees up. The owner account always keeps full access.

**What happens after a year?** The license expires and the counter stops that sign-in until a new file is issued.

**Where does the data live?** Each pharmacy’s records stay on that pharmacy’s account. Staff only see their own shop, and on Group only their own branch unless they are the owner.
