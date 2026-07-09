# STI Sync — Database Schema Reference

> **Purpose:** Single source of truth for all Firestore document structures and WebSocket message contracts. Every field, type, and constraint is defined here. AI agents and developers must validate field references against this document before writing queries or mutations.

---

## 1. Firestore Collections

<!-- AGENT-UPDATED: 2026-06-12 — Added `sas_admins` collection for SAO Adviser user profiles -->

<!-- AGENT-UPDATED: 2026-07-09 — Added `announcements` collection for admin announcements -->

### 1.0a `announcements`

**Path:** `/announcements/{announcementId}`

```typescript
type AnnouncementPriority = 'Normal' | 'Important' | 'Urgent';
type AnnouncementAudience = 'campus-wide' | 'all-organizations' | 'specific';

interface AnnouncementDocument {
  id: string;                              // Auto-generated Firestore document ID

  // ─── Content ───
  title: string;                           // e.g., "Reminder: Event Proposal Deadline"
  content: string;                         // Plain text for now
  priority: AnnouncementPriority;

  // ─── Targeting ───
  audience: AnnouncementAudience;
  targetOrgIds: string[];                  // Populated only when audience === 'specific'
  targetOrgNames: string[];                // Denormalized names for display

  // ─── Pinning ───
  pinned: boolean;                         // Pinned announcements float to top

  // ─── Academic Context ───
  semesterId: string;                      // FK → /semesters
  schoolYear: string;                      // e.g., "2025-2026"

  // ─── Author ───
  authorName: string;                      // e.g., "Riselle Mae B. Lucanas"
  authorUid: string;                       // FK → /sas_admins

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `createdAt` DESC — ordered feed (pinned sorting handled locally)

---

### 1.0b `sas_admins`

**Path:** `/sas_admins/{uid}`

> Document ID equals the Firebase Auth UID of the adviser. Created manually in the Firestore console by the system administrator.

```typescript
interface SasAdminDocument {
  // ─── Identity ───
  uid: string;                             // Mirrors the document ID (Firebase Auth UID)
  firstName: string;                       // e.g., "Riselle Mae"
  lastName: string;                        // e.g., "Lucanas"
  middleName: string | null;               // Middle name — optional
  displayName: string;                     // e.g., "Riselle Mae B. Lucanas"
  email: string;                           // Must match Firebase Auth email exactly
  phoneNumber: string | null;              // Philippine mobile number for phone auth

  // ─── Position ───
  position: string;                        // e.g., "SAO Adviser"
  department: string;                      // e.g., "Student Affairs Office"
  role: 'admin';                           // Always 'admin' — discriminates from officer docs

  // ─── Profile ───
  avatarUrl: string | null;               // Firebase Storage URL for profile photo

  // ─── Account State ───
  isActive: boolean;                       // false = account disabled; login rejected

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;                       // Admin UID or 'system' for seed records
}
```

**Access Pattern:**
- Document ID = Firebase Auth UID (one-to-one with Auth user)
- Read on every login: `getDoc(doc(db, 'sas_admins', uid))` to verify profile exists and `isActive === true`
- Real-time subscription via `useAdviserProfile()` hook for live profile display

**Manual Setup (Firestore Console):**
After creating the user in Firebase Authentication, create the matching document under `sas_admins/{authUid}` with all fields above.

**Indexes Required:**
- None required — documents are always fetched by their ID (Auth UID)

---

<!-- AGENT-UPDATED: 2026-06-12 — Added `departments`, `courses`, `sections` collections for academic registry -->

### 1.1 `departments`

**Path:** `/departments/{departmentId}`

```typescript
interface DepartmentDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "School of Computer Studies"
  code: string;                            // e.g., "SCS"
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `archived` ASC, `name` ASC

---

### 1.2 `courses`

**Path:** `/courses/{courseId}`

```typescript
interface CourseDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "Bachelor of Science in Information Technology"
  code: string;                            // e.g., "BSIT"
  departmentId: string;                    // FK → /departments
  yearLevels: number;                      // e.g., 4
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `archived` ASC, `departmentId` ASC
- `archived` ASC, `name` ASC

---

### 1.3 `sections`

**Path:** `/sections/{sectionId}`

```typescript
interface SectionDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "BSIT 1101" (manually entered)
  courseId: string;                        // FK → /courses
  departmentId: string;                    // Denormalized FK → /departments for easier querying
  yearLevel: number;                       // e.g., 1
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `archived` ASC, `courseId` ASC
- `archived` ASC, `departmentId` ASC
- `archived` ASC, `name` ASC

---

> Document ID equals the Firebase Auth UID of the adviser. Created manually in the Firestore console by the system administrator.

```typescript
interface SasAdminDocument {
  // ─── Identity ───
  uid: string;                             // Mirrors the document ID (Firebase Auth UID)
  firstName: string;                       // e.g., "Riselle Mae"
  lastName: string;                        // e.g., "Lucanas"
  middleName: string | null;               // Middle name — optional
  displayName: string;                     // e.g., "Riselle Mae B. Lucanas"
  email: string;                           // Must match Firebase Auth email exactly
  phoneNumber: string | null;              // Philippine mobile number for phone auth

  // ─── Position ───
  position: string;                        // e.g., "SAO Adviser"
  department: string;                      // e.g., "Student Affairs Office"
  role: 'admin';                           // Always 'admin' — discriminates from officer docs

  // ─── Profile ───
  avatarUrl: string | null;               // Firebase Storage URL for profile photo

  // ─── Account State ───
  isActive: boolean;                       // false = account disabled; login rejected

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;                       // Admin UID or 'system' for seed records
}
```

