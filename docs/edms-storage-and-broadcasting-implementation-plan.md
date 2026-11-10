# Document storage, organization submissions, and report archives

Updated November 10, 2026 to incorporate the final scope correction.

## Final scope

**EDMS stores general documents, supports organization submissions to SAS, and delivers SAS broadcasts. AP, PAR, and FL storage belongs in Reports & Analytics.**

| Area | Stored content | SAS access | Officer access |
| --- | --- | --- | --- |
| EDMS custom category tabs | Approved general documents, organized by administrator-created document categories | All authorized organizational submissions and SAS internal documents | Only documents owned by the selected organization |
| EDMS Uncategorized | Approved general documents without a custom category | View and assign a custom category | View own organization’s documents |
| EDMS Inbox / My Submissions | General document submission and review history | Review pending submissions through modal actions | Submit and resubmit for the selected organization |
| EDMS Sent to Clubs / From SAS | Broadcast messages with optional file attachments | Create and inspect broadcasts | Read broadcasts addressed to the organization |
| Reports & Analytics — AP | Preserved, finally approved Activity Proposal PDFs | View/download approved archives | View/download own organization’s approved archives |
| Reports & Analytics — PAR | Preserved, finally approved Post-Activity Report PDFs | View/download approved archives | View/download own organization’s approved archives |
| Reports & Analytics — FL | Preserved, finally approved Financial Liquidation XLSX files | View/download approved archives | View/download own organization’s approved archives |

Document category names are independent of workflow kinds. A custom category named “Activity Proposal” is still a general document category: it cannot create a workflow approval, change report classification, or move workflow files into EDMS.

## Data and storage separation

- `documents`: general submissions, approved general documents, SAS internal general uploads, and broadcasts. Custom `categoryId` values reference `document_categories`.
- `report_archives`: approved AP/PAR/FL versions with explicit `documentKind`, source collection/record/version, preserved academic context, approval metadata, real file metadata, and storage state. Workflow archives have no custom category assignment.
- `edms/{documentId}/...`: protected files for general EDMS documents.
- `reports/{archiveId}/...`: protected approved report files, snapshots, and supporting attachments.
- `_report_archive_jobs`: durable, version-specific report generation jobs with transaction-based claims, retry state, and frozen input chunks.
- `_edms_access`: backend-issued membership proofs; access is checked against current authoritative membership records rather than local-storage profile values.
- `_edms_counters` and `_edms_reference_reservations`: transaction-backed reference allocation and single-use reservations.
- `_document_category_names`: normalized category-name reservations for concurrent create/rename protection.

Legacy workflow archives previously placed in `documents` are excluded from EDMS views. Compatibility readers expose them only in the report views until migration reconstructs their report archive and repairs the source link. Existing historical EDMS IDs and references are reused where possible.

## General document submission and review

1. An officer selects a general document category and uploads a required file for the active organization.
2. The backend verifies the officer’s Firebase identity and active membership in that organization. It derives organization metadata from the stored organization record and ignores client attempts to claim another organization, workflow kind, or approved status.
3. The document appears in the organization’s My Submissions and the SAS Inbox.
4. SAS View, Approve, Return for Revision, and Reject actions open dialogs outside the table. Actions operate by document ID and revalidate the persisted status before writing.
5. Approval remarks are optional; return/rejection remarks are required. A successful approval retains the same document ID and makes it visible in the organization’s corresponding custom category storage tab.
6. Return/resubmission retains the source relationship and validates the original document’s organization and returned status.
7. Closing previews preserves list filters and position. Controls work with keyboard focus and touch rather than relying on row hover.

SAS may also store internal general documents directly in a custom category. Those documents remain SAS-only. Category reassignment is audited and applies only to general documents.

## Custom category behavior

