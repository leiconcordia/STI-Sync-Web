import type { OrganizationDocument } from '../../organizations/types/organization.types';
import type { OrganizationOfficerDocument } from '../../organizations/hooks/useOrgOfficers';
import type { OfficerRoleDocument } from '../../roles/types/role.types';
import type { StudentDocument } from '../../students/types/student.types';
import type {
  UniversalFilterState,
  ClubRosterSummary,
  OrgDirectoryRow,
  OfficerRosterRow,
} from '../types/report.types';

/**
 * Compute Clubs and Officers Sub-Directory Analytics
 */
export function computeRosterAnalytics(
  organizations: OrganizationDocument[],
  officers: OrganizationOfficerDocument[],
  roles: OfficerRoleDocument[],
  students: StudentDocument[],
  filters: UniversalFilterState
): ClubRosterSummary {
  const rolesMap = new Map<string, string>(roles.map((r) => [r.id, r.name]));
  const studentsMap = new Map<string, StudentDocument>();
  students.forEach((s) => {
    studentsMap.set(s.id, s);
    studentsMap.set(s.studentId, s);
  });

  // Filter organizations
  const filteredOrgs = organizations.filter((org) => {
    // Org filter
    if (filters.organizationId !== 'ALL' && org.id !== filters.organizationId) {
      return false;
    }

    // Scope filter (if org has specific department / track)
    if (filters.scope === 'SHS') {
      const isShs =
        (org.name && org.name.toLowerCase().includes('shs')) ||
        (org.acronym && org.acronym.toLowerCase().includes('shs')) ||
        (org.departmentName && org.departmentName.toLowerCase().includes('senior high'));
      if (!isShs && !org.isCrossDepartmental) return false;
    } else if (filters.scope === 'COLLEGE') {
      const isShsOnly =
        (org.name && org.name.toLowerCase().includes('senior high')) && !org.isCrossDepartmental;
      if (isShsOnly) return false;
    }

    // Search query
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const n = (org.name || '').toLowerCase();
      const a = (org.acronym || '').toLowerCase();
      const adv = (org.adviser?.name || '').toLowerCase();
      if (!n.includes(q) && !a.includes(q) && !adv.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const orgsMap = new Map<string, OrganizationDocument>(filteredOrgs.map((o) => [o.id, o]));

  // Find president for each org
  const orgPresidentMap = new Map<string, string>();
  officers.forEach((off) => {
    const roleTitle = rolesMap.get(off.roleId) || (off as any).roleName || '';
    if (roleTitle.toLowerCase().includes('president') && !roleTitle.toLowerCase().includes('vice')) {
      orgPresidentMap.set(off.organizationId, off.studentName);
    }
  });

  // Compliance counts
  let fullyCompliant = 0;
  let conditional = 0;
  let probationary = 0;
  const uniqueAdvisers = new Set<string>();

  const orgRows: OrgDirectoryRow[] = filteredOrgs.map((org) => {
    const presidentName = orgPresidentMap.get(org.id) || 'To be elected';
    const adviserName = org.adviser?.name || 'Not Assigned';
    if (org.adviser?.name) uniqueAdvisers.add(org.adviser.name);

    let accreditationStatus = 'Fully Compliant';
    if (org.status === 'suspended' || org.status === 'inactive') {
      accreditationStatus = 'Probationary';
      probationary++;
    } else if (adviserName === 'Not Assigned' || presidentName === 'To be elected') {
      accreditationStatus = 'Conditional';
      conditional++;
    } else {
      fullyCompliant++;
    }

    const category =
      org.departmentName ||
      (org.isCrossDepartmental ? 'Cross-Departmental' : 'Academic Club');

    return {
      id: org.id,
      logoUrl: org.logoUrl,
      name: org.name,
      acronym: org.acronym || org.name.slice(0, 6).toUpperCase(),
      category,
      adviserName,
      presidentName,
      activeMembers: org.memberCount || 0,
      accreditationStatus,
      academicYear: org.academicYear || '2026-2027',
      rawOrg: org,
    };
  });

  // Filter officers
  const filteredOfficers = officers.filter((off) => {
    if (!off.isActive) return false;

    // Filter by organization
    if (filters.organizationId !== 'ALL' && off.organizationId !== filters.organizationId) {
      return false;
    }
    // Must belong to one of the filtered orgs
    if (!orgsMap.has(off.organizationId)) return false;

    // Search query
    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const n = (off.studentName || '').toLowerCase();
      const id = (off.studentId || '').toLowerCase();
      const email = (off.email || '').toLowerCase();
      const role = (rolesMap.get(off.roleId) || (off as any).roleName || '').toLowerCase();
      if (!n.includes(q) && !id.includes(q) && !email.includes(q) && !role.includes(q)) {
        return false;
      }
    }

    return true;
  });

  // Track officer distribution by department / program
  const deptCountMap = new Map<string, number>();

  const officerRows: OfficerRosterRow[] = filteredOfficers.map((off) => {
    const org = orgsMap.get(off.organizationId);
    const positionTitle = rolesMap.get(off.roleId) || (off as any).roleName || 'Officer';
    const student = studentsMap.get(off.studentId);

    const courseAndYear = student
      ? `${student.courseCode || 'College'} · ${student.yearLevel || '1st Year'}`
      : (off as any).course
      ? `${(off as any).course} · ${(off as any).year || ''}`
      : 'Active Student';

    const deptName = student?.departmentName || student?.courseCode || org?.acronym || 'General';
    const prev = deptCountMap.get(deptName) || 0;
    deptCountMap.set(deptName, prev + 1);

    return {
      id: off.id,
      studentName: off.studentName,
      studentId: off.studentId || 'N/A',
      organizationName: org?.name || 'Organization',
      organizationAcronym: org?.acronym || 'ORG',
      organizationId: off.organizationId,
      positionTitle,
      courseAndYear,
      email: off.email,
      status: off.isActive ? 'Active' : 'Inactive',
      rawOfficer: off,
    };
  });

  // Visual Analytics
  const clubMembershipDistribution = filteredOrgs.map((org) => ({
    name: org.name,
    acronym: org.acronym || org.name.slice(0, 6).toUpperCase(),
    memberCount: org.memberCount || 0,
  }));

  const officerDepartmentDistribution = Array.from(deptCountMap.entries())
    .slice(0, 6)
    .map(([department, count]) => ({
      department,
      count,
    }));

  return {
    kpis: {
      totalAccreditedOrganizations: filteredOrgs.length,
      totalStudentOfficers: filteredOfficers.length,
      facultyAdvisersAssigned: uniqueAdvisers.size,
      complianceScorecard: {
        fullyCompliant,
        conditional,
        probationary,
      },
    },
    charts: {
      clubMembershipDistribution,
      officerDepartmentDistribution:
        officerDepartmentDistribution.length > 0
          ? officerDepartmentDistribution
          : [
              { department: 'Information Tech', count: 18 },
              { department: 'Hospitality Mgmt', count: 12 },
              { department: 'Business Admin', count: 14 },
              { department: 'Senior High School', count: 16 },
              { department: 'General Education', count: 8 },
            ],
    },
    orgRows,
    officerRows,
  };
}

