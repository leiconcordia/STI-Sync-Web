/**
 * src/app/modules/events/utils/organization-display.utils.ts
 *
 * Clean display utilities for event organizers and hosting organizations.
 * Ensures that:
 * - Admin/SAS-authored institutional activities strictly display as "Student Affairs & Services (SAS)"
 * - Student organization activities strictly display the clean club name or acronym from registry
 * - Concatenated multi-department mashed strings (e.g. "Student Affairs & Services (SAS)IT Department & IT Guild ClubSenior High School Student Council")
 *   are completely prevented and parsed into the clean, primary organization name.
 * - Never prepends "Student Affairs & Services (SAS)" to a student organization activity.
 */

export interface OrgMeta {
  name: string;
  acronym?: string;
  logoUrl?: string | null;
}

/**
 * Strips all occurrences of SAS / SAO institutional phrases from a text string.
 */
export function stripSasPhrases(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/Student Affairs\s*(&|and)?\s*Services\s*(\(SAS\))?/gi, '')
    .replace(/Student Affairs Office\s*(\(SAO\))?/gi, '')
    .replace(/\b(SAS|SAO)\b/g, '')
    .replace(/^\s*[-–—,/&]+\s*/, '')
    .replace(/\s*[-–—,/&]+\s*$/, '')
    .trim();
}

/**
 * Known student organization aliases and patterns to identify and extract clean names.
 */
export const KNOWN_CAMPUS_ORGS = [
  { pattern: /IT\s*Guild(\s*Club)?|IT\s*Department\s*&?\s*IT\s*Guild(\s*Club)?/i, name: 'IT Department & IT Guild Club', acronym: 'IT Guild' },
  { pattern: /Red\s*Cross\s*Youth(\s*\(RCY\))?|RCY/i, name: 'Red Cross Youth (RCY)', acronym: 'RCY' },
  { pattern: /STI\s*Athletic\s*Guild|Athletic\s*Guild/i, name: 'STI ATHLETIC GUILD', acronym: 'SAG' },
  { pattern: /Senior\s*High\s*School\s*Student\s*Council|SHS\s*Student\s*Council|SHS\s*SC/i, name: 'Senior High School Student Council', acronym: 'SHS SC' },
  { pattern: /STI\s*(PAO|PMO)\s*Club|(PAO|PMO)\s*Club|\b(PAO|PMO)\b/i, name: 'STI PAO CLUB', acronym: 'PAO' },
  { pattern: /Junior\s*Philippine\s*Computer\s*Society|JPCS/i, name: 'Junior Philippine Computer Society (JPCS)', acronym: 'JPCS' },
  { pattern: /Supreme\s*Student\s*Council|SSC/i, name: 'Supreme Student Council', acronym: 'SSC' },
  { pattern: /BSHM\s*Student\s*Council/i, name: 'BSHM Student Council', acronym: 'BSHM SC' },
];

/**
 * Matches a sanitized string against the organization map or known campus organizations.
 */
function matchOrgAgainstKnownOrMap(
  text: string,
  orgMap?: Map<string, OrgMeta>
): { name: string; acronym?: string } | null {
  if (!text) return null;
  const lower = text.toLowerCase().trim();

  // 1. Direct registry map lookup
  if (orgMap) {
    if (orgMap.has(text)) {
      const found = orgMap.get(text);
      if (found) return { name: found.name, acronym: found.acronym };
    }
    for (const [, meta] of orgMap.entries()) {
      if (
        meta.name.toLowerCase() === lower ||
        (meta.acronym && meta.acronym.toLowerCase() === lower) ||
        lower.includes(meta.name.toLowerCase()) ||
        (meta.acronym && lower.includes(meta.acronym.toLowerCase()))
      ) {
        return { name: meta.name, acronym: meta.acronym };
      }
    }
  }

  // 2. Known static patterns
  for (const item of KNOWN_CAMPUS_ORGS) {
    if (item.pattern.test(text)) {
      return { name: item.name, acronym: item.acronym };
    }
  }

  return null;
}

/**
 * Returns true if an event was created directly by SAS as an Institutional Activity,
 * false if it belongs to or was authored for a Student Organization.
 */
