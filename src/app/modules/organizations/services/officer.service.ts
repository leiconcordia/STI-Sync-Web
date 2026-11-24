import { collection, doc, writeBatch, increment, serverTimestamp, query, where, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { formatPersonName } from '../../../utils/name.utils';
import { createNotification } from '../../notifications/services/notification.service';

export interface OfficerAssignmentData {
  roleId: string;
  roleName?: string;
  studentId: string;
  studentName: string;
  email: string;
  course?: string;
  year?: string;
  department?: string;
  contactNumber?: string;
  password?: string;
  hasWebPortalAccess?: boolean;
}

export const batchCreateOfficers = async (
  organizationId: string,
  officers: OfficerAssignmentData[],
  actor?: { uid?: string; name?: string; email?: string; organizationName?: string }
) => {
  if (!officers || officers.length === 0) return;

  const orgSnap = await getDoc(doc(db, 'organizations', organizationId)).catch(() => null);
  const orgName =
    actor?.organizationName?.trim() ||
    (orgSnap?.exists() ? (orgSnap.data()?.name || 'Student Organization') : 'Student Organization');

  const batch = writeBatch(db);
  const officersCollectionRef = collection(db, 'organization_officers');
  const membersCollectionRef = collection(db, 'organization_members');
  const webAccessGrantedInBatch = new Set<string>();
  const pendingNotifications: Array<Parameters<typeof createNotification>[0]> = [];

  for (const officer of officers) {
    const profiles = await getDocs(query(collection(db, 'students'), where('studentId', '==', officer.studentId)));
    if (profiles.size > 1) throw new Error('Resolve duplicate student profiles before appointing an officer.');
    const student = profiles.docs[0]?.data();
    const wantWebAccess = officer.hasWebPortalAccess !== false;
    const studentKey = (officer.studentId || '').trim().toLowerCase();

    // Enforce once-per-student Web Portal access across all organizations
    const existingActiveSnap = await getDocs(
      query(
        collection(db, 'organization_officers'),
        where('studentId', '==', officer.studentId),
        where('isActive', '==', true)
      )
    );
    const activeOtherOrgs = existingActiveSnap.docs
      .map((d) => d.data())
      .filter((o) => o.appointmentStatus !== 'declined' && o.organizationId !== organizationId);

    if (wantWebAccess) {
      const hasWebElsewhere =
        webAccessGrantedInBatch.has(studentKey) ||
        activeOtherOrgs.some((o) => o.hasWebPortalAccess !== false);
      if (hasWebElsewhere) {
        throw new Error(
          `${formatPersonName(student, officer.studentName)} already has Web Portal access in another organization. A student can be an officer in multiple organizations, but Web Portal access can only be granted once.`
        );
      }
      if (studentKey) webAccessGrantedInBatch.add(studentKey);
    }

    // 1. Create Member document first (isOfficer stays false until student accepts appointment)
    const memberDocRef = doc(membersCollectionRef);
    const cleanStudentName = formatPersonName(student, officer.studentName);
    const cleanEmail = (officer.email || student?.email || '').trim().toLowerCase();
    const resolvedRoleName = officer.roleName || officer.roleId || 'Officer';

    batch.set(memberDocRef, {
      id: memberDocRef.id,
      organizationId,
      studentId: officer.studentId,
      studentName: cleanStudentName,
      email: cleanEmail,
      course: officer.course || 'N/A',
      year: officer.year || 'N/A',
      department: officer.department || 'N/A',
      contactNumber: officer.contactNumber || '',
      status: 'active',
      paymentStatus: 'paid',
      isOfficer: false,
      dateJoined: serverTimestamp(),
      applicationDate: serverTimestamp(),
      addedBy: 'Organization Creation',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 2. Create Officer document requiring student acceptance on Mobile
    const officerDocRef = doc(officersCollectionRef);
    batch.set(officerDocRef, {
      id: officerDocRef.id,
      organizationId,
      organizationName: orgName,
      memberDocId: memberDocRef.id,
      roleId: officer.roleId,
      roleName: resolvedRoleName,
      studentId: officer.studentId,
      studentName: cleanStudentName,
      email: cleanEmail,
      authUid: student?.authUid || null,
      tempPass: student?.tempPass || null,
      requiresPasswordChange: Boolean(student?.tempPass || student?.requiresPasswordChange || student?.requiresChangePassword),
      resetInProgress: student?.resetInProgress === true,
      hasWebPortalAccess: wantWebAccess,
      isActive: true,
      appointmentStatus: 'pending_acceptance',
      appointedByUid: actor?.uid || null,
      appointedByName: actor?.name || 'SAS Administrator',
      appointedByEmail: actor?.email ? actor.email.trim().toLowerCase() : null,
      appointedAt: serverTimestamp(),
      acceptedAt: null,
      declinedAt: null,
      declineReason: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    pendingNotifications.push({
      recipientRole: 'student',
      recipientId: [officer.studentId, student?.authUid, cleanEmail].filter(Boolean).join('|'),
      recipientTokens: [officer.studentId, student?.authUid, cleanEmail]
        .filter(Boolean)
        .map((t) => String(t).trim().toLowerCase()),
      targetOrgId: organizationId,
      targetOrgName: orgName,
      type: 'officer_appointment',
      category: 'system',
      title: 'Officer Appointment Offer',
      message: `You have been appointed as ${resolvedRoleName} of ${orgName}${wantWebAccess ? ' (with Web Portal access)' : ''}. Open to confirm or decline your appointment.`,
      resourceId: officerDocRef.id,
      resourceType: 'officer_appointment',
      actionRoute: '/dashboard',
      isUrgent: true,
      metadata: {
        officerDocId: officerDocRef.id,
        organizationId,
        organizationName: orgName,
        roleId: officer.roleId,
        roleName: resolvedRoleName,
        hasWebPortalAccess: wantWebAccess,
        appointedByUid: actor?.uid || null,
        appointedByName: actor?.name || 'SAS Administrator',
        appointedByEmail: actor?.email ? actor.email.trim().toLowerCase() : null,
      },
      senderId: actor?.uid || undefined,
      senderName: actor?.name || 'SAS Administrator',
      senderRoleTitle: 'SAS Administrator',
    });
  }

  // 3. Atomically update organization memberCount
  const orgDocRef = doc(db, 'organizations', organizationId);
  batch.update(orgDocRef, {
    memberCount: increment(officers.length),
    updatedAt: serverTimestamp(),
  });
  
  // Implement a timeout to prevent infinite hanging
  const commitPromise = batch.commit();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Firestore batch write timed out. Check your network or Firestore security rules.")), 15000);
  });
  
  try {
    await Promise.race([commitPromise, timeoutPromise]);
    for (const notif of pendingNotifications) {
      void createNotification(notif).catch((err) =>
        console.warn('Failed to dispatch mobile officer appointment notification:', err)
      );
    }
  } catch (error: any) {
    console.error("Batch officer creation failed:", error);
    throw new Error(`Batch officer creation failed: ${error.message}`);
  }
};
