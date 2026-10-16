# STI Sync – Complete Activity Lifecycle & Signatory Testing Guide
> **The Official Testing Handbook for Team Members.**  
> Covers the full lifecycle: **Activity Proposal (AP)** $\rightarrow$ **Event Execution** $\rightarrow$ **Financial Liquidation (FL)** $\rightarrow$ **Post-Activity Report (PAR)** for both **Organization Activities** and **SAS Admin Activities**, including approvals, returns, and rejections.

---

## 🔑 1. Quick Access Links & Signatory Logins

### 🌐 The 2 Portals

| Portal | URL | Who Logs In Here? |
| :--- | :--- | :--- |
| **Universal Campus Portal** | [http://localhost:5173/portal/login](http://localhost:5173/portal/login) | **Club Officers**, **Club Advisers**, and **Signatories** (Rona, Sheena, Cybele, Emily).<br/>*(Officers go to Officer Dashboard; Signatories automatically land on their Signing page).* |
| **SAS Admin Portal** | [http://localhost:5173/admin/login](http://localhost:5173/admin/login) | **SAS Admin ONLY** (`riselle.lucanas@sti.edu.ph` / SAO Head).<br/>*(Officers and Signatories cannot log in here).* |

---

### 👤 Signatory Test Accounts Directory

| Email | Password | Name | Position | What do they sign? |
| :--- | :--- | :--- | :--- | :--- |
| **`rona@gmail.com`** | `rona12345` | **Rona Mira Lucanas** | IT Program Head | Signs AP, FL, and PAR when the event targets **IT / ACT / College** students. |
| **`cybele@gmail.com`** | `cybele12345` | **Cybele Nudalo** | SHS Asst. Principal | Signs AP, FL, and PAR when the event involves **Senior High School (STEM, TVL, HUMSS, ABM)** students. |
| **`sheena@gmail.com`** | `sheena12345` | **Engr. Sheena Joy Muyuela** | School Administrator | Signs all AP, FL, and PAR to verify campus facilities, logistics, and physical plant safety. |
| **`emily@gmail.com`** | `emily12345` | **Emily Rojas** | School Accountant | **Financial Liquidation ONLY**: Audits official receipts, expense vouchers, and computes surplus/deficit. *(Never signs AP or PAR).* |

---

## 🏛️ PART 1: Organization Activity Full Lifecycle
*(Originates from a **Student Club Officer** via [http://localhost:5173/portal/login](http://localhost:5173/portal/login))*

```mermaid
graph TD
    classDef startNode fill:#e0f2fe,stroke:#0284c7,stroke-width:2px;
    classDef reviewNode fill:#ede9fe,stroke:#7c3aed,stroke-width:2px;
    classDef successNode fill:#dcfce7,stroke:#16a34a,stroke-width:2px;
    classDef returnNode fill:#fef3c7,stroke:#d97706,stroke-width:2px;
    classDef rejectNode fill:#fee2e2,stroke:#dc2626,stroke-width:2px;

    subgraph AP["PHASE 1: ACTIVITY PROPOSAL (AP)"]
        O1["1. Club Officer creates AP<br/>(Wizard: Audience, Sessions, Budget)"]:::startNode
        O1 --> O_Sub["Submit Proposal<br/>Status: under_review"]
        O_Sub --> S1["Stage 1: SAS Coordinator Clearance<br/>(Ma'am Riselle)"]:::reviewNode
        
        S1 -->|Return| S1_Ret["Status: returned_for_revision<br/>Officer edits highlighted remarks & resubmits"]:::returnNode
        S1_Ret --> S1
        S1 -->|Reject| S1_Rej["Status: rejected<br/>Permanently archived (Cannot edit)"]:::rejectNode
        
        S1 -->|Endorsed| S2["Stage 2: Department Endorsements<br/>• Rona Mira (IT)<br/>• Cybele (SHS)"]:::reviewNode
        S2 -->|Return by either| S2_Ret["Status: returned_for_revision<br/>Officer corrects flagged section"]:::returnNode
        S2_Ret --> S2
        
        S2 -->|All Stage 2 Signed| S3["Stage 3: School Administrator<br/>(Engr. Sheena Joy)"]:::reviewNode
        S3 -->|Endorsed| S4["Stage 4: School President<br/>(Final Approval)"]:::reviewNode
        S4 -->|President Signs| O_Approved["Status: approved_president<br/>Budget allocated in ledger"]:::successNode
    end

    subgraph LIVE["PHASE 2: LIVE EVENT EXECUTION"]
        O_Approved --> O_Act["Officer/Admin clicks Activate Event"]:::successNode
        O_Act --> O_Run["Event Status: ongoing<br/>• QR entry tickets available on mobile app<br/>• Scanners scan students at door"]:::successNode
        O_Run --> O_Done["Event Concludes<br/>Status: completed"]:::successNode
    end

    subgraph FL["PHASE 3: FINANCIAL LIQUIDATION (FL)"]
        O_Done --> FL1["Officer files Liquidation<br/>(Uploads official receipts & actual costs)"]:::startNode
        FL1 --> FL_Sub["Status: under_review"]
        FL_Sub --> FL_S1["Stage 1: SAS Clearance (Ma'am Riselle)"]:::reviewNode
        FL_S1 -->|Cleared| FL_S2["Stage 2: Financial Audit<br/>👤 Emily Rojas (Accountant)"]:::reviewNode
        
        FL_S2 -->|Return/Voucher Issue| FL_Ret["Status: returned<br/>Officer fixes receipt amount & resubmits"]:::returnNode
        FL_Ret --> FL_S1
        
        FL_S2 -->|Audited & Certified| FL_S3["Stage 3: Endorsements<br/>• Rona Mira<br/>• Engr. Sheena Joy"]:::reviewNode
        FL_S3 -->|Endorsed| FL_S4["Stage 4: School President Audit Sign"]:::reviewNode
        FL_S4 --> FL_Fin["Status: settled / approved<br/>• Surplus: Returned to club treasury<br/>• Deficit: Debited as expense"]:::successNode
    end

    subgraph PAR["PHASE 4: POST-ACTIVITY REPORT (PAR)"]
        O_Done --> PAR1["Officer drafts PAR Narrative<br/>(Photos, attendance count, ratings)"]:::startNode
        PAR1 --> PAR_Sub["Status: under_review"]
        PAR_Sub --> PAR_Sign["Parallel Reviewers Sign:<br/>• SAS Head (Riselle)<br/>• Program Head (Rona)<br/>• School Administrator (Sheena)"]:::reviewNode
        
        PAR_Sign -->|Return| PAR_Ret["Status: returned<br/>Officer adds missing photos & resubmits"]:::returnNode
        PAR_Ret --> PAR_Sign
        
        PAR_Sign -->|All Signed| PAR_Fin["Status: approved / completed<br/>Event is 100% closed & archived! 🎉"]:::successNode
    end
```

---

### 📝 Step-by-Step Walkthrough for Organization Activities

#### Step 1: Create & Submit Activity Proposal (AP)
1. Log in at [http://localhost:5173/portal/login](http://localhost:5173/portal/login) as an **Organization Officer**.
2. Go to **Activity Proposals** $\rightarrow$ Click **"New Activity Proposal"**.
3. Fill out the wizard:
   - **Title**: e.g., `CodeCrafters Hackathon 2026`.
   - **Audience**: Select **BSIT** (calls Rona) and **SHS STEM** (calls Cybele).
   - **Budget**: Add line items (e.g., `₱3,000` for Speaker & Prizes).
4. Click **"Submit Proposal"**.
   - **Current Status**: `under_review`.
   - **Active Step**: Stage 1 (SAS Gatekeeper).

#### Step 2: Approvals, Returns & Rejections in AP
- **Stage 1 (SAS Gatekeeper)**: Log in as SAS Admin at [http://localhost:5173/admin/login](http://localhost:5173/admin/login).
  - *Option A (Approve)*: Click **"Endorse Proposal"** $\rightarrow$ Stage 1 turns green; Stage 2 unlocks for Rona & Cybele.
  - *Option B (Return)*: Click **"Return for Revision"** with a remark $\rightarrow$ Status changes to `returned_for_revision`. The Officer's dashboard highlights the requested changes in yellow. Once edited and resubmitted, it returns to Stage 1.
  - *Option C (Reject)*: Click **"Disapprove / Reject"** with a reason $\rightarrow$ Status becomes `rejected`. The proposal is permanently locked and archived.
- **Stage 2 (Department Heads)**:
  - Log in as `rona@gmail.com` (`rona12345`) at `/portal/login` $\rightarrow$ Affix signature and click **Endorse**.
  - Log in as `cybele@gmail.com` (`cybele12345`) at `/portal/login` $\rightarrow$ Affix signature and click **Endorse**.
  - *(Note: Rona and Cybele sign in parallel; either can sign first).*
- **Stage 3 & 4 (Administrator & President)**:
  - Log in as `sheena@gmail.com` (`sheena12345`) at `/portal/login` $\rightarrow$ Sign and endorse.
  - School President signs $\rightarrow$ Status updates to `approved_president`.

#### Step 3: Event Activation & Live Execution
1. In the proposal, click **"Activate Event"**.
2. Event status becomes `published` / `ongoing`.
3. Students view the event and entry QR tickets on their mobile app.
4. Officers use the QR scanner to record attendance (`present`, `late`, `absent`).
5. When all sessions are finished, the event marks as `completed`.

#### Step 4: Financial Liquidation (FL) & Emily Rojas (Accountant)
1. As the Club Officer, go to **Finance Center** $\rightarrow$ **Financial Liquidation** $\rightarrow$ **Create Liquidation**.
2. Enter the actual spent amounts (e.g., Budget was `₱3,000`, actual spent was `₱2,600`, generating `₱400` surplus) and upload receipt attachments.
3. Submit the report:
   - **Stage 1**: SAS Admin clears the liquidation.
   - **Stage 2 (Accountant Audit)**: Log in as `emily@gmail.com` (`emily12345`) at `/portal/login`.
     - Emily verifies receipts and numbers.
     - *If an error exists*: Emily clicks **Return** with comments $\rightarrow$ Status becomes `returned`. Officer uploads the correct receipt and resubmits.
     - *If valid*: Emily clicks **"Certify & Endorse Audit"**.
   - **Stage 3 & 4**: Rona, Sheena, and President sign off.
   - **Result**: The `₱400` unused budget is automatically credited back to the Club Treasury Ledger as `liquidation_surplus`.

#### Step 5: Post-Activity Report (PAR)
1. As the Club Officer, open the completed event $\rightarrow$ Click **"Draft Post-Activity Report"**.
2. Enter the summary narrative, upload documentation photos, and attach the attendance stats.
3. Submit for review:
   - SAS Admin, IT Head (Rona), and School Admin (Sheena) review in parallel.
   - *If returned*: Officer adds missing photos/info and resubmits.
   - *When all sign*: PAR status becomes `approved`. The entire event cycle is officially 100% closed!

---

## 🏢 PART 2: SAS / Institutional Activity Full Lifecycle
*(Originates from **SAS Admin** via [http://localhost:5173/admin/login](http://localhost:5173/admin/login))*

```mermaid
graph TD
    classDef startNode fill:#fef3c7,stroke:#d97706,stroke-width:2px;
    classDef reviewNode fill:#ede9fe,stroke:#7c3aed,stroke-width:2px;
    classDef successNode fill:#dcfce7,stroke:#16a34a,stroke-width:2px;
    classDef returnNode fill:#fed7aa,stroke:#ea580c,stroke-width:2px;
    classDef rejectNode fill:#fee2e2,stroke:#dc2626,stroke-width:2px;

    subgraph AP_ADMIN["PHASE 1: SAS INSTITUTIONAL PROPOSAL (AP)"]
        A1["1. SAS Admin drafts Institutional Activity<br/>(e.g., STI Sports Olympiad)"]:::startNode
        A1 --> A_Sub["Submit Proposal<br/>(Stage 1 SAS Gate is automatically SKIPPED)"]
        
        A_Sub --> A_S1["Stage 1: Department Endorsements<br/>• Rona Mira (IT Head)<br/>• Cybele (SHS Principal)"]:::reviewNode
        
        A_S1 -->|Return| A_Ret["Status: returned_for_revision<br/>SAS Admin edits & resubmits"]:::returnNode
        A_Ret --> A_S1
        A_S1 -->|Reject| A_Rej["Status: rejected (Archived)"]:::rejectNode
        
        A_S1 -->|All Signed| A_S2["Stage 2: School Administrator<br/>(Engr. Sheena Joy)"]:::reviewNode
        A_S2 -->|Endorsed| A_S3["Stage 3: School President (Final)"]:::reviewNode
        A_S3 -->|President Signs| A_Approved["Status: approved_president<br/>SAO Budget allocation confirmed"]:::successNode
    end

    subgraph LIVE_ADMIN["PHASE 2: LIVE INSTITUTIONAL EVENT"]
        A_Approved --> A_Act["SAS Admin clicks Activate Event"]:::successNode
        A_Act --> A_Run["Live Attendance & Cross-Department Scanners"]:::successNode
        A_Run --> A_Done["Event Concludes (completed)"]:::successNode
    end

    subgraph FL_ADMIN["PHASE 3: INSTITUTIONAL LIQUIDATION (FL)"]
        A_Done --> FL_A1["SAS Admin creates Institutional Liquidation<br/>(Skips SAS clearance gate)"]:::startNode
        FL_A1 --> FL_A_S1["Stage 1: Financial Audit<br/>👤 Emily Rojas (Accountant)"]:::reviewNode
        
        FL_A_S1 -->|Return| FL_A_Ret["Status: returned<br/>Admin adjusts vouchers"]:::returnNode
        FL_A_Ret --> FL_A_S1
        
        FL_A_S1 -->|Audited| FL_A_S2["Stage 2: Administration & President<br/>• Engr. Sheena Joy<br/>• School President"]:::reviewNode
        FL_A_S2 --> FL_A_Fin["Status: settled / approved<br/>Funds auto-balanced into SAO Budget (/sao_ledger)"]:::successNode
    end

    subgraph PAR_ADMIN["PHASE 4: INSTITUTIONAL PAR"]
        A_Done --> PAR_A1["SAS Admin creates Institutional PAR<br/>(Campus-wide statistics & photo gallery)"]:::startNode
        PAR_A1 --> PAR_A_Sign["Institutional Endorsement Reviewers Sign"]:::reviewNode
        PAR_A_Sign --> PAR_A_Fin["Status: approved<br/>Institutional Activity Completed & Archived! 🏆"]:::successNode
    end
```

---

### 📝 Step-by-Step Walkthrough for SAS Admin Activities

#### Step 1: Create & Submit Institutional Proposal (AP)
1. Log in at [http://localhost:5173/admin/login](http://localhost:5173/admin/login) as **SAS Admin**.
2. Go to **Activity Proposals** $\rightarrow$ Click **"Create Institutional Proposal"**.
3. Select Target Audience: **All College Departments & Senior High School**.
4. Set Budget: e.g., `₱10,000` (Source: Student Affairs Campus Fund).
5. Notice: **Stage 1 (SAS Gate) is not present** because SAS Admin is the creator.
6. Click **"Submit Proposal"**.
   - **Current Status**: `under_review`.
   - **Active Step**: Stage 1 starts directly with Department Heads (Rona and Cybele).

#### Step 2: Department & Executive Approvals
- Log in as `rona@gmail.com` at `/portal/login` $\rightarrow$ Sign & endorse.
- Log in as `cybele@gmail.com` at `/portal/login` $\rightarrow$ Sign & endorse.
- Log in as `sheena@gmail.com` at `/portal/login` $\rightarrow$ Sign & endorse.
- School President affixes signature $\rightarrow$ Status: `approved_president`.

#### Step 3: Event Execution & Live Attendance
- In Admin Console, click **"Activate Event"**.
- Campus scanners scan attendees. Fines, payables, and attendance logs are monitored directly in the Admin console.

#### Step 4: Institutional Financial Liquidation (FL)
1. Go to **Admin Console** $\rightarrow$ **Financial Liquidation** $\rightarrow$ **Create Institutional Liquidation**.
2. Enter official receipts and invoice proof.
3. Submit for audit:
   - **Stage 1 (Accountant)**: `emily@gmail.com` (`emily12345`) logs in at `/portal/login` and audits vouchers.
   - **Stage 2**: School Administrator (`sheena@gmail.com`) and School President give final audit approval.
   - **Result**: Remaining budget automatically settles back into the SAO Central Ledger (`/sao_ledger`).

#### Step 5: Institutional Post-Activity Report (PAR)
1. SAS Admin drafts the campus-wide PAR with official documentation and survey analytics.
2. Signatories sign in parallel $\rightarrow$ Status: `approved`. The event is 100% finished and archived.

---

## 🚦 5. Status & Decision Reference Table

| Status | What It Means | Who Can Take Action? | What Happens Next? |
| :--- | :--- | :--- | :--- |
| **`draft`** | Proposal, FL, or PAR is being drafted. | Creator (Officer or Admin) | Creator can edit and click "Submit". |
| **`under_review`** | Waiting for signatures in the active stage. | Active Signatories of that stage | Signatories review, affix signature, and click "Endorse". |
| **`returned_for_revision`** (or `returned`) | Reviewer found an error or asked for changes. | Creator (Officer or Admin) | Sections with remarks are highlighted in yellow. Creator edits and clicks "Resubmit". |
| **`rejected`** | Reviewer or SAS Admin permanently disapproved. | None (Dead-end) | Proposal is archived. Creator cannot edit or resubmit. |
| **`approved_president`** (AP) | Final Presidential signature is affixed. | Officer or Admin | **"Activate Event"** button unlocks; budget is allocated. |
| **`ongoing`** / **`published`** | Event is currently live. | Scanners & Students | Students scan QR tickets; attendance updates in real time. |
| **`completed`** | Event sessions are done. | Officer or Admin | Unlocks drafting of **Financial Liquidation (FL)** and **PAR**. |
| **`settled`** / **`approved`** (FL/PAR) | Liquidation audited by Emily & President; PAR signed. | Completed | Surplus/deficit auto-credited in ledger; event is 100% closed. |

---

## 🔍 6. How to Test Visual Revision Diff & Side-by-Side Comparison

When an Activity Proposal (AP), Financial Liquidation (FL), or Post-Activity Report (PAR) is returned for revision and then resubmitted with edits, reviewers (SAS Admin and Institutional Signatories) can visually compare what was changed.

### 🧪 Test Scenario: Activity Proposal (AP) Revision
1. **Officer Submits Proposal**:
   - Log in as an Officer at [http://localhost:5173/portal/login](http://localhost:5173/portal/login).
   - Create an Activity Proposal titled `"AI & Robotics Symposium 2026"` with Total Budget `₱5,000` and Expected Pax `100`. Submit for review.
2. **Signatory Returns Proposal for Revision**:
   - Log in as a Signatory (e.g. `rona@gmail.com` / `rona12345`) at [http://localhost:5173/portal/login](http://localhost:5173/portal/login).
   - Open the proposal in **Endorsement Studio** $\rightarrow$ Click **"Return for Revision"**.
   - Input remark: *"Please update target attendance to 150 pax and adjust budget to ₱7,500."* Click confirm.
3. **Officer Edits & Resubmits**:
   - Officer logs back in, sees the **Revision Feedback Banner** with Rona's feedback.
   - Click **"Edit & Resubmit"** $\rightarrow$ Change Budget to `₱7,500` and Pax to `150` $\rightarrow$ Submit.
4. **Signatory / SAS Admin Verifies the Changes**:
   - Log in as Signatory (`rona@gmail.com`) or SAS Admin (`/admin/login`).
   - Open the resubmitted proposal.
   - Notice the **"Compare Changes"** button with a pill indicating the number of detected modifications.
   - Notice the **Inline Revision Badges** (`✏️ Revised`) next to modified fields.
   - Click **"Compare Changes"**: A modal displays side-by-side comparison with green additions (`+`), red removals (`-`), previous values, and current values!

### 🧪 Test Scenario: Financial Liquidation (FL) Revision
1. Officer submits LF-01 with itemized receipts.
2. Emily Rojas (`emily@gmail.com` / `emily12345`) flags a missing official receipt and returns the liquidation.
3. Officer re-uploads the verified BIR receipt or adjusts the expense total and resubmits.
4. When Emily or SAS Admin opens the resubmitted liquidation in **Dual-Pane Verification Studio**, clicking **"Compare Changes"** immediately highlights which expense items or receipt numbers were modified!

### 🧪 Test Scenario: Post-Activity Report (PAR) Revision
1. Officer submits Form PAR.
2. Reviewer returns PAR requesting verified participant attendance numbers.
3. Officer updates actual attendee count and resubmits.
4. Reviewer opens **PAR Detail Modal** $\rightarrow$ **"Compare Changes"** button and inline badge on `Attended (Scanned)` display the exact delta!

