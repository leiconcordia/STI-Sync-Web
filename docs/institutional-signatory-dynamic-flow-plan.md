# Dynamic Institutional Signatory & Multi-Stage Approval Workflow: Implementation Plan

## Executive Summary
This implementation plan outlines the architecture and execution steps for:
1. **Dynamic Signatory Management with Role Classification**: Introducing flexible **Approver** (authorized to grant final proposal approval) vs. **Endorser** (signs institutional endorsements) roles, supporting both standard STI roles and future custom roles.
2. **Guaranteed Role Recognition Upon Login**: Ensuring every institutional signatory automatically receives their correct roles, department scope, and approval/endorsement capabilities in their authenticated session upon logging in.
3. **Interactive Multi-Stage Flow Builder in Proposal Creation**: Enabling proposal creators (SAS Admin and Club Officers) to dynamically configure approval stages at the end of the proposal wizard (e.g., *Step 1: All Department Endorsers must sign in parallel $\rightarrow$ Step 2: Academic Head $\rightarrow$ Step 3: School Administrator & School President final approval*).

---

## 1. System Architecture & Role Model

```mermaid
graph TD
    subgraph Admin Management
        A[Admin Settings: Signatory Registry] -->|Define Signatory Roles| B[Signatory Roles Collection<br/>actionType: endorse | approve]
        A -->|Provision Signatory Account| C[institutional_signatories<br/>role, roleTitle, department, actionType]
    end

    subgraph Auth & Login Engine
        C -->|Credentials Email| D[Signatory Logs In via /portal/login]
        D -->|useOfficerAuth| E[Active Signatory Session<br/>Loaded with Role & ActionType]
    end

    subgraph Proposal Creation Wizard
        F[Wizard Steps 1-6: Proposal Content] --> G[Step 7: Signatories & Flow Builder]
        B -.-> G
        C -.-> G
        G -->|Auto-Suggest or Custom Build| H[Multi-Stage Approval Pipeline]
    end

    subgraph Dynamic Stage Execution
        H --> I[Stage 1: Parallel Endorsers]
        I -->|All Stage 1 Signatures Collected| J[Stage 2: Academic Review]
        J -->|Stage 2 Signature Collected| K[Stage 3: Executive Approvers]
        K -->|Final Approver Signs| L[Status: approved_president]
    end
```

### 1.1 Role Classification: Approver vs. Endorser

| Capability | **Endorser (`endorse`)** | **Approver (`approve`)** |
| :--- | :--- | :--- |
| **Primary Function** | Vets specific technical, logistical, or departmental scopes. | Grants official administrative or executive approval to authorize budget release and event activation. |
| **Typical Roles** | Program / Department Heads, SHS Assistant Principal, Academic Head, Guidance Counselor, Property Custodian, Clinic Officer. | School President, School Administrator, authorized Executive Dean. |
| **Workflow Impact** | Records official signature & endorsements; proposal moves to next stage. | Final signature updates proposal status to `approved_president` and unlocks event activation. |
| **UI Signatures Block** | "Endorsed By:" with official digital signature. | "Approved By:" with executive seal and digital signature. |

---

## 2. Dynamic Multi-Stage Approval Data Model

### 2.1 Multi-Stage Schema (`ProposalApprovalStep`)

To support user-defined stages with parallel signing within each stage:

```typescript
export type SignatoryActionType = 'endorse' | 'approve';
export type StepStatus = 'waiting' | 'current' | 'endorsed' | 'approved' | 'returned';

export interface ProposalApprovalStep {
  id: string; // Unique identifier for this step node
  stageIndex: number; // 1, 2, 3... indicates sequential group
  stageName?: string; // e.g. "Department Endorsements", "Academic Affairs", "Executive Approval"
  
  // Signatory & Role Attributes
  role: string; // e.g. 'program_head', 'academic_head', 'school_president', or custom code
  roleTitle: string; // e.g. "IT Program Head", "School President"
  actionType: SignatoryActionType; // 'endorse' | 'approve'
  
  // Assigned Signatory
  signatoryUid?: string;
  signatoryName: string;
  signatoryEmail: string;
  department?: string;
  
  // Execution & Audit State
  status: StepStatus;
  signedAt?: string; // ISO string
  signatureUrl?: string;
  remarks?: string;
}

export interface ActivityProposal {
  // ... other proposal fields
  approvalChain: ProposalApprovalStep[];
  currentStageIndex: number; // Active stage (e.g. 1). All signers in this stage are 'current'
  overallStatus: 'draft' | 'under_review' | 'returned_for_revision' | 'approved_president' | 'activated';
}
```

### 2.2 Stage Progression Logic

1. **Submission**: Proposal starts at `currentStageIndex = 1`.
   - All steps where `stageIndex === 1` transition to `status = 'current'`.
   - All steps where `stageIndex > 1` remain `status = 'waiting'`.