- Every active, non-archived category provides its own custom EDMS tab.
- Name, color, active state, manual creation, and archival are maintained through shared services and modal creation.
- Names are trimmed and normalized for Unicode, repeated whitespace, and case-insensitive uniqueness. Simultaneous duplicate creation or rename is rejected transactionally.
- Renaming or recoloring keeps the category ID stable and updates current labels consistently. Stored historical labels remain available as document metadata.
- Deactivation/archival removes a category from new selections while preserving historical documents and storage tabs containing accessible records. Reactivation is supported.
- Deletion uses archival, preserving referenced IDs and documents.
- Missing legacy category references retain their saved labels; unassigned general documents use Uncategorized. No unrelated category is chosen as a fallback.
- Category filters use IDs so renaming does not break matching.
- An empty category collection remains empty. Administrators can add categories manually; the app does not seed standard categories on read.
- Remove Officers and Req. remarks switches, labels, and explanatory text. Active document categories are available to officers; required review remarks follow the shared review rule.
- Remove Standard Categories and Load Standard STI Categories buttons and all automatic standard-category seeding.

## Broadcasting

- The final category dropdown item is **+ Add Category** and opens the shared category modal.
- Saving selects the newly created category by ID. Cancel or failure preserves the broadcast title, message, recipient selection, and attached file.
- Category and description remain optional. Title, authenticated SAS sender, and valid recipients are required.
- **File Attachment (Optional)** supports existing file types and the 25 MB limit. A selected file must finish uploading before sending. A failed upload must be retried or explicitly removed.
- Text-only broadcasts persist without fabricated filenames or URLs. Preview renders the message and a No attachment state, and does not fetch a PDF or offer an active download for a missing file.
- SAS Sent to Clubs and officer From SAS use the same protected preview/download behavior and recipient/read tracking.

## Approved AP/PAR/FL storage in Reports & Analytics

1. Direct SAS approval and final signatory approval enqueue the same version-specific archive. Firestore approval triggers continue the process if an approving browser closes.
2. Canonical proposal records and mirrors resolve to the same archive identity. Intermediate endorsements, drafts, returned documents, and deleted sources do not enter approved storage.
3. Persist the approved source and rendering dependencies as frozen job input. Retry uses that input and does not approve again, repeat funding effects, or post liquidation ledger entries again.
4. Reuse official AP-01 PDF, PAR PDF, and LF-01 XLSX builders. Generation returns real file bytes separately from browser download; a receipt or photo is never mislabeled as the approved report.
5. Store the real file, approved snapshot, and supporting attachments under protected report paths. Record actual MIME type, extension, and byte size.
6. Expose processing, ready, and failed states. Only ready files can be downloaded. SAS can retry failed report storage; scheduled recovery handles abandoned jobs with bounded attempts.
7. Approved versions are preserved independently. New approved revisions receive new archive identities; duplicate delivery reuses the existing version and reference.
8. Link sources with `archivedRecordCollection: 'report_archives'`, `archivedDocumentId`, and `archivedRefNumber`. Storage does not change later event lifecycle state.
9. SAS report archives appear within the corresponding existing AP/PAR/FL Reports & Analytics tabs. The officer report page has the three separate report storage tabs, always scoped to the selected organization.
10. Previews use a paginated PDF canvas viewer, supporting browsers without an embedded PDF plugin. Source links target the correct role-specific AP, PAR, or FL screen.

## Authorization and migration

- Firestore rules deny direct client writes to EDMS records, report archives, category management records, membership proofs, counters, and jobs. Backend actions validate identity, organization ownership, recipient rules, reviewer authority, and current state.
- Officer queries are constrained to the selected organization. SAS-only records are excluded. Auth or organization changes clear previous data and stale asynchronous callbacks cannot populate another session’s view.
- Membership changes are checked against current records; callers cannot forge officer memberships or approved source status to obtain archives.
- Protected files are written with the Admin SDK and downloaded only after backend authorization. Production downloads use temporary signed URLs.
- The migration script defaults to dry-run, inventories legacy documents/archives/category problems, copies existing general files into protected storage, and reconstructs approved report archives in their separate collection. It preserves legacy records and reports duplicates or missing owners for review.
- Historical reconstruction uses the source data available during migration; it cannot invent a missing original approval-time snapshot.

## Validation

Run the domain tests, Auth/Firestore/Storage integration tests, production build, account regression checks, and browser checks on both portals. Required cases include custom/workflow separation, text-only broadcasts, modal actions, category races and lifecycle, organization isolation, authentic report file output, retry snapshot preservation, and legacy migration.

See `edms-implementation-and-release.md` for the final implementation and rollout notes. Production deployment and backfill are separate from local verification.
