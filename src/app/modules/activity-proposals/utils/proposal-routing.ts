/**
 * src/app/modules/activity-proposals/utils/proposal-routing.ts
 *
 * Assembles the dynamic sequence of institutional signatories based on
 * the Activity Proposal's target market, academic programs, and school governance policy.
 * Groups signatories into sequential multi-signatory stages with 'endorse' vs 'approve' actions.
 */

import type { InstitutionalSignatory } from '../../signatories/types/signatory.types';
import type { ProposalApprovalStep, ProposalTargetAudience } from '../types/proposal.types';

export function buildDynamicApprovalChain(
  targetAudience: ProposalTargetAudience,
  activeSignatories: InstitutionalSignatory[],
  sasAdminName = 'Student Affairs & Services',
  sasAdminEmail = 'sao@ormoc.sti.edu.ph',
  isSasCreator = false
): ProposalApprovalStep[] {
  const chain: ProposalApprovalStep[] = [];
  let stepIndex = 1;

  const resolveActionType = (raw?: string, fallback: 'endorse' | 'approve' = 'endorse'): 'endorse' | 'approve' => {
    if (raw === 'approver' || raw === 'approve') return 'approve';
    if (raw === 'endorser' || raw === 'endorse') return 'endorse';
    return fallback;
  };

  // Helper to find signatory by role and optional department
  const findSignatory = (role: string, deptKeyword?: string) => {
    return activeSignatories.find((s) => {
      if (s.role !== role) return false;
      if (deptKeyword) {
        return (
          s.department?.toLowerCase().includes(deptKeyword.toLowerCase()) ||
          s.roleTitle?.toLowerCase().includes(deptKeyword.toLowerCase())
        );
      }
      return true;
    });
  };

  // Stage numbering helpers based on creator:
  // If Officer / Non-SAS creator:
  //   Stage 1: Student Affairs & Services (SAS) Endorsement (Mandatory First Gate)
  //   Stage 2: Department & Program Endorsements
  //   Stage 3: Academic Affairs Review
  //   Stage 4: Executive Administration & Approval
  // If SAS Creator:
  //   Stage 1: Department & Program Endorsements
  //   Stage 2: Academic Affairs Review
  //   Stage 3: Executive Administration & Approval
  const deptStageIndex = isSasCreator ? 1 : 2;
  const deptStageName = isSasCreator
    ? 'Department & Program Endorsements'
    : 'Stage 2: Department & Program Endorsements';
  const deptStatus = isSasCreator ? 'current' : 'waiting';

  const acadStageIndex = isSasCreator ? 2 : 3;
  const acadStageName = isSasCreator
    ? 'Academic Affairs Review'
    : 'Stage 3: Academic Affairs Review';

  const execStageIndex = isSasCreator ? 3 : 4;
  const execStageName = isSasCreator
    ? 'Executive Administration & Approval'
    : 'Stage 4: Executive Administration & Approval';

  // ── Stage 1: SAS Coordinator / Reviewer Endorsement ──
  // Mandatory first gate when submitted by student organization officers
  if (!isSasCreator) {
    const sasSignatory =
      findSignatory('sas_coordinator') ||
      findSignatory('sas_head') ||
      activeSignatories.find(
        (s) =>
          s.department?.toLowerCase().includes('student affairs') ||
          s.department?.toLowerCase().includes('sas') ||
          s.roleTitle?.toLowerCase().includes('student affairs') ||
          s.roleTitle?.toLowerCase().includes('sas')
      );

    chain.push({
      id: 'step_sas_mandatory',
      step: stepIndex++,
      stageIndex: 1,
      stageName: 'Stage 1: Student Affairs & Services (SAS) Endorsement',
      role: sasSignatory?.role || 'sas_coordinator',
      roleTitle: sasSignatory?.roleTitle || 'SAS Coordinator / Reviewer',
      actionType: 'endorse',
      signatoryUid: sasSignatory?.id,
      signatoryName: sasSignatory?.name || sasAdminName,
      signatoryEmail: sasSignatory?.email || sasAdminEmail,
      department: sasSignatory?.department || 'Student Affairs & Services',
      status: 'current',
    });
  }

  // ── Department & Program Endorsements (Parallel Signers) ──
  const depts = targetAudience.departments || [];
  const levels = targetAudience.academicLevels || [];
  const touchedDeptIds = targetAudience.departmentIds || [];
  const addedSignatoryIds = new Set<string>();

  // Resolution 1: match signatories linked directly to touched departmentIds
  if (touchedDeptIds.length > 0) {
    touchedDeptIds.forEach((deptId) => {
      const match = activeSignatories.find(
        (s) =>
          (s.role === 'program_head' || s.role === 'shs_principal') &&
          s.departmentId === deptId &&
          !addedSignatoryIds.has(s.id)
      );
      if (match) {
        addedSignatoryIds.add(match.id);
        chain.push({
          id: `step_${stepIndex}`,
          step: stepIndex++,
          stageIndex: deptStageIndex,
          stageName: deptStageName,
          role: match.role,
          roleTitle: match.roleTitle || 'Department Head',
          actionType: resolveActionType(match.actionType, 'endorse'),
          signatoryUid: match.id,
          signatoryName: match.name,
          signatoryEmail: match.email,
          department: match.department,
          status: deptStatus,
        });
      }
    });
  }

  // Resolution 2: fallback if no signatories matched by departmentId
  if (addedSignatoryIds.size === 0) {
    const touchedSHS = levels.includes('SHS') || depts.some((d) => ['STEM', 'ABM', 'HUMSS', 'TVL', 'GAS', 'ICT-SHS'].includes(d.toUpperCase()));
    const touchedIT = depts.some((d) => ['BSIT', 'ACT', 'CS', 'IT'].includes(d.toUpperCase()));
    const touchedHM = depts.some((d) => ['BSHM', 'BSTM', 'HRT'].includes(d.toUpperCase()));
    const touchedBA = depts.some((d) => ['BSBA', 'BSA', 'BSMA'].includes(d.toUpperCase()));

    // SHS Principal if Senior High students are involved
    if (touchedSHS) {
      const shsSignatory = findSignatory('shs_principal') || findSignatory('program_head', 'Senior High');
      if (shsSignatory && !addedSignatoryIds.has(shsSignatory.id)) {
        addedSignatoryIds.add(shsSignatory.id);
        chain.push({
          id: `step_${stepIndex}`,
          step: stepIndex++,
          stageIndex: deptStageIndex,
          stageName: deptStageName,
          role: 'shs_principal',
          roleTitle: shsSignatory.roleTitle || 'SHS Assistant Principal',
          actionType: resolveActionType(shsSignatory.actionType, 'endorse'),
          signatoryUid: shsSignatory.id,
          signatoryName: shsSignatory.name,
          signatoryEmail: shsSignatory.email,
          department: shsSignatory.department || 'Senior High School',
          status: deptStatus,
        });
      }
    }

    // IT Program Head if BSIT/ACT is involved
    if (touchedIT) {
      const itSignatory = findSignatory('program_head', 'Information Technology') || findSignatory('program_head', 'IT');
      if (itSignatory && !addedSignatoryIds.has(itSignatory.id)) {
        addedSignatoryIds.add(itSignatory.id);
        chain.push({
          id: `step_${stepIndex}`,
          step: stepIndex++,
          stageIndex: deptStageIndex,
          stageName: deptStageName,
          role: 'program_head',
          roleTitle: itSignatory.roleTitle || 'IT Program Head',
          actionType: resolveActionType(itSignatory.actionType, 'endorse'),
          signatoryUid: itSignatory.id,
          signatoryName: itSignatory.name,
          signatoryEmail: itSignatory.email,
          department: itSignatory.department || 'Information Technology Department',
          status: deptStatus,
        });
      }
    }

    // Hospitality Program Head if BSHM/BSTM is involved
    if (touchedHM) {
      const hmSignatory = findSignatory('program_head', 'Hospitality') || findSignatory('program_head', 'Tourism');
      if (hmSignatory && !addedSignatoryIds.has(hmSignatory.id)) {
        addedSignatoryIds.add(hmSignatory.id);
        chain.push({
          id: `step_${stepIndex}`,
          step: stepIndex++,
          stageIndex: deptStageIndex,
          stageName: deptStageName,
          role: 'program_head',
          roleTitle: hmSignatory.roleTitle || 'Hospitality Management Program Head',
          actionType: resolveActionType(hmSignatory.actionType, 'endorse'),
          signatoryUid: hmSignatory.id,
          signatoryName: hmSignatory.name,
          signatoryEmail: hmSignatory.email,
          department: hmSignatory.department || 'Hospitality Department',
          status: deptStatus,
        });
      }
    }

    // Business Program Head if BSBA is involved
    if (touchedBA) {
      const baSignatory = findSignatory('program_head', 'Business') || findSignatory('program_head', 'Accountancy');
      if (baSignatory && !addedSignatoryIds.has(baSignatory.id)) {
        addedSignatoryIds.add(baSignatory.id);
        chain.push({
          id: `step_${stepIndex}`,
          step: stepIndex++,
          stageIndex: deptStageIndex,
          stageName: deptStageName,
          role: 'program_head',
          roleTitle: baSignatory.roleTitle || 'Business Administration Program Head',
          actionType: resolveActionType(baSignatory.actionType, 'endorse'),
          signatoryUid: baSignatory.id,
          signatoryName: baSignatory.name,
          signatoryEmail: baSignatory.email,
          department: baSignatory.department || 'Business Management Department',
          status: deptStatus,
        });
      }
    }

    // If general college or no department matched, include general Program Head
    if (addedSignatoryIds.size === 0) {
      const generalHead = findSignatory('program_head') || {
        id: 'sig_program_head_default',
        name: 'Program Head',
        email: 'programs@ormoc.sti.edu.ph',
        role: 'program_head' as const,
        roleTitle: 'Program Head',
        department: 'Academic Department',
        actionType: 'endorse' as const,
      };
      addedSignatoryIds.add(generalHead.id);
      chain.push({
        id: `step_${stepIndex}`,
        step: stepIndex++,
        stageIndex: deptStageIndex,
        stageName: deptStageName,
        role: 'program_head',
        roleTitle: generalHead.roleTitle || 'Department Head',
        actionType: resolveActionType(generalHead.actionType, 'endorse'),
        signatoryUid: generalHead.id,
        signatoryName: generalHead.name,
        signatoryEmail: generalHead.email,
        department: generalHead.department || 'Academic Department',
        status: deptStatus,
      });
    }
  }

  // ── Stage 3 (or 2 for SAS Creator): Academic Affairs Review ──
  const effectiveAcadHead = findSignatory('academic_head') || {
    id: 'sig_acad_head_default',
    name: 'Academic Affairs Head',
    email: 'academics@ormoc.sti.edu.ph',
    role: 'academic_head' as const,
    roleTitle: 'Academic Head',
    department: 'Academic Affairs',
    actionType: 'endorse' as const,
  };
  chain.push({
    id: `step_${stepIndex}`,
    step: stepIndex++,
    stageIndex: acadStageIndex,
    stageName: acadStageName,
    role: 'academic_head',
    roleTitle: effectiveAcadHead.roleTitle || 'Academic Head',
    actionType: resolveActionType(effectiveAcadHead.actionType, 'endorse'),
    signatoryUid: effectiveAcadHead.id,
    signatoryName: effectiveAcadHead.name,
    signatoryEmail: effectiveAcadHead.email,
    department: effectiveAcadHead.department || 'Academic Affairs',
    status: 'waiting',
  });

  // ── Stage 4 (or 3 for SAS Creator): Executive Administration & Presidential Approval ──
  // A. School Administrator Endorsement (if configured)
  const adminHead = findSignatory('school_administrator');
  if (adminHead) {
    chain.push({
      id: `step_${stepIndex}`,
      step: stepIndex++,
      stageIndex: execStageIndex,
      stageName: execStageName,
      role: 'school_administrator',
      roleTitle: adminHead.roleTitle || 'School Administrator',
      actionType: resolveActionType(adminHead.actionType, 'endorse'),
      signatoryUid: adminHead.id,
      signatoryName: adminHead.name,
      signatoryEmail: adminHead.email,
      department: adminHead.department || 'Administration & Operations',
      status: 'waiting',
    });
  }

  // B. Final School President Approval
  const effectivePresident = findSignatory('school_president') || {
    id: 'sig_school_president_default',
    name: 'School President',
    email: 'president@ormoc.sti.edu.ph',
    role: 'school_president' as const,
    roleTitle: 'School President',
    department: 'Office of the President',
    actionType: 'approve' as const,
  };
  chain.push({
    id: `step_${stepIndex}`,
    step: stepIndex++,
    stageIndex: execStageIndex,
    stageName: execStageName,
    role: 'school_president',
    roleTitle: effectivePresident.roleTitle || 'School President',
    actionType: resolveActionType(effectivePresident.actionType, 'approve'),
    signatoryUid: effectivePresident.id,
    signatoryName: effectivePresident.name,
    signatoryEmail: effectivePresident.email,
    department: effectivePresident.department || 'Office of the President',
    status: 'waiting',
  });

  return chain;
}