**Access Pattern:**
- Document ID = Firebase Auth UID (one-to-one with Auth user)
- Read on every login: `getDoc(doc(db, 'sas_admins', uid))` to verify profile exists and `isActive === true`
- Real-time subscription via `useAdviserProfile()` hook for live profile display

**Manual Setup (Firestore Console):**
After creating the user in Firebase Authentication, create the matching document under `sas_admins/{authUid}` with all fields above.

**Indexes Required:**
- None required — documents are always fetched by their ID (Auth UID)

---

<!-- AGENT-UPDATED: 2026-06-12 — Added `departments`, `courses`, `sections` collections for academic registry -->

### 1.1 `departments`

**Path:** `/departments/{departmentId}`

```typescript
interface DepartmentDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "School of Computer Studies"
  code: string;                            // e.g., "SCS"
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `archived` ASC, `name` ASC

---

### 1.2 `courses`

**Path:** `/courses/{courseId}`

```typescript
interface CourseDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "Bachelor of Science in Information Technology"
  code: string;                            // e.g., "BSIT"
  departmentId: string;                    // FK → /departments
  yearLevels: number;                      // e.g., 4
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `archived` ASC, `departmentId` ASC
- `archived` ASC, `name` ASC

---

### 1.3 `sections`

**Path:** `/sections/{sectionId}`

```typescript
interface SectionDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "BSIT 1101" (manually entered)
  courseId: string;                        // FK → /courses
  departmentId: string;                    // Denormalized FK → /departments for easier querying
  yearLevel: number;                       // e.g., 1
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `archived` ASC, `courseId` ASC
- `archived` ASC, `departmentId` ASC
- `archived` ASC, `name` ASC

---

> Document ID equals the Firebase Auth UID of the adviser. Created manually in the Firestore console by the system administrator.

```typescript
interface SasAdminDocument {
  // ─── Identity ───
  uid: string;                             // Mirrors the document ID (Firebase Auth UID)
  firstName: string;                       // e.g., "Riselle Mae"
  lastName: string;                        // e.g., "Lucanas"
  middleName: string | null;               // Middle name — optional
  displayName: string;                     // e.g., "Riselle Mae B. Lucanas"
  email: string;                           // Must match Firebase Auth email exactly
  phoneNumber: string | null;              // Philippine mobile number for phone auth

  // ─── Position ───
  position: string;                        // e.g., "SAO Adviser"
  department: string;                      // e.g., "Student Affairs Office"
  role: 'admin';                           // Always 'admin' — discriminates from officer docs

  // ─── Profile ───
  avatarUrl: string | null;               // Firebase Storage URL for profile photo

  // ─── Account State ───
  isActive: boolean;                       // false = account disabled; login rejected

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;                       // Admin UID or 'system' for seed records
}
```

**Access Pattern:**
- Document ID = Firebase Auth UID (one-to-one with Auth user)
- Read on every login: `getDoc(doc(db, 'sas_admins', uid))` to verify profile exists and `isActive === true`
- Real-time subscription via `useAdviserProfile()` hook for live profile display

**Manual Setup (Firestore Console):**
After creating the user in Firebase Authentication, create the matching document under `sas_admins/{authUid}` with all fields above.

**Indexes Required:**
- None required — documents are always fetched by their ID (Auth UID)

---

### 1.4 `organization_types`

**Path:** `/organization_types/{typeId}`

```typescript
interface OrganizationTypeDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "Academic", "Civic", "Cultural"
  color: string;                           // e.g., "#0E4EBD"
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `name` ASC

### 1.5 `officer_roles`

**Path:** `/officer_roles/{roleId}`

```typescript
interface OfficerRoleDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "President", "Vice President"
  isRequired: boolean;                     // Whether this role is strictly required when creating an org
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `name` ASC

### 1.6 `system_settings`

**Path:** `/system_settings/{settingId}`

> System-wide configuration settings. Uses predefined document IDs (e.g., `organization_rules`).

**Document ID: `organization_rules`**
```typescript
interface OrganizationRulesDocument {
  minMembersRequired: number;
  minOfficersRequired: number;
  
  updatedAt: Timestamp;
}
```

<!-- AGENT-UPDATED: 2026-06-25 — Added `document_settings` to system_settings collection for EDMS configuration -->

**Document ID: `document_settings`**
```typescript
interface DocumentSettingsDocument {
  // Reference Number Format
  refPrefix: string;                       // e.g., "DOC"
  refSeparator: string;                    // e.g., "-"
  refIncludeYear: boolean;
  refPadding: number;                      // e.g., 4

  // Retention & Archival
  retentionYears: number;
  autoArchiveCompleted: boolean;
  archiveAfterSemesters: number;
  allowOfficerDelete: boolean;
  draftExpiryDays: number;