2. **Parallel Signing in Stage**:
   - Any signatory assigned in `currentStageIndex` sees the proposal in their **"Pending Review"** list.
   - When a signatory signs, their step status becomes `endorsed` (or `approved`), recording `signedAt` and `signatureUrl`.
3. **Stage Completion Gate**:
   - When **ALL** signatories in `currentStageIndex` have signed:
     - If higher stages exist: `currentStageIndex` increments (`currentStageIndex += 1`).
     - All signatories in the new stage transition from `waiting` to `current`.
     - An automated notification is triggered for newly active signers.
   - If the completed stage was the final stage containing an `approver`:
     - Proposal status transitions to `approved_president`.
4. **Revision / Return**:
   - If ANY signatory in the active stage clicks **Return for Revision**, the proposal transitions to `returned_for_revision`.
   - The creator can edit and resubmit directly back to the active stage.

---

## 3. Signatory Account Provisioning & Login Role Resolution

### 3.1 Problem Identified & Fix
- **Problem**: When a signatory is added, their record must be recognized with their specific role, permissions, and `actionType` (`endorse` vs `approve`) as soon as they log in via `/portal/login`.
- **Solution**:
  1. **Schema Extension in `institutional_signatories`**:
     - Store `actionType: 'endorse' | 'approve'` explicitly on each signatory document.
     - Link to dynamic `signatory_roles` definition (which determines default `hierarchyLevel`, `scope`, and `actionType`).
  2. **Enhanced Authentication in `useOfficerAuth`**:
     - When logging in, load the signatory's `role`, `roleTitle`, `actionType`, and `department`.
     - Construct `SIGNATORY_SESSION_KEY` with:
       ```typescript
       {
         uid: matchedRecord.id,
         id: matchedRecord.id,
         name: matchedRecord.name,
         email: matchedRecord.email,
         role: matchedRecord.role,
         roleTitle: matchedRecord.roleTitle,
         actionType: matchedRecord.actionType || (matchedRecord.role === 'school_president' ? 'approve' : 'endorse'),
         department: matchedRecord.department,
         employeeId: matchedRecord.employeeId || '',
         signatureUrl: matchedRecord.signatureUrl || null,
         isSignatory: true,
         requiresPasswordChange: matchedRecord.requiresPasswordChange ?? false,
       }
       ```
  3. **Role-Aware Dashboard (`SignatoryEndorsementsPage`)**:
     - Check matching steps using:
       - Match by `signatoryUid === session.id`
       - OR match by `signatoryEmail === session.email`
       - OR match by `role === session.role`
     - Only show as **Pending** if `proposal.currentStageIndex === step.stageIndex` and `step.status === 'current'`.

---

## 4. Interactive Flow Builder in Activity Proposal Wizard

### 4.1 Step 7 UI Layout: Dynamic Signatory Flow Builder

In `Step7ReviewSubmit.tsx`, replace the static list with an **Interactive Approval Flow Builder**:

