import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findAdviserConflictInOrganizations,
  validateAdviserRecordsConflict,
} from '../adviser-validation.utils.ts';

describe('Lightweight Adviser Validation (Signatory-Style Parity)', () => {
  const organizations = [
    {
      id: 'org-1',
      name: 'Junior Philippine Computer Society',
      adviser: { email: 'juan.delacruz@ormoc.sti.edu.ph', employeeId: 'FAC-2026-001' },
    },
    {
      id: 'org-2',
      name: 'STI Debate Guild',
      adviser: null,
    },
  ];

  test('detects duplicate adviser email across other organizations case-insensitively', () => {
    const conflict = findAdviserConflictInOrganizations({
      email: '  JUAN.DELACRUZ@ORMOC.STI.EDU.PH ',
      organizations,
    });

    assert.ok(conflict);
    assert.equal(conflict.field, 'email');
    assert.match(conflict.message, /Junior Philippine Computer Society/);
  });

  test('ignores matching adviser on excludeOrgId when editing the same organization', () => {
    const conflict = findAdviserConflictInOrganizations({
      email: 'juan.delacruz@ormoc.sti.edu.ph',
      employeeId: 'FAC-2026-001',
      organizations,
      excludeOrgId: 'org-1',
    });

    assert.equal(conflict, null);
  });

  test('detects duplicate employeeId when provided and ignores blank employeeId', () => {
    const empConflict = findAdviserConflictInOrganizations({
      email: 'new.faculty@ormoc.sti.edu.ph',
      employeeId: 'fac-2026-001',
      organizations,
    });
    assert.ok(empConflict);
    assert.equal(empConflict.field, 'employeeId');

    const blankEmpClear = findAdviserConflictInOrganizations({
      email: 'new.faculty@ormoc.sti.edu.ph',
      employeeId: '   ',
      organizations: [
        { id: 'org-3', name: 'Robotics', adviser: { email: 'rob@ormoc.sti.edu.ph', employeeId: '' } },
      ],
    });
    assert.equal(blankEmpClear, null);
  });

  test('flags active organization_advisers or institutional_signatories conflicts while ignoring revoked/inactive records', () => {
    const inactiveCleared = validateAdviserRecordsConflict({
      email: 'revoked@ormoc.sti.edu.ph',
      adviserRecords: [{ email: 'revoked@ormoc.sti.edu.ph', organizationId: 'org-1', isActive: false }],
      signatoryRecords: [{ email: 'revoked@ormoc.sti.edu.ph', name: 'Inactive Signatory', isActive: false }],
    });
    assert.equal(inactiveCleared, null);

    const signatoryConflict = validateAdviserRecordsConflict({
      email: 'dean@ormoc.sti.edu.ph',
      signatoryRecords: [{ email: 'dean@ormoc.sti.edu.ph', name: 'Dean Cruz', isActive: true }],
    });
    assert.ok(signatoryConflict);
    assert.equal(signatoryConflict.field, 'email');
    assert.match(signatoryConflict.message, /Institutional Signatory \(Dean Cruz\)/);
  });
});