  updatedAt: Timestamp;
}
```

---

<!-- AGENT-UPDATED: 2026-06-25 — Added `document_categories` collection for EDMS category management -->

### 1.6b `document_categories`

**Path:** `/document_categories/{categoryId}`

> Categories used in the Electronic Document Management System. Officers select from these when submitting documents. Managed by SAO Admin in Settings → Document Management.

```typescript
interface DocumentCategoryDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "Activity Letter"
  color: string;                           // Tailwind classes e.g., "bg-[#F3E8FF] text-[#83358E]"
  colorDot: string;                        // Dot color e.g., "bg-[#83358E]"
  requiresRemarks: boolean;                // SAS must provide remarks when rejecting
  officerCanSubmit: boolean;               // Category visible in officer submission form
  active: boolean;                         // Whether category is enabled
  sortOrder: number;                       // For drag-to-reorder
  archived: boolean;                       // Soft delete flag

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `sortOrder` ASC — for ordered listing
- `active` ASC, `name` ASC — for dropdown filtering

---

<!-- AGENT-UPDATED: 2026-06-25 — Added `documents` collection for Electronic Document Management System (EDMS) -->

### 1.6c `documents`

**Path:** `/documents/{documentId}`

> Core EDMS collection. A single collection with a `type` discriminator handles both officer→SAS submissions and SAS→club broadcasts. Both admin and officer pages read/write to this collection using real-time `onSnapshot` streams.

```typescript
type DocFileType = 'PDF' | 'DOCX' | 'XLSX' | 'JPG' | 'PNG' | 'OTHER';
type DocStatus = 'Pending' | 'Approved' | 'Rejected' | 'Resubmitted' | 'Draft';
type DocDistribution = 'all' | 'specific' | 'type';

interface DocumentDocument {
  id: string;

  // ─── Classification ───
  type: 'submission' | 'broadcast';        // submission = officer→SAS, broadcast = SAS→orgs
  title: string;
  description: string;                     // message/notes
  category: string;                        // category name from document_categories
  categoryId: string;                      // FK → /document_categories

  // ─── File (Cloudinary) ───
  fileUrl: string;                         // Cloudinary secure_url
  fileName: string;                        // original file name
  fileType: DocFileType;
  fileSize: number;                        // bytes (max 25 MB enforced client-side)

  // ─── Academic Context ───
  semesterId: string;                      // FK → /semesters
  academicYear: string;                    // e.g., "2025-2026"
  semester: string;                        // e.g., "2nd Semester"

  // ─── Reference ───
  referenceNumber: string;                 // auto-generated e.g., "DOC-2026-0001" (officer) or "SAS-2026-0001" (admin)

  // ─── Submission-specific (type === 'submission') ───
  submittedBy: string;                     // officer name
  submittedByEmail: string;
  submittedByOrgId: string;                // FK → /organizations
  submittedByOrgName: string;              // denormalized
  submittedByOrgAcronym: string;           // denormalized
  submittedByOrgTypeId: string;            // FK → /organization_types
  status: DocStatus;
  remarks: string | null;                  // SAS admin remarks on approve/reject
  reviewedBy: string | null;               // admin name
  reviewedAt: Timestamp | null;
  resubmissionOf: string | null;           // FK → /documents (original doc ID if resubmitted)
  resubmissionNote: string | null;         // "What changed" text

  // ─── Broadcast-specific (type === 'broadcast') ───
  broadcastBy: string;                     // admin name
  broadcastByUid: string;                  // admin uid
  distribution: DocDistribution;
  targetOrgIds: string[];                  // specific org IDs (empty for 'all')
  targetOrgTypeId: string | null;          // for 'type' distribution
  readBy: Record<string, Timestamp>;       // orgId → timestamp when opened

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**File Storage Model (Cloudinary):**
- All document files (PDF, DOCX, DOC, XLSX, JPG, PNG) are uploaded to **Cloudinary** via `uploadToCloudinary()`.
- Submissions go to folder `documents/submissions`, broadcasts to `documents/broadcast`.
- Firestore stores only the Cloudinary `secure_url` in `fileUrl`.

**Access Pattern:**
- Admin reads all submissions: `where('type', '==', 'submission')`, `orderBy('createdAt', 'desc')`
- Admin reads all broadcasts: `where('type', '==', 'broadcast')`, `orderBy('createdAt', 'desc')`
- Officer reads own submissions: `where('type', '==', 'submission')` + `where('submittedByOrgId', '==', orgId)`
- Officer inbox (broadcasts): `where('type', '==', 'broadcast')` + client-side filter by `distribution === 'all'` OR `targetOrgIds.includes(orgId)`

**Reference Number Generation:**
- `getNextReferenceNumber(prefix)` queries latest doc matching `{prefix}-{year}-*`, increments counter, pads to 4 digits
- Officers use prefix `DOC`, admin broadcasts use prefix `SAS`

**Indexes Required:**
- `type` ASC, `createdAt` DESC — admin incoming/sent views
- `type` ASC, `submittedByOrgId` ASC, `createdAt` DESC — officer submissions
- `referenceNumber` ASC — reference number generation query

---

<!-- AGENT-UPDATED: 2026-06-15 — Updated organizations schema: typeId (FK → /organization_types), departmentId (FK → /departments or 'cross-departmental'), academicYear/semester from active semester -->
### 1.6 `organizations`

**Path:** `/organizations/{organizationId}`

```typescript
interface OrganizationDocument {
  // ─── Identity ───
  id: string;                                   // Auto-generated Firestore document ID
  name: string;                                 // e.g., "Supreme Student Government"
  acronym: string;                              // e.g., "SSG"
  typeId: string;                               // FK → /organization_types
  departmentId: string | 'cross-departmental';  // FK → /departments or sentinel value
  description: string;