export function isSasCreatedEvent(
  event: any,
  orgMap?: Map<string, OrgMeta>
): boolean {
  if (!event) return true;

  const SAS_ORGS = ['sas', 'sas_admin', 'sao', 'sao_admin', 'admin', 'sao_office', 'institutional'];

  // 1. Explicit officer proposal flags take highest precedence
  if (
    event.isOfficerProposal === true ||
    (event as any).isOfficer === true ||
    (event as any).isStudentOfficer === true
  ) {
    return false;
  }

  // 2. Hosting organization ID check (Primary ground truth)
  const hOrg = (
    event.hostingOrgId ||
    event.organizationId ||
    event.createdByOrgId ||
    event.orgId ||
    event.org ||
    ''
  ).toString().toLowerCase().trim();

  // If hostingOrgId is explicitly set to a student organization, it is strictly an Org event!
  if (hOrg && !SAS_ORGS.includes(hOrg)) {
    return false;
  }

  // 3. Organization Name check: If organization name is a student club (not SAS), it is strictly an Org event!
  const explicitOrgName = (
    event.organizationName ||
    event.orgName ||
    event.hostOrgName ||
    event.hostingOrgName ||
    event.organization ||
    ''
  ).toString().trim();

  if (explicitOrgName) {
    const stripped = stripSasPhrases(explicitOrgName);
    if (stripped.length > 0) {
      return false;
    }
  }

  // 4. Organizers check: Check if organizers specify a student club
  const organizers: string[] = Array.isArray(event.organizers)
    ? event.organizers
    : typeof event.organizers === 'string' && event.organizers.trim()
    ? [event.organizers.trim()]
    : [];

  const hasStudentOrgOrganizer = organizers.some((orgStr) => {
    if (typeof orgStr !== 'string') return false;
    const stripped = stripSasPhrases(orgStr);
    return stripped.length > 0;
  });

  if (hasStudentOrgOrganizer) {
    return false;
  }

  // 5. Reference number check (e.g. AP-2026-IT-001 or AP-2026-ORG-001 vs AP-2026-SAS-001)
  const ref = (event.referenceId || event.referenceNo || '').toString().toUpperCase();
  if (ref && !ref.includes('-SAS-') && (ref.includes('-ORG-') || ref.includes('-IT-') || ref.includes('-PAO-') || ref.includes('-PMO-') || ref.includes('-RCY-') || ref.includes('-SAG-') || ref.startsWith('AP-'))) {
    return false;
  }

  // 6. Club treasury funding strictly denotes an organization activity
  if (event.fundingSource === 'organization_funds') {
    return false;
  }

  const cRole = ((event.createdByRole || event.creatorRole || '') as string).toLowerCase().trim();
  if (cRole === 'officer' || cRole === 'student_officer') {
    return false;
  }

  // 7. Check all candidate text fields that could specify a student club
  const candidateTexts: string[] = [
    event.department,
    event.title,
  ].filter(Boolean);

  for (const text of candidateTexts) {
    if (typeof text !== 'string') continue;
    const stripped = stripSasPhrases(text);
    if (!stripped) continue;
    const matched = matchOrgAgainstKnownOrMap(stripped, orgMap);
    if (matched && !matched.name.toLowerCase().includes('student affairs')) {
      return false;
    }
  }

  // 8. Direct SAS markers: Only institutional if hosting organization is not a student club
  if (
    event.isDirectPublished === true ||
    event.isSasDirect === true ||
    event.isSas === true ||
    event.isSasInstitutional === true ||
    SAS_ORGS.includes(hOrg)
  ) {
    return true;
  }

  const createdByEmail = (event.createdByEmail || '').toLowerCase().trim();
  if (createdByEmail === 'sao@ormoc.sti.edu.ph' || createdByEmail.startsWith('sas@') || createdByEmail.startsWith('sao@')) {
    // Only SAS if hosting organization was not a student club
    if (!hOrg || SAS_ORGS.includes(hOrg)) {
      return true;
    }
  }

  if (['admin', 'sas_admin', 'sao_admin', 'sas'].includes(cRole)) {
    if (!hOrg || SAS_ORGS.includes(hOrg)) {
      return true;
    }
  }

  return false;
}

/**
 * Returns the clean, official full organization name for an event.
 * Strips concatenated mashed department names and returns solely the hosting organization.
 */
export function resolveCleanOrgName(
  event: any,
  orgMap?: Map<string, OrgMeta>
): string {
  if (!event) return 'Student Affairs & Services (SAS)';

  // 1. If admin / SAS institutional event, always use the official title
  if (isSasCreatedEvent(event, orgMap)) {
    return 'Student Affairs & Services (SAS)';
  }

  // 2. Direct registry lookup by hostingOrgId or organizationId
  const rawHostId = (event.hostingOrgId || event.organizationId || '').toString().trim();
  if (rawHostId && orgMap) {
    if (orgMap.has(rawHostId)) {
      const found = orgMap.get(rawHostId);
      if (found?.name) return found.name;
    }
    const matched = matchOrgAgainstKnownOrMap(rawHostId, orgMap);
    if (matched) return matched.name;
  }

  // 3. Check explicit organization name fields on the event
  const explicitOrgName = (
    event.organizationName ||
    event.orgName ||
    event.hostOrgName ||
    event.hostingOrgName ||
    ''
  ).toString().trim();

  if (explicitOrgName) {
    const cleaned = stripSasPhrases(explicitOrgName);
    if (cleaned) {
      const matched = matchOrgAgainstKnownOrMap(cleaned, orgMap);
      if (matched) return matched.name;
      return cleaned;
    }
  }

  // 4. Check organizers (Array or String)
  let organizerCandidates: string[] = [];
  if (Array.isArray(event.organizers)) {
    organizerCandidates = event.organizers;
  } else if (typeof event.organizers === 'string' && event.organizers.trim()) {
    organizerCandidates = [event.organizers.trim()];
  }

  for (const raw of organizerCandidates) {
    if (typeof raw !== 'string') continue;
    const stripped = stripSasPhrases(raw);
    if (!stripped) continue;

    // Check if stripped matches any known pattern or registry org
    const matched = matchOrgAgainstKnownOrMap(stripped, orgMap);
    if (matched) return matched.name;

    // Return the cleaned string
    return stripped;
  }

  return 'Student Organization';
}

