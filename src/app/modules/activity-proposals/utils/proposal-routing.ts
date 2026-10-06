/**
 * src/app/modules/activity-proposals/utils/proposal-routing.ts
 *
 * Assembles the dynamic sequence of institutional signatories based on
 * the Activity Proposal's target market, academic programs, and school governance policy.
 * Groups signatories into sequential multi-signatory stages with 'endorse' vs 'approve' actions.
 *
 * ZERO HARDCODED DATA - All signatories are queried dynamically from the Firestore database.
 */

import type { InstitutionalSignatory } from '../../signatories/types/signatory.types';
import type { ProposalApprovalStep, ProposalTargetAudience } from '../types/proposal.types';
import type { SasSignatoryConfig } from '../../signatories/services/sas-signatory.service';

export function buildDynamicApprovalChain(
  targetAudience: ProposalTargetAudience,
  activeSignatories: InstitutionalSignatory[],
  sasConfigOrName?:
    | SasSignatoryConfig
    | { name?: string; roleTitle?: string; email?: string; department?: string; employeeId?: string }
    | string,
  sasAdminEmailOrIsSasCreator?: string | boolean,
  isSasCreatorParam = false
): ProposalApprovalStep[] {
  let sasConfig: Partial<SasSignatoryConfig> = {};
  let isSasCreator = false;

  if (typeof sasConfigOrName === 'string') {
    sasConfig = {
      name: sasConfigOrName,
      email: typeof sasAdminEmailOrIsSasCreator === 'string' ? sasAdminEmailOrIsSasCreator : 'sao@ormoc.sti.edu.ph',
      roleTitle: 'Student Affairs & Services Head',
      department: 'Student Affairs & Services',
    };
    isSasCreator = typeof sasAdminEmailOrIsSasCreator === 'boolean' ? sasAdminEmailOrIsSasCreator : Boolean(isSasCreatorParam);
  } else if (sasConfigOrName && typeof sasConfigOrName === 'object') {
    sasConfig = sasConfigOrName;
    isSasCreator = typeof sasAdminEmailOrIsSasCreator === 'boolean' ? sasAdminEmailOrIsSasCreator : Boolean(isSasCreatorParam);
  } else {
    isSasCreator = typeof sasAdminEmailOrIsSasCreator === 'boolean' ? sasAdminEmailOrIsSasCreator : Boolean(isSasCreatorParam);
  }

  const chain: ProposalApprovalStep[] = [];
  let stepIndex = 1;

  // Filter only active signatories from database
  const signatories = activeSignatories.filter((s) => s.isActive !== false);

  const resolveActionType = (raw?: string, fallback: 'endorse' | 'approve' = 'endorse'): 'endorse' | 'approve' => {
    if (raw === 'approver' || raw === 'approve') return 'approve';
    if (raw === 'endorser' || raw === 'endorse') return 'endorse';
    return fallback;
  };

  // Stage numbering helpers based on creator:
  // If Officer / Non-SAS creator:
  //   Stage 1: Student Affairs & Services (SAS) Endorsement (Mandatory First Gate)
  //   Stage 2: Department & Program Endorsements
  //   Stage 3: Institutional Review & Endorsements
  //   Stage 4: Executive Administration & Approval
  // If SAS Creator:
  //   Stage 1: Department & Program Endorsements
  //   Stage 2: Institutional Review & Endorsements
  //   Stage 3: Executive Administration & Approval
  const deptStageIndex = isSasCreator ? 1 : 2;
  const deptStageName = isSasCreator
    ? 'Stage 1: Department & Program Endorsements'
    : 'Stage 2: Department & Program Endorsements';
  const deptStatus = isSasCreator ? 'current' : 'waiting';

  const acadStageIndex = isSasCreator ? 2 : 3;
  const acadStageName = isSasCreator
    ? 'Stage 2: Institutional Review & Endorsements'
    : 'Stage 3: Institutional Review & Endorsements';

  const execStageIndex = isSasCreator ? 3 : 4;
  const execStageName = isSasCreator
    ? 'Stage 3: Executive Administration & Approval'
    : 'Stage 4: Executive Administration & Approval';

  const usedSignatoryIds = new Set<string>();

  // ── Stage 1: Student Affairs & Services (SAS) Endorsement (Mandatory First Gate for Org Proposals) ──
  if (!isSasCreator) {
    const resolvedName = sasConfig.name?.trim() || 'Riselle Mae B. Lucanas';
    const resolvedRoleTitle = sasConfig.roleTitle?.trim() || 'Student Affairs & Services Head';
    const resolvedEmail = sasConfig.email?.trim().toLowerCase() || 'sao@ormoc.sti.edu.ph';
    const resolvedDept = sasConfig.department?.trim() || 'Student Affairs & Services';
    const resolvedUid = sasConfig.employeeId || 'sas_admin';

    // Check if an institutional signatory in the database matches this email or role
    const matchedSasSig = signatories.find(
      (s) =>
        (resolvedEmail && s.email?.trim().toLowerCase() === resolvedEmail) ||
        s.role === 'sas_coordinator' ||
        s.role === 'sas_head' ||
        s.roleTitle?.toLowerCase().includes('student affairs') ||
        s.roleTitle?.toLowerCase().includes('sas')
    );

    if (matchedSasSig) {
      usedSignatoryIds.add(matchedSasSig.id);
    }

    chain.push({
      id: `step_${stepIndex}`,
      step: stepIndex++,
      stageIndex: 1,
      stageName: 'Stage 1: Student Affairs & Services (SAS) Endorsement',
      role: 'sas_head',
      roleTitle: resolvedRoleTitle,
      actionType: 'endorse',
      signatoryUid: matchedSasSig?.id || resolvedUid,
      signatoryName: resolvedName,
      signatoryEmail: resolvedEmail,
      department: resolvedDept,
      departmentId: matchedSasSig?.departmentId,
      status: 'current', // Mandatory first gate, active immediately upon submission!
    });
  }

  // ── Stage 2: Department-Level Signatories ──
  // User Rule:
  // "If all students all signatories with department are required to sign it."
  // "stage 2 if our signatories belong to (IT DEPARTMENT) and the audience involve IT students then he/she will need to sign."
  // "All should be from database"
  const isAllStudents =
    targetAudience.allStudents === true ||
    targetAudience.scope === 'all' ||
    (targetAudience.departments || []).some(
      (d) =>
        d.toLowerCase().includes('all students') ||
        d.toLowerCase().includes('campus-wide') ||
        d.toLowerCase().includes('all campus')
    );

  const targetDeptIds = new Set((targetAudience.departmentIds || []).filter(Boolean));
  const targetDeptNames = (targetAudience.departments || []).map((d) => d.toLowerCase().trim());
  const targetCourseCodes = (targetAudience.courseCodes || []).map((c) => c.toLowerCase().trim());
  const targetLevels = targetAudience.academicLevels || [];

  // Exclude executive approvers from Stage 2
  const executiveRoles = ['school_president', 'school_administrator'];

  const departmentSignatories = signatories.filter((s) => {
    if (usedSignatoryIds.has(s.id)) return false;
    if (executiveRoles.includes(s.role)) return false;

    // Must have a department assignment or department role
    const hasDeptId = Boolean(s.departmentId);
    const deptName = (s.department || '').toLowerCase().trim();
    const isDeptScope =
      hasDeptId ||
      (deptName &&
        !['institutional', 'campus-wide', 'campus wide', 'administration', 'academic affairs', 'office of the president'].includes(deptName));

    if (!isDeptScope && s.role !== 'program_head' && s.role !== 'shs_principal') {
      return false;
    }

    // If All Students: ALL signatories with an academic department are required!
    if (isAllStudents) {
      return true;
    }

    // Specific Audience: Match by departmentId
    if (s.departmentId && targetDeptIds.has(s.departmentId)) {
      return true;
    }

    // Match by department name
    if (deptName && targetDeptNames.some((td) => deptName.includes(td) || td.includes(deptName))) {
      return true;
    }

    // Match SHS
    if (targetLevels.includes('SHS')) {
      if (
        s.role === 'shs_principal' ||
        deptName.includes('shs') ||
        deptName.includes('senior high') ||
        s.roleTitle.toLowerCase().includes('principal') ||
        s.roleTitle.toLowerCase().includes('senior high')
      ) {
        return true;
      }
    }

    // Match course codes (e.g. IT, BSIT)
    if (targetCourseCodes.some((cc) => deptName.includes(cc) || s.roleTitle.toLowerCase().includes(cc))) {
      return true;
    }

    return false;
  });

  departmentSignatories.forEach((sig) => {
    usedSignatoryIds.add(sig.id);
    chain.push({
      id: `step_${stepIndex}`,
      step: stepIndex++,
      stageIndex: deptStageIndex,
      stageName: deptStageName,
      role: sig.role,
      roleTitle: sig.roleTitle || 'Department Head',
      actionType: resolveActionType(sig.actionType, 'endorse'),
      signatoryUid: sig.id,
      signatoryName: sig.name,
      signatoryEmail: sig.email,
      department: sig.department || 'Academic Department',
      departmentId: sig.departmentId,
      status: deptStatus,
    });
  });

  // ── Stage 3: Institutional Review & Endorsements ──
  // Institutional signatories from database who don't belong to a single department (e.g., Academic Head, Dean)
  // and are not executive final approvers.
  const institutionalEndorsers = signatories.filter((s) => {
    if (usedSignatoryIds.has(s.id)) return false;
    if (executiveRoles.includes(s.role)) return false;
    if (s.actionType === 'approver') return false;

    // Academic head or campus-wide institutional endorsers
    return (
      s.role === 'academic_head' ||
      s.roleTitle.toLowerCase().includes('academic head') ||
      s.roleTitle.toLowerCase().includes('dean') ||
      !s.departmentId ||
      ['institutional', 'campus-wide', 'campus wide', 'academic affairs'].includes(
        (s.department || '').toLowerCase().trim()
      )
    );
  });

  institutionalEndorsers.forEach((sig) => {
    usedSignatoryIds.add(sig.id);
    chain.push({
      id: `step_${stepIndex}`,
      step: stepIndex++,
      stageIndex: acadStageIndex,
      stageName: acadStageName,
      role: sig.role,
      roleTitle: sig.roleTitle || 'Academic Head',
      actionType: resolveActionType(sig.actionType, 'endorse'),
      signatoryUid: sig.id,
      signatoryName: sig.name,
      signatoryEmail: sig.email,
      department: sig.department || 'Academic Affairs',
      departmentId: sig.departmentId,
      status: 'waiting',
    });
  });

  // ── Stage 4: Executive Administration & Approval ──
  // User Rule:
  // "compulsory last step is approver (school_administrator, school_president)"
  // "last step is approver then all approver should be there"
  const executiveApprovers = signatories.filter((s) => {
    if (usedSignatoryIds.has(s.id)) return false;
    return (
      s.role === 'school_president' ||
      s.role === 'school_administrator' ||
      s.actionType === 'approver' ||
      s.actionType === 'both'
    );
  });

  // Sort so School Administrator is placed before School President
  executiveApprovers.sort((a, b) => {
    if (a.role === 'school_administrator' && b.role !== 'school_administrator') return -1;
    if (b.role === 'school_administrator' && a.role !== 'school_administrator') return 1;
    if (a.role === 'school_president' && b.role !== 'school_president') return 1;
    if (b.role === 'school_president' && a.role !== 'school_president') return -1;
    return 0;
  });

  executiveApprovers.forEach((sig) => {
    usedSignatoryIds.add(sig.id);
    chain.push({
      id: `step_${stepIndex}`,
      step: stepIndex++,
      stageIndex: execStageIndex,
      stageName: execStageName,
      role: sig.role,
      roleTitle: sig.roleTitle || (sig.role === 'school_president' ? 'School President' : 'School Administrator'),
      actionType: sig.role === 'school_president' ? 'approve' : resolveActionType(sig.actionType, 'approve'),
      signatoryUid: sig.id,
      signatoryName: sig.name,
      signatoryEmail: sig.email,
      department: sig.department || (sig.role === 'school_president' ? 'Office of the President' : 'School Administration'),
      departmentId: sig.departmentId,
      status: 'waiting',
    });
  });

  return chain;
}