  // ─── Academic Context ───
  academicYear: string;                         // e.g., "2025-2026" — copied from active SemesterDocument
  semester: string;                             // e.g., "1st Semester"

  // ─── Metadata ───
  status: 'active' | 'inactive' | 'suspended';
  memberCount: number;                          // Denormalized count — starts at 0
  logoUrl: string | null;                       // Firebase Storage URL for org logo

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;                            // Admin user ID who created the org
}
```

**Indexes Required:**
- `status` ASC, `name` ASC — for admin org listing
- `typeId` ASC, `status` ASC — for type-filtered views
- `departmentId` ASC — for department grouping

---

### 1.7 `organization_officers`

**Path:** `/organization_officers/{officerId}`

```typescript
interface OrganizationOfficerDocument {
  id: string;                              // Auto-generated Firestore document ID
  organizationId: string;                  // FK → /organizations
  roleId: string;                          // FK → /officer_roles
  
  // ─── Identity ───
  studentId: string;                       // ID number of the student (e.g. 2024-00123)
  studentName: string;
  email: string;
  
  // ─── Account State ───
  isActive: boolean;
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `organizationId` ASC
- `email` ASC

---

<!-- AGENT-UPDATED: 2026-06-17 — Added `students` collection. Profile/school-ID photos are stored in Cloudinary (cloud `djwlkcgnx`, unsigned preset `sti_sync_uploads`); Firestore holds only the Cloudinary `secure_url`. -->

### 1.8 `students`

**Path:** `/students/{authUid}`

> Document ID equals the student's Firebase Auth UID. Created either by self-registration
> (mobile app) or manually from the SAO Admin panel via `AddStudentManuallyModal.tsx` →
> `createStudentManually()` in `src/app/modules/students/services/student.service.ts`.

```typescript
type StudentSex       = 'Male' | 'Female';
type StudentYearLevel = '1st Year' | '2nd Year' | '3rd Year' | '4th Year';
type StudentSemester  = '1st Semester' | '2nd Semester';
type StudentStatus    = 'ACTIVE' | 'PENDING' | 'RETURNED' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';

interface StudentDocument {
  // ─── Identity ───
  id: string;                              // Firestore doc id (= Firebase Auth UID)
  lastName: string;
  firstName: string;
  middleName: string;                      // empty string if not provided
  studentId: string;                       // official STI student ID — 11 digits
  dateOfBirth: string;                     // ISO date string YYYY-MM-DD
  sex: StudentSex;
  contactNumber: string;                   // digits only, no country code

  // ─── Academic ───
  courseId: string;                        // FK → /courses
  courseName: string;                      // Denormalized
  courseCode: string;                      // Denormalized
  departmentId: string;                    // FK → /departments
  departmentName: string;                  // Denormalized
  yearLevel: StudentYearLevel;
  section: string;
  schoolYear: string;                      // e.g., "2026-2027"
  semester: StudentSemester;

  // ─── Account ───
  email: string;                           // Lowercased; matches Firebase Auth email
  authUid: string;                         // Firebase Auth UID (mirrors doc id)

  // ─── Media (Cloudinary) ───
  profilePhotoUrl: string;                 // Cloudinary secure_url for selfie; '' if not uploaded
  schoolIdPhotoUrl: string;                // Cloudinary secure_url for school ID; '' if not uploaded

  // ─── Registry ───
  status: StudentStatus;
  registrationSource: 'MANUAL' | 'SELF_REGISTER';
  addedBy: string;                         // Admin UID who created the record (manual flow)
  rejectionReason?: string;                // Set when status === 'RETURNED'

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Image Storage Model (Cloudinary):**
- Student selfie + school-ID photos are **not** stored in Firebase Storage. They are uploaded
  to **Cloudinary** (cloud name `djwlkcgnx`, unsigned upload preset `sti_sync_uploads`) using `axios`.
- Firestore persists **only** the returned `secure_url` string in `profilePhotoUrl` /
  `schoolIdPhotoUrl`. `PendingVerification.tsx` renders these URLs directly (with a `ui-avatars`
  fallback on load error).
- This is a **client-side unsigned upload**: only the cloud name + preset are used in the browser.
  The Cloudinary **API Secret must never appear in client code** — an unsigned preset needs no secret.

**Access Pattern:**
- Document ID = Firebase Auth UID (one-to-one with Auth user).
- Real-time list via `useStudents()` (`onSnapshot` ordered by `lastName` ASC).
- Uniqueness guards before create: `isStudentIdTaken(studentId)` and `isEmailTaken(email)`.
- Status transitions: `updateStudentStatus(id, status)`; return/reject via `returnStudent(id, reason)`.

**Indexes Required:**
- `status` ASC, `lastName` ASC — registry queues (pending / active / etc.)
- `studentId` ASC — uniqueness lookup
- `email` ASC — uniqueness lookup

---

### 1.2 `events`

**Path:** `/events/{eventId}`

```typescript
interface EventDocument {
  // ─── Identity ───
  id: string;
  title: string;
  description: string;
  eventType: 'academic' | 'co-curricular' | 'institutional' | 'community-outreach';
  format: 'in-person' | 'virtual' | 'hybrid';