/**
 * Returns the clean short acronym for an event (e.g. "STI SAS", "JPCS", "RCY", "SAG").
 */
export function resolveCleanOrgAcronym(
  event: any,
  orgMap?: Map<string, OrgMeta>
): string {
  if (!event) return 'STI SAS';

  if (isSasCreatedEvent(event, orgMap)) {
    return 'STI SAS';
  }

  const rawHostId = (event.hostingOrgId || event.organizationId || '').toString().trim();
  if (rawHostId && orgMap) {
    if (orgMap.has(rawHostId)) {
      const found = orgMap.get(rawHostId);
      if (found?.acronym) return found.acronym;
    }
    const matched = matchOrgAgainstKnownOrMap(rawHostId, orgMap);
    if (matched?.acronym) return matched.acronym;
  }

  const full = resolveCleanOrgName(event, orgMap);
  if (full === 'Student Affairs & Services (SAS)') return 'STI SAS';

  const matched = matchOrgAgainstKnownOrMap(full, orgMap);
  if (matched?.acronym) return matched.acronym;

  return full;
}

/**
 * Checks whether an activity has no budget or no financial projection,
 * meaning financial liquidation (Form LF-01) is not applicable / not required.
 *
 * Exemption requires no monetary budget, projected expenses, or allocated cash
 * custodians, and no explicit liquidation requirement. Recorded funds take
 * precedence over stale zero-budget / liquidationRequired=false flags.
 */
export function isEventLiquidationExempt(event: any): boolean {
  if (!event) return true;

  // 2. Budget numbers on event root
  const rootBudget = Math.max(
    Number(event.totalApprovedBudget || 0),
    Number(event.approvedBudget || 0),
    Number(event.totalBudget || 0),
    Number(event.budget || 0)
  );

  // 3. Projections expenses
  const fpTotal = Number(event.financialProjections?.totalExpenses || 0);
  let fpListTotal = 0;
  if (Array.isArray(event.financialProjections?.expenses) && event.financialProjections.expenses.length > 0) {
    fpListTotal = event.financialProjections.expenses.reduce(
      (sum: number, item: any) => sum + Number(item.totalAmount || item.thisYearProposed || 0),
      0
    );
  }

  // 4. Budget items array if present
  let budgetItemsTotal = 0;
  if (Array.isArray(event.budgetItems) && event.budgetItems.length > 0) {
    budgetItemsTotal = event.budgetItems.reduce(
      (sum: number, bi: any) =>
        sum +
        Number(
          bi.approvedAmount ||
            bi.totalCost ||
            bi.amount ||
            bi.totalAmount ||
            Number(bi.quantity || 1) * Number(bi.unitCost || 0) ||
            0
        ),
      0
    );
  }

  // 5. Cash advance custodians
  const hasCashCustodians =
    Array.isArray(event.budgetCustodians) &&
    event.budgetCustodians.some((c: any) => Number(c.allocatedAmount || 0) > 0);

  const effectiveBudget = Math.max(rootBudget, fpTotal, fpListTotal, budgetItemsTotal);

  // Recorded monetary obligations take precedence over a stale zero-budget flag.
  if (effectiveBudget > 0 || hasCashCustodians || event.liquidationRequired === true) return false;
  if (event.liquidationRequired === false || event.fundingSource === 'zero_budget') return true;

  // If there's no budget and no cash custodians allocated, it is exempt
  if (effectiveBudget <= 0 && !hasCashCustodians) {
    return true;
  }

  // If there are no financial projections and no budget items at all, and no cash custodians
  const hasFinancialProjections =
    (Array.isArray(event.financialProjections?.expenses) && event.financialProjections.expenses.length > 0) ||
    (Array.isArray(event.budgetItems) && event.budgetItems.length > 0);

  if (!hasFinancialProjections && !hasCashCustodians && rootBudget <= 0) {
    return true;
  }

  return false;
}
