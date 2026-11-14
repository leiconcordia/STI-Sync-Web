import {
  collection,
  addDoc,
  setDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  writeBatch,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { formatPersonName } from '../../../utils/name.utils';
import type {
  AddMemberPayload,
  OrganizationMemberDocument,
  OrganizationMemberStatus,
} from '../types/member.types';
import {
  extractExcludedMemberIdentifiers,
  isActivityEndedOrCancelled,
  isClubActivity,
  isMemberCurrentlyInClub,
  isStudentSignedUpForActivity,
  normalizeMemberIdentifiers,
} from '../utils/member-removal.utils';

const COLLECTION = 'organization_members';

/**
 * Helper to ensure a membership fee payable is generated for an active member
 * the moment they join or are approved:
 * 1. Checks if the club already created/generated a membership_due in /payables (uses its fee, label, semester, dueDate).
 * 2. Or checks if the organization has membershipFee configured in /organizations.
 * 3. Deduplicates and automatically creates the 'membership_due' payable document for the student!
 */
export async function ensureMembershipPayable(
  organizationId: string,
  studentId: string,
  studentName: string,
  paymentStatus: 'paid' | 'outstanding' = 'outstanding',
  addedBy: string = 'Officer'
): Promise<{ payableCreated: boolean; feeAmount?: number }> {
  try {
    if (!organizationId || !studentId) return { payableCreated: false };

    const payablesRef = collection(db, 'payables');

    // 1. Check if the student already has a membership_due for this organization
    const qExistingOrgDues = query(
      payablesRef,
      where('organizationId', '==', organizationId),
      where('type', '==', 'membership_due')
    );
    const existingSnap = await getDocs(qExistingOrgDues);

    const alreadyHasDue = existingSnap.docs.some((d) => {
      const data = d.data();
      const sId = (studentId || '').toString().trim().toLowerCase();
      const match1 = (data.studentId || '').toString().trim().toLowerCase() === sId;
      const match2 = (data.studentSchoolId || '').toString().trim().toLowerCase() === sId;
      return match1 || match2;
    });

    if (alreadyHasDue) {
      return { payableCreated: false };
    }

    // 2. Determine fee amount, label, and semester from existing club dues OR org profile
    let feeAmount = 0;
    let label = 'Membership Due';
    let description = 'Semester membership fee';
    let semesterId: string | null = null;
    let dueDate: any = null;
    let organizationName = 'Organization';

    // If the club already has membership_due payables created, extract their details as template
    if (!existingSnap.empty) {
      const sample = existingSnap.docs[0].data();
      feeAmount = Number(sample.assignedAmount) || 0;
      label = sample.label || label;
      description = sample.description || description;
      semesterId = sample.semesterId || null;
      dueDate = sample.dueDate || null;
      organizationName = sample.organizationName || organizationName;
    }

    // If no fee found from existing payables, check /organizations document
    if (feeAmount <= 0) {
      const orgRef = doc(db, 'organizations', organizationId);
      const orgSnap = await getDoc(orgRef);
      if (orgSnap.exists()) {
        const orgData = orgSnap.data();
        feeAmount = Number(orgData.membershipFee || 0);
        organizationName = orgData.name || organizationName;
        label = `${orgData.acronym || orgData.name || 'Organization'} Membership Due`;
      }
    }

    // 3. If there is a fee, create the membership_due payable for this student
    if (feeAmount > 0) {
      const isPaid = paymentStatus === 'paid';
      const newPayableRef = doc(collection(db, 'payables'));

      await setDoc(newPayableRef, {
        id: newPayableRef.id,
        studentId: studentId,
        studentSchoolId: studentId,
        studentName: studentName || 'Student',
        type: 'membership_due',
        label: label,
        description: description,
        organizationId: organizationId,
        organizationName: organizationName,
        semesterId: semesterId,
        eventId: null,
        assignedAmount: feeAmount,
        paidAmount: isPaid ? feeAmount : 0,
        status: isPaid ? 'paid' : 'pending',
        dueDate: dueDate,
        paidAt: isPaid ? serverTimestamp() : null,
        recordedBy: isPaid ? addedBy : null,
        paymentMethod: isPaid ? 'cash' : null,
        createdBy: addedBy || 'Officer Management',
        assignedBy: addedBy || 'Officer Management',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return { payableCreated: true, feeAmount };
    }
  } catch (err) {
    console.warn('[member.service] Error ensuring membership payable:', err);
  }
  return { payableCreated: false };
}

export const addMember = async (payload: AddMemberPayload, addedBy: string): Promise<string> => {
  try {
    // Enforce organization department eligibility
    if (payload.organizationId) {
      const orgRef = doc(db, 'organizations', payload.organizationId);
      const orgSnap = await getDoc(orgRef);
      if (orgSnap.exists()) {
        const orgData = orgSnap.data();
        const isCross =
          !orgData.departmentId ||
          orgData.departmentId === 'cross-departmental' ||
          orgData.scope === 'cross-departmental' ||
          orgData.isCrossDepartmental === true;

        if (!isCross) {
          const sDept = (payload.department || '').toLowerCase().trim();
          const orgDeptName = (orgData.departmentName || orgData.department || '').toLowerCase().trim();
          const orgDeptCode = (orgData.departmentCode || '').toLowerCase().trim();

          const matches =
            !sDept ||
            (orgDeptName && (sDept.includes(orgDeptName) || orgDeptName.includes(sDept))) ||
            (orgDeptCode && (sDept.includes(orgDeptCode) || orgDeptCode.includes(sDept)));

          if (!matches) {
            throw new Error(
              `Cannot add member: This organization is restricted to ${orgData.departmentName || orgData.departmentCode || 'departmental'} students.`
            );
          }
        }
      }
    }

    const addPromise = addDoc(collection(db, COLLECTION), {
      ...payload,
      isOfficer: false,
      addedBy,
      dateJoined: payload.status === 'active' ? serverTimestamp() : null,
      applicationDate: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Firestore database write timed out.")), 15000);
    });
    
    const docRef = await Promise.race([addPromise, timeoutPromise]);

    // Increment memberCount on the organization document if active
    if (payload.organizationId && payload.status === 'active') {
      try {
        const orgRef = doc(db, 'organizations', payload.organizationId);
        await updateDoc(orgRef, {
          memberCount: increment(1),
          updatedAt: serverTimestamp(),
        });

        // Trigger membership fee payable if configured or created
        await ensureMembershipPayable(
          payload.organizationId,
          payload.studentId || docRef.id,
          payload.studentName,
          payload.paymentStatus,
          addedBy
        );
      } catch (orgErr) {
        console.warn('Could not update organization memberCount / payable:', orgErr);
      }
    }

    return docRef.id;
  } catch (error: any) {
    console.error("Member creation failed:", error);
    throw new Error(`Member creation failed: ${error.message}`);
  }
};

export const updateMemberStatus = async (
  docId: string,
  status: OrganizationMemberStatus,
  actionByUid?: string
): Promise<void> => {
  const docRef = doc(db, COLLECTION, docId);
  const snap = await getDoc(docRef);
  const prevData = snap.exists() ? (snap.data() as Partial<OrganizationMemberDocument>) : null;
  const prevStatus = prevData?.status;
  const orgId = prevData?.organizationId;
  const studentId = prevData?.studentId || docId;
  const studentName = prevData?.studentName || 'Student';

  const statusUpdates: Record<string, any> = {
    status,
    dateJoined:
      status === 'active' && !prevData?.dateJoined
        ? serverTimestamp()
        : prevData?.dateJoined || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Clear scheduled/completed removal metadata when restored/reactivated
  if (status === 'active') {
    statusUpdates.removedAt = null;
    statusUpdates.removedBy = null;
    statusUpdates.removalReason = null;
    statusUpdates.removalRequestedAt = null;
    statusUpdates.removalRequestedBy = null;
    statusUpdates.scheduledRemovalActivityIds = [];
    statusUpdates.scheduledRemovalActivityTitles = [];
  }

  await updateDoc(docRef, statusUpdates);

  if (orgId && prevStatus !== status) {
    const wasInClub = prevStatus ? isMemberCurrentlyInClub({ status: prevStatus }) : false;
    const isNowInClub = isMemberCurrentlyInClub({ status });

    if (wasInClub && !isNowInClub) {
      try {
        await updateDoc(doc(db, 'organizations', orgId), {
          memberCount: increment(-1),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Could not decrement organization memberCount:', err);
      }
    } else if (!wasInClub && isNowInClub) {
      try {
        await updateDoc(doc(db, 'organizations', orgId), {
          memberCount: increment(1),
          updatedAt: serverTimestamp(),
        });

        // Trigger membership fee payable if not already assigned
        await ensureMembershipPayable(
          orgId,
          studentId,
          studentName,
          prevData?.paymentStatus || 'outstanding',
          actionByUid || 'Officer Status Update'
        );
      } catch (err) {
        console.warn('Could not increment organization memberCount / payable:', err);
      }
    }
  }
};

/**
 * Approves a pending membership application.
 * 1. Sets status: 'active', dateJoined: now.
 * 2. Increments organization memberCount.
 * 3. Checks if the club already created a membership_due (or has configured membershipFee).
 *    If yes, automatically creates a 'membership_due' payable for this student in /payables!
 */
export const approveMemberApplication = async (
  memberDocId: string,
  approvedByUid?: string
): Promise<{ payableCreated: boolean; feeAmount?: number }> => {
  const memberRef = doc(db, COLLECTION, memberDocId);
  const memberSnap = await getDoc(memberRef);

  if (!memberSnap.exists()) {
    throw new Error('Membership record not found.');
  }

  const memberData = memberSnap.data();
  const orgId = memberData.organizationId;
  const studentId = memberData.studentId || memberDocId;
  const studentName = memberData.studentName || 'Student';

  // 1. Update member status
  await updateDoc(memberRef, {
    status: 'active',
    dateJoined: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 2. Increment organization member count
  if (orgId) {
    try {
      const orgRef = doc(db, 'organizations', orgId);
      await updateDoc(orgRef, {
        memberCount: increment(1),
        updatedAt: serverTimestamp(),
      });
    } catch (orgErr) {
      console.warn('Error updating org member count:', orgErr);
    }
  }

  // 3. Trigger Membership Due Payable if club already created dues or requires fee
  const res = await ensureMembershipPayable(
    orgId,
    studentId,
    studentName,
    'outstanding',
    approvedByUid || 'Officer Application Approval'
  );

  return res;
};

/**
 * Rejects a pending membership application.
 */
export const rejectMemberApplication = async (
  memberDocId: string,
  reason?: string
): Promise<void> => {
  const memberRef = doc(db, COLLECTION, memberDocId);
  await updateDoc(memberRef, {
    status: 'rejected',
    rejectionReason: reason || 'Application not accepted by organization officers.',
    updatedAt: serverTimestamp(),
  });
};

export const updatePaymentStatus = async (
  docId: string,
  paymentStatus: 'paid' | 'outstanding'
): Promise<void> => {
  const docRef = doc(db, COLLECTION, docId);
  await updateDoc(docRef, {
    paymentStatus,
    updatedAt: serverTimestamp(),
  });
};

export interface UpcomingMemberActivityRef {
  id: string;
  title: string;
  date: string;
}

export interface RemoveMemberResult {
  outcome: 'removed' | 'scheduled';
  activities: UpcomingMemberActivityRef[];
}

async function fetchClubActivitiesPool(organizationId: string): Promise<Array<Record<string, any>>> {
  if (!organizationId) return [];
  const mergedMap = new Map<string, Record<string, any>>();

  const fetchCollection = async (colName: string) => {
    try {
      const [byHost, byOrg] = await Promise.all([
        getDocs(query(collection(db, colName), where('hostingOrgId', '==', organizationId))).catch(() => null),
        getDocs(query(collection(db, colName), where('organizationId', '==', organizationId))).catch(() => null),
      ]);
      for (const snap of [byHost, byOrg]) {
        if (!snap) continue;
        snap.docs.forEach((d) => {
          const existing = mergedMap.get(d.id) || {};
          mergedMap.set(d.id, { ...existing, ...d.data(), id: d.id });
        });
      }
    } catch {}
  };

  await Promise.all([fetchCollection('activities'), fetchCollection('events')]);
  return Array.from(mergedMap.values()).filter((act) => isClubActivity(act, organizationId));
}

async function fetchClubSignupEvidence(
  organizationId: string,
  activityIds: string[]
): Promise<{
  payables: Array<Record<string, any>>;
  registrations: Array<Record<string, any>>;
  attendanceRecords: Array<Record<string, any>>;
}> {
  const payables: Array<Record<string, any>> = [];
  const registrations: Array<Record<string, any>> = [];
  const attendanceRecords: Array<Record<string, any>> = [];

  if (activityIds.length === 0) {
    return { payables, registrations, attendanceRecords };
  }

  // Batch queries by up to 10 eventIds (Firestore 'in' limit)
  const chunks: string[][] = [];
  for (let i = 0; i < activityIds.length; i += 10) {
    chunks.push(activityIds.slice(i, i + 10));
  }

  await Promise.all(
    chunks.map(async (chunk) => {
      const [paySnap, attSnap, regSnap1, regSnap2, regSnap3] = await Promise.all([
        getDocs(query(collection(db, 'payables'), where('eventId', 'in', chunk))).catch(() => null),
        getDocs(query(collection(db, 'attendance'), where('eventId', 'in', chunk))).catch(() => null),
        getDocs(query(collection(db, 'event_registrations'), where('eventId', 'in', chunk))).catch(() => null),
        getDocs(query(collection(db, 'registrations'), where('eventId', 'in', chunk))).catch(() => null),
        getDocs(query(collection(db, 'activity_registrations'), where('eventId', 'in', chunk))).catch(() => null),
      ]);

      paySnap?.docs.forEach((d) => payables.push({ id: d.id, ...d.data() }));
      attSnap?.docs.forEach((d) => attendanceRecords.push({ id: d.id, ...d.data() }));
      for (const rSnap of [regSnap1, regSnap2, regSnap3]) {
        rSnap?.docs.forEach((d) => registrations.push({ id: d.id, ...d.data() }));
      }
    })
  );

  // Also check org-level payables if eventId wasn't indexed yet
  try {
    const orgPaySnap = await getDocs(
      query(collection(db, 'payables'), where('organizationId', '==', organizationId))
    );
    const seenIds = new Set(payables.map((p) => p.id));
    orgPaySnap.docs.forEach((d) => {
      if (!seenIds.has(d.id)) {
        payables.push({ id: d.id, ...d.data() });
      }
    });
  } catch {}

  return { payables, registrations, attendanceRecords };
}

async function resolveStudentDocForMember(
  member: Partial<OrganizationMemberDocument> & Record<string, any>
): Promise<Record<string, any> | null> {
  try {
    if (member.studentId) {
      const snap = await getDocs(
        query(collection(db, 'students'), where('studentId', '==', member.studentId))
      );
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    }
    if (member.email) {
      const snap = await getDocs(
        query(collection(db, 'students'), where('email', '==', member.email))
      );
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data() };
      }
    }
  } catch {}
  return null;
}

/**
 * Finds all non-ended, non-cancelled club activities that a member is already signed up for.
 */
export async function getMemberUpcomingActivitySignups(
  organizationId: string,
  member: Partial<OrganizationMemberDocument> & Record<string, any>
): Promise<UpcomingMemberActivityRef[]> {
  if (!organizationId || !member) return [];

  const [clubActivities, studentDoc] = await Promise.all([
    fetchClubActivitiesPool(organizationId),
    resolveStudentDocForMember(member),
  ]);

  const upcomingActivities = clubActivities.filter((act) => !isActivityEndedOrCancelled(act));
  if (upcomingActivities.length === 0) return [];

  const { idSet } = normalizeMemberIdentifiers(member, studentDoc);
  const evidence = await fetchClubSignupEvidence(
    organizationId,
    upcomingActivities.map((a) => a.id)
  );

  return upcomingActivities
    .filter((act) => isStudentSignedUpForActivity(act, idSet, evidence))
    .map((act) => ({
      id: act.id,
      title: String(act.title || act.name || 'Club Activity'),
      date: String(act.date || act.startDate || act.sessions?.[0]?.date || ''),
    }));
}

async function finalizeSingleMemberRemoval(
  docId: string,
  organizationId: string,
  prevData: Partial<OrganizationMemberDocument> | null,
  removedBy?: string,
  reason?: string
): Promise<void> {
  const docRef = doc(db, COLLECTION, docId);
  await updateDoc(docRef, {
    status: 'removed',
    isOfficer: false,
    removedAt: serverTimestamp(),
    removedBy: removedBy || prevData?.removalRequestedBy || 'Officer',
    removalReason: reason || prevData?.removalReason || 'Removed from club',
    scheduledRemovalActivityIds: [],
    scheduledRemovalActivityTitles: [],
    updatedAt: serverTimestamp(),
  });

  if (organizationId && prevData && isMemberCurrentlyInClub(prevData)) {
    try {
      await updateDoc(doc(db, 'organizations', organizationId), {
        memberCount: increment(-1),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('[finalizeSingleMemberRemoval] Could not decrement organization memberCount:', err);
    }
  }

  // Deactivate any active officer role in this organization while preserving record history
  const studentId = prevData?.studentId;
  if (organizationId && studentId) {
    try {
      const officerSnap = await getDocs(
        query(
          collection(db, 'organization_officers'),
          where('organizationId', '==', organizationId),
          where('studentId', '==', studentId),
          where('isActive', '==', true)
        )
      );
      if (!officerSnap.empty) {
        const batch = writeBatch(db);
        officerSnap.docs.forEach((oDoc) => {
          batch.update(oDoc.ref, {
            isActive: false,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    } catch (offErr) {
      console.warn('[finalizeSingleMemberRemoval] Could not deactivate officer assignment:', offErr);
    }
  }
}

/**
 * Removes a member from the club while preserving their member record and keeping
 * all existing dues and fines intact.
 * - If the member is already signed up to an upcoming activity of the club, keeps them
 *   in the club until that activity ends (`status: 'pending_removal'`), blocking them
 *   from newly created activities in the meantime.
 * - Otherwise completes removal immediately (`status: 'removed'`).
 */
export const removeMemberFromClub = async (
  docId: string,
  organizationId: string,
  removedBy?: string,
  reason?: string
): Promise<RemoveMemberResult> => {
  const docRef = doc(db, COLLECTION, docId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Member record not found.');
  }

  const memberData = { id: snap.id, ...snap.data() } as OrganizationMemberDocument;
  const resolvedOrgId = organizationId || memberData.organizationId;

  if (memberData.status === 'removed') {
    return { outcome: 'removed', activities: [] };
  }

  const upcomingActivities = await getMemberUpcomingActivitySignups(resolvedOrgId, memberData);

  if (upcomingActivities.length > 0) {
    await updateDoc(docRef, {
      status: 'pending_removal',
      removalRequestedAt: serverTimestamp(),
      removalRequestedBy: removedBy || 'Officer',
      removalReason:
        reason ||
        `Scheduled removal after upcoming activity: ${upcomingActivities.map((a) => a.title).join(', ')}`,
      scheduledRemovalActivityIds: upcomingActivities.map((a) => a.id),
      scheduledRemovalActivityTitles: upcomingActivities.map((a) => a.title),
      updatedAt: serverTimestamp(),
    });

    return {
      outcome: 'scheduled',
      activities: upcomingActivities,
    };
  }

  await finalizeSingleMemberRemoval(docId, resolvedOrgId, memberData, removedBy, reason);
  return {
    outcome: 'removed',
    activities: [],
  };
};

/**
 * Cancels a scheduled removal before it takes effect, restoring full 'active' membership.
 */
export const cancelScheduledMemberRemoval = async (docId: string): Promise<void> => {
  const docRef = doc(db, COLLECTION, docId);
  const snap = await getDoc(docRef);
  if (!snap.exists()) {
    throw new Error('Member record not found.');
  }
  const data = snap.data() as Partial<OrganizationMemberDocument>;
  if (data.status !== 'pending_removal') {
    await updateMemberStatus(docId, 'active');
    return;
  }

  await updateDoc(docRef, {
    status: 'active',
    removalRequestedAt: null,
    removalRequestedBy: null,
    removalReason: null,
    scheduledRemovalActivityIds: [],
    scheduledRemovalActivityTitles: [],
    updatedAt: serverTimestamp(),
  });
};

/**
 * Reconciles any 'pending_removal' members for an organization:
 * Once all scheduled/signed-up upcoming activities have ended (completed, cancelled, or past end time),
 * automatically completes their removal ('status: "removed"').
 */
export async function reconcilePendingMemberRemovalsForOrg(
  organizationId: string
): Promise<number> {
  if (!organizationId) return 0;

  try {
    const qPending = query(
      collection(db, COLLECTION),
      where('organizationId', '==', organizationId),
      where('status', '==', 'pending_removal')
    );
    const pendingSnap = await getDocs(qPending);
    if (pendingSnap.empty) return 0;

    const clubActivities = await fetchClubActivitiesPool(organizationId);
    const activityMap = new Map<string, Record<string, any>>();
    clubActivities.forEach((act) => activityMap.set(act.id, act));

    const nonEndedActivities = clubActivities.filter((act) => !isActivityEndedOrCancelled(act));
    const evidence = await fetchClubSignupEvidence(
      organizationId,
      nonEndedActivities.map((a) => a.id)
    );

    let finalizedCount = 0;

    for (const mDoc of pendingSnap.docs) {
      const mData = { id: mDoc.id, ...mDoc.data() } as OrganizationMemberDocument;
      const scheduledIds: string[] = Array.isArray(mData.scheduledRemovalActivityIds)
        ? mData.scheduledRemovalActivityIds
        : [];

      let stillWaitingActivities: UpcomingMemberActivityRef[] = [];

      if (scheduledIds.length > 0) {
        stillWaitingActivities = scheduledIds
          .map((actId) => activityMap.get(actId))
          .filter((act): act is Record<string, any> => Boolean(act && !isActivityEndedOrCancelled(act)))
          .map((act) => ({
            id: act.id,
            title: String(act.title || act.name || 'Club Activity'),
            date: String(act.date || act.startDate || act.sessions?.[0]?.date || ''),
          }));
      } else {
        const studentDoc = await resolveStudentDocForMember(mData);
        const { idSet } = normalizeMemberIdentifiers(mData, studentDoc);
        stillWaitingActivities = nonEndedActivities
          .filter((act) => isStudentSignedUpForActivity(act, idSet, evidence))
          .map((act) => ({
            id: act.id,
            title: String(act.title || act.name || 'Club Activity'),
            date: String(act.date || act.startDate || act.sessions?.[0]?.date || ''),
          }));
      }

      if (stillWaitingActivities.length === 0) {
        await finalizeSingleMemberRemoval(mDoc.id, organizationId, mData);
        finalizedCount += 1;
      } else if (
        scheduledIds.length > 0 &&
        stillWaitingActivities.length !== scheduledIds.length
      ) {
        await updateDoc(mDoc.ref, {
          scheduledRemovalActivityIds: stillWaitingActivities.map((a) => a.id),
          scheduledRemovalActivityTitles: stillWaitingActivities.map((a) => a.title),
          updatedAt: serverTimestamp(),
        });
      }
    }

    return finalizedCount;
  } catch (err) {
    console.warn('[reconcilePendingMemberRemovalsForOrg] Non-fatal reconciliation notice:', err);
    return 0;
  }
}

/**
 * Returns student identifiers for all club members who are removed or scheduled for removal,
 * used so newly created club activities permanently exclude them.
 */
export async function getExcludedMemberIdentifiersForOrg(
  organizationId: string
): Promise<string[]> {
  if (!organizationId) return [];
  try {
    const snap = await getDocs(
      query(
        collection(db, COLLECTION),
        where('organizationId', '==', organizationId),
        where('status', 'in', ['pending_removal', 'removed'])
      )
    );
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Partial<OrganizationMemberDocument>));
    return extractExcludedMemberIdentifiers(docs);
  } catch (err) {
    console.warn('[getExcludedMemberIdentifiersForOrg] Non-fatal lookup warning:', err);
    return [];
  }
}

export const removeMember = async (docId: string): Promise<void> => {
  const snap = await getDoc(doc(db, COLLECTION, docId));
  const orgId = snap.exists() ? String(snap.data()?.organizationId || '') : '';
  await removeMemberFromClub(docId, orgId);
};

export const deleteMember = async (docId: string, organizationId: string): Promise<void> => {
  await removeMemberFromClub(docId, organizationId);
};

export const appointAsOfficer = async (
  organizationId: string,
  memberDocId: string,
  roleId: string,
  studentId: string,
  studentName: string,
  email: string,
  tempPassword?: string,
  roleName?: string,
  studentDetails?: {
    course?: string;
    year?: string;
    department?: string;
    contactNumber?: string;
    hasWebPortalAccess?: boolean;
  },
  actor?: {
    isAdviser?: boolean;
  }
): Promise<void> => {
  if (actor && actor.isAdviser === false) {
    throw new Error('Only appointed Club Advisers are authorized to appoint officers or grant Web Portal access.');
  }
  const wantWebAccess = Boolean(studentDetails?.hasWebPortalAccess);

  // Enforce officer appointment & Web Portal access exclusivity across organizations
  const existingActiveOfficersSnap = await getDocs(
    query(
      collection(db, 'organization_officers'),
      where('studentId', '==', studentId),
      where('isActive', '==', true)
    )
  );
  const existingOtherOrgOfficers = existingActiveOfficersSnap.docs
    .map((d) => d.data())
    .filter((o) => o.organizationId !== organizationId);

  if (existingActiveOfficersSnap.docs.some((d) => d.data().organizationId === organizationId)) {
    throw new Error('This student is already an active officer in this organization.');
  }
  if (existingOtherOrgOfficers.some((o) => o.hasWebPortalAccess !== false)) {
    throw new Error(
      'This student already has Web Portal access as an officer in another organization and cannot be appointed to another organization.'
    );
  }
  if (wantWebAccess && existingOtherOrgOfficers.length > 0) {
    throw new Error(
      'This student already holds an officer role in another organization and cannot be granted exclusive Web Portal access here.'
    );
  }

  const batch = writeBatch(db);
  
  // 1. Enforce that the student is already a registered active member of this organization
  let targetMemberRef = null;
  if (memberDocId && memberDocId.trim()) {
    const memberRef = doc(db, COLLECTION, memberDocId);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists() || (memberSnap.data()?.status && memberSnap.data()?.status !== 'active')) {
      throw new Error('Student must be an active member of this organization before being appointed as an officer.');
    }
    targetMemberRef = memberRef;
  } else {
    // Check if member already exists by studentId
    const qExisting = query(
      collection(db, COLLECTION),
      where('organizationId', '==', organizationId),
      where('studentId', '==', studentId)
    );
    const existingSnap = await getDocs(qExisting);
    if (existingSnap.empty) {
      throw new Error('Student must be an active member of this organization before being appointed as an officer.');
    }
    const memberData = existingSnap.docs[0].data();
    if (memberData?.status && memberData.status !== 'active') {
      throw new Error('Only active members can be appointed as officers.');
    }
    targetMemberRef = existingSnap.docs[0].ref;
  }

  batch.update(targetMemberRef, {
    isOfficer: true,
    updatedAt: serverTimestamp(),
  });
  
  // 2. Create the officer doc in organization_officers
  const officersCollectionRef = collection(db, 'organization_officers');
  const officerDocRef = doc(officersCollectionRef);
  const studentProfiles = await getDocs(query(collection(db, 'students'), where('studentId', '==', studentId)));
  if (studentProfiles.size > 1) throw new Error('Several student profiles have this ID. Resolve the duplicate before appointing an officer.');
  const student = studentProfiles.docs[0]?.data();
  
  batch.set(officerDocRef, {
    id: officerDocRef.id,
    organizationId,
    roleId,
    roleName: roleName || '',
    studentId,
    studentName: formatPersonName(student, studentName),
    email: email || '',
    authUid: student?.authUid || null,
    tempPass: student?.tempPass || null,
    requiresPasswordChange: Boolean(student?.tempPass || student?.requiresPasswordChange || student?.requiresChangePassword),
    resetInProgress: student?.resetInProgress === true,
    temporaryPassword: student?.tempPass || null,
    useStudentCredentials: true,
    hasWebPortalAccess: wantWebAccess,
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // 3. If role is President, keep organization doc presidentName in sync
  if (roleName && roleName.trim().toLowerCase() === 'president') {
    const orgRef = doc(db, 'organizations', organizationId);
    batch.update(orgRef, {
      presidentName: studentName,
      updatedAt: serverTimestamp(),
    });
  }
  
  const commitPromise = batch.commit();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Firestore batch write timed out.")), 15000);
  });
  
  try {
    await Promise.race([commitPromise, timeoutPromise]);
  } catch (error: any) {
    console.error("Appoint officer failed:", error);
    throw new Error(`Appoint officer failed: ${error.message}`);
  }
};

export const revokeOfficer = async (
  organizationId: string,
  officerDocId: string,
  studentId: string,
  actor?: {
    isAdviser?: boolean;
  }
): Promise<void> => {
  if (actor && actor.isAdviser === false) {
    throw new Error('Only appointed Club Advisers are authorized to revoke officer access or appointments.');
  }
  const batch = writeBatch(db);
  const officerRef = doc(db, 'organization_officers', officerDocId);
  batch.update(officerRef, {
    isActive: false,
    hasWebPortalAccess: false,
    updatedAt: serverTimestamp(),
  });

  // Update member doc if found to unset isOfficer
  if (studentId) {
    const qMember = query(
      collection(db, COLLECTION),
      where('organizationId', '==', organizationId),
      where('studentId', '==', studentId)
    );
    const memberSnap = await getDocs(qMember);
    if (!memberSnap.empty) {
      batch.update(memberSnap.docs[0].ref, {
        isOfficer: false,
        updatedAt: serverTimestamp(),
      });
    }
  }

  const commitPromise = batch.commit();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Firestore batch write timed out.")), 15000);
  });

  try {
    await Promise.race([commitPromise, timeoutPromise]);
  } catch (error: any) {
    console.error("Revoke officer failed:", error);
    throw new Error(`Revoke officer failed: ${error.message}`);
  }
};

/**
 * Grants or revokes Organization Web Portal login access for an active officer.
 * Restricted strictly to the appointed Club Adviser.
 */
export const updateOfficerWebPortalAccess = async (
  organizationId: string,
  officerDocId: string,
  grantAccess: boolean,
  actor?: {
    isAdviser?: boolean;
  }
): Promise<void> => {
  if (!actor || actor.isAdviser !== true) {
    throw new Error('Only appointed Club Advisers are authorized to add or revoke Web Portal access.');
  }

  const officerRef = doc(db, 'organization_officers', officerDocId);
  const officerSnap = await getDoc(officerRef);
  if (!officerSnap.exists()) {
    throw new Error('Officer record not found.');
  }
  const officerData = officerSnap.data();
  if (officerData.organizationId !== organizationId) {
    throw new Error('Officer does not belong to this organization.');
  }
  if (officerData.isActive === false) {
    throw new Error('Cannot modify Web Portal access for a revoked officer.');
  }

  if (grantAccess && officerData.studentId) {
    const existingActiveOfficersSnap = await getDocs(
      query(
        collection(db, 'organization_officers'),
        where('studentId', '==', officerData.studentId),
        where('isActive', '==', true)
      )
    );
    const hasOtherOrgAssignment = existingActiveOfficersSnap.docs.some(
      (d) => d.id !== officerDocId && d.data().organizationId !== organizationId
    );
    if (hasOtherOrgAssignment) {
      throw new Error(
        'This student already holds an active officer role in another organization and cannot be granted exclusive Web Portal access here.'
      );
    }
  }

  await updateDoc(officerRef, {
    hasWebPortalAccess: grantAccess,
    updatedAt: serverTimestamp(),
  });
};