  // ─── Ownership ───
  organizationId: string;                  // FK → /organizations
  organizationName: string;                // Denormalized
  createdBy: string;                       // User ID of the creator
  createdByRole: 'admin' | 'officer';      // Tracks origin context

  // ─── Approval Pipeline ───
  proposalStatus: 'draft' | 'pending_review' | 'approved' | 'rejected' | 'cancelled';
  approvedBy: string | null;              // Admin user ID who approved
  approvedAt: Timestamp | null;
  rejectionReason: string | null;
  fastTrack: boolean;                     // Admin-only: bypasses normal review queue

  // ─── Schedule ───
  academicYear: string;
  semester: '1st' | '2nd' | 'summer';
  sessions: Session[];                     // Nested array — defined below
  venue: string;

  // ─── Participants ───
  eligibleParticipants: 'all' | 'specific';
  targetYearLevels: number[];              // e.g., [1, 2, 3, 4]
  targetPrograms: string[];               // e.g., ["BSIT", "BSCS"]
  expectedParticipantCount: number;

  // ─── Budget ───
  budget: EventBudget;                     // Nested object — defined below

  // ─── Student Payables Policy ───
  studentPayablesEnabled: boolean;         // Master toggle (Admin Step 5)
  suggestedFeePerStudent: number | null;   // Auto-calculated: totalBudget ÷ participantCount
  adminFeeOverride: number | null;         // Admin-set final fee (overrides suggested)
  totalExpectedCollection: number | null;  // adminFeeOverride × participantCount

  // ─── Document Checklist ───
  documents: DocumentChecklist;            // Nested object — defined below

  // ─── Media ───
  coverImageUrl: string | null;
  galleryUrls: string[];

  // ─── Staff ───
  coreTeam: StaffAssignment[];             // Event committee members
  scannerOfficers: ScannerAssignment[];    // QR scanner-assigned officers

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
  publishedAt: Timestamp | null;
}
```

#### Nested: `Session`

```typescript
interface Session {
  sessionId: string;                       // UUID per session
  title: string;                           // e.g., "Day 1 — Opening Ceremony"
  date: Timestamp;
  startTime: string;                       // "08:00" — 24h format
  endTime: string;                         // "17:00"
  attendanceWindowStart: string;           // Gate opens — e.g., "07:30"
  attendanceWindowEnd: string;             // Gate closes — e.g., "09:00"
}
```

#### Nested: `EventBudget`

```typescript
interface EventBudget {
  totalBudget: number;                     // Sum of all line items
  lineItems: BudgetLineItem[];
  fundingSources: FundingSource[];
}

interface BudgetLineItem {
  itemId: string;
  category: string;                        // e.g., "Venue", "Food", "Materials"
  description: string;
  quantity: number;
  unitCost: number;
  totalCost: number;                       // quantity × unitCost
}

interface FundingSource {
  sourceId: string;
  name: string;                            // e.g., "Organization Fund", "SAO Fund", "Sponsorship"
  amount: number;
}
```

#### Nested: `DocumentChecklist`

```typescript
interface DocumentChecklist {
  requiredDocuments: RequiredDocument[];    // Minimum 3 required
  additionalDocuments: AdditionalDocument[];
  adviserAuthorization: {
    authorized: boolean;
    authorizedBy: string | null;           // Adviser name
    authorizedAt: Timestamp | null;
  };
}

interface RequiredDocument {
  docType: 'activity_proposal' | 'budget_proposal' | 'venue_request';
  label: string;
  fileUrl: string | null;                  // Firebase Storage path
  uploadedAt: Timestamp | null;
  status: 'pending' | 'uploaded' | 'approved' | 'rejected';
}

interface AdditionalDocument {
  docId: string;
  label: string;
  fileUrl: string | null;
  uploadedAt: Timestamp | null;
}
```

#### Nested: `StaffAssignment` / `ScannerAssignment`

```typescript
interface StaffAssignment {
  userId: string;
  name: string;
  role: string;                            // e.g., "Event Head", "Logistics Lead"
  email: string;
}

interface ScannerAssignment {
  userId: string;
  name: string;
  assignedSessions: string[];             // Array of sessionIds
  permissions: {
    canMarkManual: boolean;                // Can manually override attendance
    canExport: boolean;                    // Can export scan logs
  };
}
```

**Indexes Required:**
- `organizationId` ASC, `createdAt` DESC — officer event list
- `proposalStatus` ASC, `createdAt` DESC — admin pending review queue
- `proposalStatus` ASC, `organizationId` ASC — officer filtered views
- `studentPayablesEnabled` ASC — payables-linked queries

---

### 1.3 `attendance`

**Path:** `/attendance/{attendanceId}`

```typescript
interface AttendanceDocument {
  // ─── Identity ───
  id: string;
  eventId: string;                         // FK → /events
  sessionId: string;                       // FK → events.sessions[].sessionId
  studentId: string;                       // Student user ID
  organizationId: string;                  // FK → /organizations (for multi-tenant filters)

