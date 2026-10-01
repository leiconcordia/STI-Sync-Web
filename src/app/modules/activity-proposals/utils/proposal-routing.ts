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

  // ── Stage 1: Department & Organizational Endorsements (Parallel Signers) ──
  // A. SAS Coordinator / Reviewer (Only required when submitted by student orgs; if SAS is the maker, they are already the 'Proposed By' author)
  if (!isSasCreator) {
    chain.push({
      id: `step_${stepIndex}`,
      step: stepIndex++,
      stageIndex: 1,
      stageName: 'Department & Program Endorsements',
      role: 'sas_coordinator',
      roleTitle: 'SAS Coordinator / Reviewer',
      actionType: 'endorse',
      signatoryName: sasAdminName,
      signatoryEmail: sasAdminEmail,
      department: 'Student Affairs & Services',
      status: 'current',
    });
  }

  // B. Target Audience Department Evaluation
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
          stageIndex: 1,
          stageName: 'Department & Program Endorsements',
          role: match.role,
          roleTitle: match.roleTitle || 'Department Head',
          actionType: resolveActionType(match.actionType, 'endorse'),
          signatoryUid: match.id,
          signatoryName: match.name,
          signatoryEmail: match.email,
          department: match.department,
          status: 'current',
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
          stageIndex: 1,
          stageName: 'Department & Program Endorsements',
          role: 'shs_principal',
          roleTitle: shsSignatory.roleTitle || 'SHS Assistant Principal',
          actionType: resolveActionType(shsSignatory.actionType, 'endorse'),
          signatoryUid: shsSignatory.id,
          signatoryName: shsSignatory.name,
          signatoryEmail: shsSignatory.email,
          department: shsSignatory.department || 'Senior High School',
          status: 'current',
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
          stageIndex: 1,
          stageName: 'Department & Program Endorsements',
          role: 'program_head',
          roleTitle: itSignatory.roleTitle || 'IT Program Head',
          actionType: resolveActionType(itSignatory.actionType, 'endorse'),
          signatoryUid: itSignatory.id,
          signatoryName: itSignatory.name,
          signatoryEmail: itSignatory.email,
          department: itSignatory.department || 'Information Technology Department',
          status: 'current',
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
          stageIndex: 1,
          stageName: 'Department & Program Endorsements',
          role: 'program_head',
          roleTitle: hmSignatory.roleTitle || 'Hospitality Management Program Head',
          actionType: resolveActionType(hmSignatory.actionType, 'endorse'),
          signatoryUid: hmSignatory.id,
          signatoryName: hmSignatory.name,
          signatoryEmail: hmSignatory.email,
          department: hmSignatory.department || 'Hospitality Department',
          status: 'current',
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
          stageIndex: 1,
          stageName: 'Department & Program Endorsements',
          role: 'program_head',
          roleTitle: baSignatory.roleTitle || 'Business Administration Program Head',
          actionType: resolveActionType(baSignatory.actionType, 'endorse'),
          signatoryUid: baSignatory.id,
          signatoryName: baSignatory.name,
          signatoryEmail: baSignatory.email,
          department: baSignatory.department || 'Business Management Department',
          status: 'current',
        });
      }
    }

    // If general college or no department matched, include general Program Head
    if (addedSignatoryIds.size === 0) {
      const generalHead = findSignatory('program_head');
      if (generalHead && !addedSignatoryIds.has(generalHead.id)) {
        addedSignatoryIds.add(generalHead.id);
        chain.push({
          id: `step_${stepIndex}`,
          step: stepIndex++,
          stageIndex: 1,
          stageName: 'Department & Program Endorsements',
          role: 'program_head',
          roleTitle: generalHead.roleTitle || 'Department Head',
          actionType: resolveActionType(generalHead.actionType, 'endorse'),
          signatoryUid: generalHead.id,
          signatoryName: generalHead.name,
          signatoryEmail: generalHead.email,
          department: generalHead.department || 'Academic Department',
          status: 'current',
        });
      }
    }
  }

  // ── Stage 2: Academic Affairs Review ──
  const acadHead = findSignatory('academic_head');
  if (acadHead) {
    chain.push({
      id: `step_${stepIndex}`,
      step: stepIndex++,
      stageIndex: 2,
      stageName: 'Academic Affairs Review',
      role: 'academic_head',
      roleTitle: acadHead.roleTitle || 'Academic Head',
      actionType: resolveActionType(acadHead.actionType, 'endorse'),
      signatoryUid: acadHead.id,
      signatoryName: acadHead.name,
      signatoryEmail: acadHead.email,
      department: acadHead.department || 'Academic Affairs',
      status: 'waiting',
    });
  }

  // ── Stage 3: Executive Administration & Presidential Approval ──
  // A. School Administrator Endorsement
  const adminHead = findSignatory('school_administrator');
  if (adminHead) {
    chain.push({
      id: `step_${stepIndex}`,
      step: stepIndex++,
      stageIndex: 3,
      stageName: 'Executive Administration & Approval',
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
  const president = findSignatory('school_president');
  if (president) {
    chain.push({
      id: `step_${stepIndex}`,
      step: stepIndex++,
      stageIndex: 3,
      stageName: 'Executive Administration & Approval',
      role: 'school_president',
      roleTitle: president.roleTitle || 'School President',
      actionType: resolveActionType(president.actionType, 'approve'),
      signatoryUid: president.id,
      signatoryName: president.name,
      signatoryEmail: president.email,
      department: president.department || 'Office of the President',
      status: 'waiting',
    });
  }

  return chain;
}
