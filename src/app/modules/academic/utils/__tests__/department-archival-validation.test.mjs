import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDepartmentArchivalEligibility } from '../department-archival-validation.utils.ts';

const citeDept = {
  id: 'dept-cite',
  code: 'CITE',
  name: 'College of Information Technology Education',
  archived: false,
};

test('blocks archival when department still has active programs, sections, and students', () => {
  const result = evaluateDepartmentArchivalEligibility({
    department: citeDept,
    courses: [
      { id: 'c-bsit', code: 'BSIT', name: 'BS Information Technology', departmentId: 'dept-cite', archived: false },
      { id: 'c-old', code: 'ACT', name: 'Associate in Computer Tech', departmentId: 'dept-cite', archived: true },
    ],
    sections: [
      { id: 'sec-1', name: 'BSIT-1A', courseId: 'c-bsit', departmentId: 'dept-cite', yearLevel: 1, archived: false },
      { id: 'sec-2', name: 'BSIT-OLD', courseId: 'c-bsit', departmentId: 'dept-cite', yearLevel: 2, archived: true },
    ],
    students: [
      { id: 'stu-1', studentId: '02000111111', firstName: 'Ana', lastName: 'Cruz', departmentId: 'dept-cite', courseCode: 'BSIT', status: 'ACTIVE' },
      { id: 'stu-2', studentId: '02000222222', firstName: 'Ben', lastName: 'Reyes', departmentId: 'dept-cite', courseCode: 'BSIT', status: 'INACTIVE' },
      { id: 'stu-3', studentId: '02000333333', firstName: 'Cara', lastName: 'Lim', departmentId: 'dept-cite', courseCode: 'BSIT', status: 'ARCHIVED' },
    ],
  });

  assert.equal(result.canArchive, false);
  assert.deepEqual(result.counts, { programs: 1, sections: 1, students: 1 });
  assert.match(result.summaryMessage, /1 active program/i);
  assert.match(result.summaryMessage, /1 active section/i);
  assert.match(result.summaryMessage, /1 active student/i);
});

test('catches active sections and active students linked only via courseId/courseCode even when departmentId is missing', () => {
  const result = evaluateDepartmentArchivalEligibility({
    department: citeDept,
    courses: [
      { id: 'c-bsit', code: 'BSIT', name: 'BS Information Technology', departmentId: 'dept-cite', archived: true },
    ],
    sections: [
      { id: 'sec-orphan', name: 'BSIT-4A', courseId: 'c-bsit', yearLevel: 4, archived: false },
    ],
    students: [
      { id: 'stu-legacy', studentId: '02000444444', firstName: 'Dan', lastName: 'Sy', courseCode: 'BSIT', status: 'ACTIVE' },
    ],
  });

  assert.equal(result.canArchive, false);
  assert.deepEqual(result.counts, { programs: 0, sections: 1, students: 1 });
});

test('allows archival when all programs and sections are archived and no active students remain', () => {
  const result = evaluateDepartmentArchivalEligibility({
    department: citeDept,
    courses: [
      { id: 'c-bsit', code: 'BSIT', name: 'BS Information Technology', departmentId: 'dept-cite', archived: true },
      { id: 'c-bshm', code: 'BSHM', name: 'BS Hospitality Management', departmentId: 'dept-thm', archived: false },
    ],
    sections: [
      { id: 'sec-1', name: 'BSIT-1A', courseId: 'c-bsit', departmentId: 'dept-cite', archived: true },
      { id: 'sec-thm', name: 'BSHM-1A', courseId: 'c-bshm', departmentId: 'dept-thm', archived: false },
    ],
    students: [
      { id: 'stu-inact', firstName: 'Ana', lastName: 'Cruz', departmentId: 'dept-cite', courseCode: 'BSIT', status: 'INACTIVE' },
      { id: 'stu-arch', firstName: 'Ben', lastName: 'Reyes', departmentId: 'dept-cite', courseCode: 'BSIT', status: 'ARCHIVED' },
      { id: 'stu-other', firstName: 'Cara', lastName: 'Lim', departmentId: 'dept-thm', courseCode: 'BSHM', status: 'ACTIVE' },
    ],
  });

  assert.equal(result.canArchive, true);
  assert.deepEqual(result.counts, { programs: 0, sections: 0, students: 0 });
  assert.equal(result.blockers.length, 0);
});