  // ─── Student Info (denormalized) ───
  studentName: string;
  studentNumber: string;                   // e.g., "STI-2025-0001"
  course: string;
  yearLevel: number;

  // ─── Scan Data ───
  scanMethod: 'qr' | 'manual';            // How the attendance was recorded
  scannedBy: string;                       // Officer user ID who operated the scanner
  scannedByName: string;                   // Denormalized scanner officer name
  gateType: 'entry' | 'exit';

  // ─── Timestamps ───
  scannedAt: Timestamp;                    // Exact moment of scan
  createdAt: Timestamp;
  serverTimestamp: Timestamp;              // Firestore server-set timestamp for ordering
}
```

**Indexes Required:**
- `eventId` ASC, `sessionId` ASC, `scannedAt` DESC — per-session attendance log
- `organizationId` ASC, `eventId` ASC — officer-scoped attendance queries
- `studentId` ASC, `eventId` ASC — per-student attendance across sessions
- `scannedAt` DESC — global timeline view (admin)

**Write Rules:**
- A document in `/attendance` must **never** be written if the corresponding `/payables` record has `qrTicketUnlocked: false`. This is enforced client-side in the `useValidateGateAccess` hook (see `officer-backend-context.md`).

---

### 1.4 `payables`

**Path:** `/payables/{payableId}`

```typescript
interface PayableDocument {
  // ─── Identity ───
  id: string;
  eventId: string;                         // FK → /events
  studentId: string;                       // Student user ID
  organizationId: string;                  // FK → /organizations

  // ─── Student Info (denormalized) ───
  studentName: string;
  studentNumber: string;
  course: string;
  yearLevel: number;

  // ─── Payment Data ───
  amountDue: number;                       // Copied from events.adminFeeOverride at creation
  amountPaid: number;                      // 0 until payment recorded
  paymentStatus: 'unpaid' | 'paid' | 'waived' | 'refunded';
  paidAt: Timestamp | null;
  paymentMethod: 'cash' | 'gcash' | 'bank_transfer' | null;
  paymentReference: string | null;         // Transaction ID or receipt number
  processedBy: string | null;             // Admin/officer user ID who confirmed payment

  // ─── QR Access Control ───
  qrTicketUnlocked: boolean;              // DEFAULT: false
                                           // Set to true ONLY when paymentStatus transitions to 'paid' or 'waived'
                                           // When false: student CANNOT check in via QR gate scanning
                                           // When true: student CAN check in

  // ─── Transaction History ───
  transactions: PaymentTransaction[];

  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

#### Nested: `PaymentTransaction`

```typescript
interface PaymentTransaction {
  transactionId: string;
  type: 'payment' | 'waiver' | 'refund' | 'reversal';
  amount: number;
  method: 'cash' | 'gcash' | 'bank_transfer' | null;
  reference: string | null;
  note: string | null;                     // e.g., "Waived — financial hardship"
  processedBy: string;                     // User ID
  processedByName: string;                // Denormalized
  timestamp: Timestamp;
}
```

**Indexes Required:**
- `eventId` ASC, `paymentStatus` ASC — event payables dashboard
- `studentId` ASC, `eventId` ASC — per-student payment lookup
- `organizationId` ASC, `eventId` ASC, `paymentStatus` ASC — officer-scoped filtered views
- `qrTicketUnlocked` ASC, `eventId` ASC — gate access pre-check queries

**Critical Access Control Policy:**
```
┌──────────────────────────────────────────────────────────┐
│  qrTicketUnlocked: false                                 │
│  ──────────────────────────────                          │
│  → Student BLOCKED from QR gate check-in                │
│  → Scanner must display "PAYMENT REQUIRED" lock screen  │
│  → NO write to /attendance permitted                     │
│  → Enforced in useValidateGateAccess hook               │
├──────────────────────────────────────────────────────────┤
│  qrTicketUnlocked: true                                  │Require adviser approval for new organizations

Allow students to join multiple organizations

Require constitution and by-laws upload
│  ──────────────────────────────                          │
│  → Student ALLOWED through QR gate                      │
│  → Write to /attendance committed                        │
│  → WebSocket trigger ATTENDANCE_SCANNED fired           │
└──────────────────────────────────────────────────────────┘
```
```

---

<!-- AGENT-UPDATED: 2026-06-18 — Added `sao_ledger` collection for tracking school budget allocations and expenses -->

### 1.5 `sao_ledger`

**Path:** `/sao_ledger/{transactionId}`

```typescript
interface SaoLedgerDocument {
  id: string;                              // Auto-generated Firestore document ID
  semesterId: string | null;               // FK → /semesters (null for carry-over or manual expense)
  date: Timestamp;                         // The date of the transaction
  description: string;                     // e.g. "SAO Institutional Fund - 1st Semester..."
  eventId: string | null;                  // FK → /events (optional)
  type: 'income' | 'expense';
  source: 'allocation' | 'student_collection' | 'manual_expense' | 'carry_over';
  amount: number;
  addedBy: string;                         // Admin user name or ID
  collectionId?: string;                   // Link to payables/collections if applicable
  
