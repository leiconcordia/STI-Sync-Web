import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAnticipatedParticipantsForEvent,
  buildDeterministicAttendanceDocId,
  buildCanonicalAttendanceLookup,
  mergeAttendanceRecordsForRoster,
  resolveMergedAttendanceStatus,
  isAttendedStatus,
} from '../../utils/attendance-sync.utils.ts';

describe('Anticipated Participants Resolution & Default Absent / Mobile Sync', () => {
  const sampleCourses = [
    { id: 'c_bsit', code: 'BSIT', name: 'BS Information Technology', academicLevel: 'COLLEGE' },
    { id: 'c_stem', code: 'STEM', name: 'Science Technology Engineering Mathematics', academicLevel: 'SHS' },
  ];

  const sampleStudents = [
    {
      id: 'stu_1_dup',
      studentId: '02000100001',
      firstName: 'Ana',
      lastName: 'Reyes',
      academicLevel: 'COLLEGE',
      courseId: 'c_bsit',
      courseCode: 'BSIT',
      yearLevel: '1st Year',
      section: 'BSIT-1A',
      status: 'ACTIVE',
    },
    {
      id: 'stu_1_auth',
      authUid: 'uid_ana_1',
      studentId: '02000100001',
      firstName: 'Ana',
      lastName: 'Reyes',
      academicLevel: 'COLLEGE',
      courseId: 'c_bsit',
      courseCode: 'BSIT',
      yearLevel: '1st Year',
      section: 'BSIT-1A',
      status: 'ACTIVE',
    },
    {
      id: 'stu_2',
      authUid: 'uid_ben_2',
      studentId: '02000100002',
      firstName: 'Ben',
      lastName: 'Cruz',
      academicLevel: 'SHS',
      courseId: 'c_stem',
      courseCode: 'STEM',
      yearLevel: 'Grade 11',
      section: 'STEM-11A',
      status: 'ACTIVE',
    },
    {
      id: 'stu_archived',
      studentId: '02000100099',
      firstName: 'Archived',
      lastName: 'User',
      academicLevel: 'COLLEGE',
      courseId: 'c_bsit',
      courseCode: 'BSIT',
      yearLevel: '1st Year',
      section: 'BSIT-1A',
      archived: true,
      status: 'ARCHIVED',
    },
  ];

  const orgMembers = [
    {
      id: 'mem_1',
      organizationId: 'jpcs',
      studentId: '02000100001',
      authUid: 'uid_ana_1',
      status: 'active',
    },
    {
      id: 'mem_excluded',
      organizationId: 'jpcs',
      studentId: '02000100002',
      authUid: 'uid_ben_2',
      status: 'active',
    },
  ];

  test('deduplicates active students and excludes archived students', () => {
    const evt = { id: 'evt1', targetAudienceScope: 'all', targetAcademicLevel: 'BOTH' };
    const result = resolveAnticipatedParticipantsForEvent(evt, sampleStudents, orgMembers, sampleCourses);
    assert.equal(result.length, 2);
    const ana = result.find((s) => s.studentId === '02000100001');
    assert.equal(ana?.authUid, 'uid_ana_1');
  });

  test('resolves org-members scope using organization_members and honors excludedMemberIds', () => {
    const evt = {
      id: 'evt_club',
      hostingOrgId: 'jpcs',
      targetAudienceScope: 'members',
      excludedMemberIds: ['02000100002'],
    };
    const result = resolveAnticipatedParticipantsForEvent(evt, sampleStudents, orgMembers, sampleCourses);
    assert.equal(result.length, 1);
    assert.equal(result[0].studentId, '02000100001');
  });

  test('normalizes SHS year level formats (G11 vs Grade 11)', () => {
    const evt = {
      id: 'evt_shs',
      targetAudienceScope: 'specific',
      targetAcademicLevel: 'SHS',
      targetYearLevels: ['G11'],
    };
    const result = resolveAnticipatedParticipantsForEvent(evt, sampleStudents, orgMembers, sampleCourses);
    assert.equal(result.length, 1);
    assert.equal(result[0].studentId, '02000100002');
  });

  test('promotes pre-seeded Absent doc (schoolId) to Present + Time-In + Time-Out when mobile syncs via authUid', () => {
    const canonicalLookup = buildCanonicalAttendanceLookup(sampleStudents);
    const seedId = buildDeterministicAttendanceDocId('evt1', 'sess_1', '02000100001');

    const seededAbsent = {
      id: seedId,
      collectionSource: 'top_level',
      isDefaultAbsentSeed: true,
      eventId: 'evt1',
      event: 'Tech Assembly',
      sessionId: 'sess_1',
      studentId: '02000100001',
      studentSchoolId: '02000100001',
      name: 'Ana Reyes',
      org: 'JPCS',
      checkIn: '—',
      checkOut: '—',
      status: 'Absent',
    };

    const mobileTimeIn = {
      id: 'mob_scan_in_1',
      collectionSource: 'subcollection',
      syncedFromMobile: true,
      eventId: 'evt1',
      event: 'Tech Assembly',
      sessionId: 'sess_1',
      studentId: 'uid_ana_1',
      studentAuthUid: 'uid_ana_1',
      studentNumber: '02000100001',
      name: 'Ana Reyes',
      org: 'JPCS',
      checkIn: '08:05 AM',
      checkOut: '—',
      status: 'Present',
      scannedBy: 'off_1',
      scannedByName: 'Officer Scanner',
      scanMethod: 'qr',
      scannedAt: { seconds: 1700000100 },
    };

    // After Time-In only -> 1 merged row marked Present with Time-In
    const afterTimeIn = mergeAttendanceRecordsForRoster([seededAbsent, mobileTimeIn], canonicalLookup);
    assert.equal(afterTimeIn.length, 1);
    assert.equal(afterTimeIn[0].status, 'Present');
    assert.equal(afterTimeIn[0].checkIn, '08:05 AM');
    assert.equal(afterTimeIn[0].checkOut, '—');
    assert.equal(afterTimeIn[0].scannedByName, 'Officer Scanner');
    assert.equal(isAttendedStatus(afterTimeIn[0].status), true);

    // Reverse order (mobile scan seen first, Absent seed second) never overwrites Time-In back to Absent
    const reversedOrder = mergeAttendanceRecordsForRoster([mobileTimeIn, seededAbsent], canonicalLookup);
    assert.equal(reversedOrder.length, 1);
    assert.equal(reversedOrder[0].status, 'Present');
    assert.equal(reversedOrder[0].checkIn, '08:05 AM');

    // Subsequent Time-Out sync from mobile -> Complete with both Time-In and Time-Out
    const mobileTimeOut = {
      id: 'mob_scan_out_1',
      collectionSource: 'subcollection',
      syncedFromMobile: true,
      eventId: 'evt1',
      event: 'Tech Assembly',
      sessionId: 'sess_1',
      studentId: 'uid_ana_1',
      studentAuthUid: 'uid_ana_1',
      name: 'Ana Reyes',
      org: 'JPCS',
      checkIn: '—',
      checkOut: '11:45 AM',
      status: 'Present',
      scannedAt: { seconds: 1700005000 },
    };

    const afterTimeOut = mergeAttendanceRecordsForRoster(
      [seededAbsent, mobileTimeIn, mobileTimeOut],
      canonicalLookup
    );
    assert.equal(afterTimeOut.length, 1);
    assert.equal(afterTimeOut[0].status, 'Complete');
    assert.equal(afterTimeOut[0].checkIn, '08:05 AM');
    assert.equal(afterTimeOut[0].checkOut, '11:45 AM');
  });

  test('preserves Late status on late Time-In scan', () => {
    const status = resolveMergedAttendanceStatus({
      rawStatus: 'Late',
      checkIn: '09:15 AM',
      checkOut: '—',
    });
    assert.equal(status, 'Late');
    assert.equal(isAttendedStatus(status), true);
  });
});