```
┌────────────────────────────────────────────────────────────────────────┐
│  APPROVAL & SIGNATORY WORKFLOW                                          │
│  Configure the sequence of institutional endorsements and approvals.   │
│  [✨ Auto-Suggest based on Target Audience]     [+ Add Approval Stage] │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  STAGE 1: Department & Student Affairs Endorsements                   │
│  Rule: All signers in this stage must sign before advancing to Stage 2 │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 👤 Rona Mira B. Lucañas (IT Program Head)   [Endorser]   [✕]     │  │
│  │ 👤 Cybele T. Nodalo (SHS Asst. Principal)   [Endorser]   [✕]     │  │
│  │ [+ Add Signatory to Stage 1]                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│                                  │                                     │
│                                  ▼                                     │
│                                                                        │
│  STAGE 2: Academic Affairs Review                                      │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 👤 Humabona L. Gonzales (Academic Head)     [Endorser]   [✕]     │  │
│  │ [+ Add Signatory to Stage 2]                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│                                  │                                     │
│                                  ▼                                     │
│                                                                        │
│  STAGE 3: Executive Administration & Presidential Approval             │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │ 👤 Engr. Sheena Joy S. Muyuela (Admin)      [Endorser]   [✕]     │  │
│  │ 👤 Atty. Antonio R. Lucero (President)      [Approver]   [✕]     │  │
│  │ [+ Add Signatory to Stage 3]                                     │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Key Features of the Flow Builder:
- **Preset Quick-Apply**: One click to auto-populate recommended stages based on selected target programs (e.g. BSIT $\rightarrow$ IT Head, SHS $\rightarrow$ SHS Principal).
- **Stage Management**:
  - Add New Stage (`+ Add Stage`)
  - Move Stage Up / Down
  - Delete Stage
- **Signatory Assignment**:
  - Dropdown selector containing all active signatories from `institutional_signatories`.
  - Type toggle: Click to switch between `Endorser` (teal badge) and `Approver` (emerald badge).
  - Remove signer button.
- **Validation Guardrails**:
  - Every stage must have at least 1 signatory.
  - Final stage must contain at least one `Approver`.
  - Cannot submit without an approval chain configured.

---

## 5. Phased Implementation Roadmap

### Phase 1: Signatory Roles & Account Login Role Integrity
1. Update `InstitutionalSignatory` & `SignatoryRoleDocument` types in [signatory.types.ts](file:///c:/VSCODE%20PROJECTS/STI%20SYNC%20WEB%20AND%20MOBILE/STI%20Sync%20Web/src/app/modules/signatories/types/signatory.types.ts) and [signatory-role.types.ts](file:///c:/VSCODE%20PROJECTS/STI%20SYNC%20WEB%20AND%20MOBILE/STI%20Sync%20Web/src/app/modules/signatories/types/signatory-role.types.ts).
2. Update [InstitutionalSignatoryManagement.tsx](file:///c:/VSCODE%20PROJECTS/STI%20SYNC%20WEB%20AND%20MOBILE/STI%20Sync%20Web/src/app/admin/components/settings/InstitutionalSignatoryManagement.tsx) to allow assigning `actionType` (`endorse` vs `approve`) when adding/editing signatories.
3. Update [useOfficerAuth.ts](file:///c:/VSCODE%20PROJECTS/STI%20SYNC%20WEB%20AND%20MOBILE/STI%20Sync%20Web/src/app/auth/hooks/useOfficerAuth.ts) to store full signatory role context and `actionType` in the session.

### Phase 2: Multi-Stage Workflow Data Model & Backend Progression
1. Update `ProposalApprovalStep` and `ActivityProposal` in [proposal.types.ts](file:///c:/VSCODE%20PROJECTS/STI%20SYNC%20WEB%20AND%20MOBILE/STI%20Sync%20Web/src/app/modules/activity-proposals/types/proposal.types.ts) with `stageIndex`, `stageName`, and `actionType`.
2. Refactor `endorseProposal` in [proposal.service.ts](file:///c:/VSCODE%20PROJECTS/STI%20SYNC%20WEB%20AND%20MOBILE/STI%20Sync%20Web/src/app/modules/activity-proposals/services/proposal.service.ts):
   - Record individual signatory's endorsement/approval.
   - Check if all signers in the current stage are complete before advancing `currentStageIndex`.
   - Transition to `approved_president` when final approver in the last stage signs.

### Phase 3: Interactive Flow Builder Component
1. Create `ProposalFlowBuilder.tsx` component inside `src/app/modules/activity-proposals/components/workflow/`.
2. Integrate `ProposalFlowBuilder` into [Step7ReviewSubmit.tsx](file:///c:/VSCODE%20PROJECTS/STI%20SYNC%20WEB%20AND%20MOBILE/STI%20Sync%20Web/src/app/modules/activity-proposals/components/wizard/Step7ReviewSubmit.tsx).
3. Connect with `signatories` list and `targetAudience` preset generator.

### Phase 4: Signatory Dashboard & Endorsement Modal Execution
1. Update [SignatoryEndorsementsPage.tsx](file:///c:/VSCODE%20PROJECTS/STI%20SYNC%20WEB%20AND%20MOBILE/STI%20Sync%20Web/src/app/signatory/pages/SignatoryEndorsementsPage.tsx) to match proposals using stage-based indexing.
2. Adapt [ProposalEndorsementModal.tsx](file:///c:/VSCODE%20PROJECTS/STI%20SYNC%20WEB%20AND%20MOBILE/STI%20Sync%20Web/src/app/signatory/components/ProposalEndorsementModal.tsx):
   - If signer has `actionType === 'approve'`, display "Executive Approval" CTA and confirmation.
   - If signer has `actionType === 'endorse'`, display "Endorse Proposal" CTA.
   - Show stage context (e.g. "Stage 1 of 3: Department Endorsement").

---

## 6. Verification & Testing Plan
- **Verification 1: Signatory Creation & Login Role Test**: Add a test signatory (e.g., Guidance Counselor as Endorser, School President as Approver), log in at `/portal/login`, and verify session role, title, and permissions.
- **Verification 2: Custom Flow Configuration**: In Proposal Wizard Step 7, construct a 3-stage flow (Stage 1: 2 endorsers, Stage 2: 1 endorser, Stage 3: 1 approver) and submit proposal.
- **Verification 3: Parallel Stage Progression**:
  - Sign as Signatory A in Stage 1 $\rightarrow$ verify proposal remains in Stage 1 until Signatory B signs.
  - Sign as Signatory B in Stage 1 $\rightarrow$ verify Stage 1 completes and Stage 2 unlocks.
  - Sign in Stage 2 $\rightarrow$ verify Stage 3 unlocks.
  - Sign as Approver in Stage 3 $\rightarrow$ verify proposal transitions to `approved_president`.