  // ─── Timestamps ───
  createdAt: Timestamp;
}
```

<!-- AGENT-UPDATED: 2026-06-18 — Added `organization_ledger` collection for tracking club budget allocations and expenses -->
### 4.8 `organization_ledger`

**Path:** `/organization_ledger/{transactionId}`
**Purpose:** Organization-scoped chronological ledger of all club income (memberships, sponsorships) and expenses (liquidations, manual expenses).

```typescript
interface OrgLedgerDocument {
  organizationId: string;        // FK → /organizations
  semesterId: string | null;     // FK → /semesters
  date: Timestamp;
  description: string;
  eventId: string | null;        // Optional FK → /events
  type: 'income' | 'expense';
  source: 'allocation' | 'student_collection' | 'manual_expense' | 'carry_over' | 'sponsorship';
  amount: number;
  addedBy: string;               // Officer's Name
  collectionId?: string;         // FK → /payables/collections
  createdAt: Timestamp;
}
```

**Indexes Required:**
- `organizationId` ASC, `date` ASC — computing running balances
- `organizationId` ASC, `createdAt` DESC — displaying transaction history

---

## 2. WebSocket Message Schema Matrix

**Connection:** `src/services/websocket.ts`

WebSocket messages are **ephemeral triggers only**. They do NOT persist data — they notify connected clients of real-time events that require immediate UI reactions. All persistent state lives in Firestore.

### 2.1 Message Envelope

```typescript
interface WebSocketMessage<T = unknown> {
  type: string;                            // Message type discriminator
  payload: T;                              // Type-specific payload
  timestamp: number;                       // Unix epoch milliseconds
  senderId: string;                        // User ID of the sender
  organizationId: string | null;           // Scoping for multi-tenant filtering
}
```

### 2.2 Message Types

| Type | Direction | Payload | Use Case |
|------|-----------|---------|----------|
| `ATTENDANCE_SCANNED` | Scanner → Clients | `AttendanceScanPayload` | Live gate log feed — pushes new scan events to admin monitoring dashboard and officer attendance log in real time |
| `BROADCAST_ANNOUNCEMENT` | Admin → All | `AnnouncementPayload` | Instant notification to all connected officer panels when admin publishes a new announcement |
| `EVENT_STATUS_CHANGED` | System → Clients | `EventStatusPayload` | Notifies officer panels when their proposal is approved/rejected by admin |
| `PAYMENT_CONFIRMED` | Admin → Scanner | `PaymentConfirmedPayload` | Unlocks a student's QR ticket at the gate in real time after admin confirms payment |
| `GATE_ACCESS_DENIED` | Scanner → Admin | `GateAccessDeniedPayload` | Alerts admin dashboard when a blocked student attempts gate entry |

### 2.3 Payload Definitions

```typescript
interface AttendanceScanPayload {
  attendanceId: string;                    // Newly created /attendance document ID
  eventId: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  gateType: 'entry' | 'exit';
  scanMethod: 'qr' | 'manual';
  scannedAt: number;                       // Unix epoch ms
}

interface AnnouncementPayload {
  announcementId: string;
  title: string;
  priority: 'normal' | 'urgent';
  targetOrganizationIds: string[] | 'all'; // 'all' broadcasts to every org
}

interface EventStatusPayload {
  eventId: string;
  eventTitle: string;
  previousStatus: string;
  newStatus: string;
  updatedBy: string;                       // Admin user ID
  reason: string | null;                   // Rejection reason if applicable
}

interface PaymentConfirmedPayload {
  payableId: string;
  eventId: string;
  studentId: string;
  studentName: string;
  qrTicketUnlocked: boolean;              // Always true in this message
}

interface GateAccessDeniedPayload {
  eventId: string;
  sessionId: string;
  studentId: string;
  studentName: string;
  studentNumber: string;
  reason: 'payment_required' | 'not_registered' | 'session_closed';
  attemptedAt: number;                     // Unix epoch ms
}
```

---

## 3. Firestore Security Rules Summary

> **Note:** Full Firestore security rules are deployed separately. This section documents the access patterns that client-side code must respect.

| Collection | Admin Read | Admin Write | Officer Read | Officer Write |
|-----------|-----------|------------|-------------|--------------|
| `organizations` | All docs | Create, update | `.where('officerIds', 'array-contains', uid)` | Limited fields only |
| `events` | All docs | All fields including `fastTrack`, `approvedBy` | `.where('organizationId', '==', orgId)` | Create proposals, update drafts only |
| `attendance` | All docs | Override/delete entries | `.where('organizationId', '==', orgId)` | Write **only** when `qrTicketUnlocked === true` |
| `payables` | All docs | All fields including `paymentStatus`, `qrTicketUnlocked` | `.where('organizationId', '==', orgId)` | Read only — payments confirmed by admin |

---

## 4. Timestamp Convention

All `Timestamp` fields use Firestore's `Timestamp` type (`firebase/firestore`). When writing:

```typescript
import { Timestamp, serverTimestamp } from 'firebase/firestore';

// Client-generated timestamp
const now = Timestamp.now();

// Server-generated timestamp (for ordering/consistency)
const data = { createdAt: serverTimestamp() };
```

Display timestamps using `date-fns` (already installed):

```typescript
import { format } from 'date-fns';
const display = format(doc.createdAt.toDate(), 'MMM dd, yyyy hh:mm a');
```

---

<!-- AGENT-UPDATED: 2026-06-19 — Added event_types, event_categories, venues for Event Configuration -->

### 1.8 `event_types`

**Path:** `/event_types/{typeId}`

```typescript
interface EventTypeDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "Academic", "Social"
  color: string;                           // hex color code
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `archived` ASC, `name` ASC

---

### 1.9 `event_categories`

**Path:** `/event_categories/{categoryId}`

```typescript
interface EventCategoryDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "Seminar / Webinar"
  typeId: string;                          // FK → /event_types
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `archived` ASC, `name` ASC
- `typeId` ASC

---

### 1.10 `venues`

**Path:** `/venues/{venueId}`

```typescript
interface VenueDocument {
  id: string;                              // Auto-generated Firestore document ID
  name: string;                            // e.g., "Main Auditorium"
  capacity: number;                        // e.g., 500
  facilities: string[];                    // Array of dynamic facilities
  status: 'available' | 'maintenance' | 'reserved';
  archived: boolean;                       // Soft delete flag
  
  // ─── Timestamps ───
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Indexes Required:**
- `archived` ASC, `name` ASC

---

<!-- AGENT-UPDATED: 2026-06-19 — Added events collection for multi-step event creation -->

### 1.11 `events`

**Path:** `/events/{eventId}`

```typescript
interface EventDocument {
  // ─── Identity ───
  id: string;
  referenceId: string;                     // e.g., "EVT-ADM-2026-0018"
  title: string;
  tagline: string | null;
  description: string;
  objectives: string[];
  bannerImageUrl: string | null;
  thumbnailUrl: string | null;

  // ─── Classification ───
  eventTypeId: string;                     // FK → /event_types
  eventCategoryId: string;                 // FK → /event_categories
  hostingOrgId: string;                    // FK → /organizations

  // ─── Academic Context ───
  semesterId: string;                      // FK → /semesters
  schoolYear: string;                      // auto-derived from active semester

  // ─── Schedule ───
  sessions: EventSession[];
  venueId: string;                         // FK → /venues
  eventFormat: 'On-Campus' | 'Online' | 'Hybrid';

  // ─── Participants ───
  targetYearLevels: string[];
  targetDepartmentIds: string[];           // FK[] → /departments
  expectedParticipantCount: number;

  // ─── Attendance ───
  attendanceEnabled: boolean;              // toggle: Required / Not Required
  minAttendancePercent: number | null;
  lateThresholdMinutes: number | null;
  gracePeriodMinutes: number | null;
  latePenaltyAmount: number | null;        // ₱ — replaces "Attendance Weight"

  // ─── Certificates ───
  certificatesEnabled: boolean;            // toggle: Required / Not Required
  autoIssueCertificates: boolean;
  certificateSignatory: string | null;

  // ─── Payables ───
  studentPayablesEnabled: boolean;
  suggestedFeePerStudent: number | null;
  adminFeeOverride: number | null;
  totalExpectedCollection: number | null;

  // ─── Staff ───
  supervisorId: string;                    // SAO Adviser UID
  scanners: EventScanner[];

  // ─── Budget ───
  budgetItems: BudgetLineItem[];
  totalApprovedBudget: number;

  // ─── Documents ───
  documents: EventDocumentFile[];

  // ─── Settings ───
  enableQRTickets: boolean;
  mandatoryAttendance: boolean;
  lockAfterApproval: boolean;
  scannerActivationCode: string;           // auto-generated 6-digit code

  // ─── Lifecycle ───
  proposalStatus: 'draft' | 'approved';    // admin-created events are always 'approved'
  createdBy: string;                       // SAO Adviser UID
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

interface EventSession {
  id: string;
  title: string;
  date: string;                            // ISO YYYY-MM-DD
  startTime: string;                       // HH:mm
  endTime: string;                         // HH:mm
  timeInOpen: string;
  timeInClose: string;
  hasTimeOut: boolean;
  timeOutOpen: string | null;
  timeOutClose: string | null;
}

interface EventScanner {
  id: string;
  officerName: string;
  officerUserId: string | null;
  fullAccess: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canViewList: boolean;
  canEditRecords: boolean;
  allowManualAttendance: boolean;
}

interface BudgetLineItem {
  id: string;
  item: string;
  description: string;
  quantity: number;
  unitCost: number;
  approvedAmount: number;
  status: 'approved' | 'reduced' | 'rejected' | 'pending';
}

interface EventDocumentFile {
  id: string;
  name: string;
  fileUrl: string | null;
  required: boolean;
}
```

**Indexes Required:**
- `proposalStatus` ASC, `createdAt` DESC
- `hostingOrgId` ASC, `proposalStatus` ASC
