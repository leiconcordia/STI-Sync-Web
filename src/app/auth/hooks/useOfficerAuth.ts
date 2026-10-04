import { useState } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../../../services/firebase';
import { hashPassword } from '../services/password.service';

export const SESSION_KEY = 'sti_sync_officer_session';
export const SIGNATORY_SESSION_KEY = 'sti_sync_signatory_session';

export interface LoginResult {
  success: boolean;
  redirectPath: string;
}

export function useOfficerAuth() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (identifier: string, password: string): Promise<LoginResult | null> => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const trimmedId = identifier.trim();
      const trimmedPass = password.trim();

      if (!trimmedId || !trimmedPass) {
        setError('Please enter both student/employee ID or email and password.');
        return null;
      }

      const cleanId = trimmedId.toLowerCase();

      // ── 1. Query Matching Records Across All Role Types ──
      // A user might be an Institutional Signatory, an Officer, or an Adviser concurrently.
      const signatoryRecords: any[] = [];
      const officerRecords: any[] = [];
      const adviserRecords: any[] = [];

      // A. Check Institutional Signatories
      try {
        let qSig = query(
          collection(db, 'institutional_signatories'),
          where('email', '==', cleanId)
        );
        let sigSnap = await getDocs(qSig);

        if (sigSnap.empty && trimmedId !== cleanId) {
          qSig = query(
            collection(db, 'institutional_signatories'),
            where('email', '==', trimmedId)
          );
          sigSnap = await getDocs(qSig);
        }

        if (sigSnap.empty) {
          qSig = query(
            collection(db, 'institutional_signatories'),
            where('employeeId', '==', trimmedId)
          );
          sigSnap = await getDocs(qSig);
        }

        sigSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.isActive !== false) {
            signatoryRecords.push({ id: d.id, ...data });
          }
        });
      } catch (sigErr) {
        console.warn('[useOfficerAuth] Signatory lookup error:', sigErr);
      }

      // B. Check Organization Officers
      try {
        let qOff = query(
          collection(db, 'organization_officers'),
          where('email', '==', cleanId)
        );
        let offSnap = await getDocs(qOff);

        if (offSnap.empty && trimmedId !== cleanId) {
          qOff = query(
            collection(db, 'organization_officers'),
            where('email', '==', trimmedId)
          );
          offSnap = await getDocs(qOff);
        }

        if (offSnap.empty) {
          qOff = query(
            collection(db, 'organization_officers'),
            where('studentId', '==', trimmedId)
          );
          offSnap = await getDocs(qOff);
        }

        offSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.isActive !== false) {
            officerRecords.push({ id: d.id, ...data });
          }
        });
      } catch (offErr) {
        console.warn('[useOfficerAuth] Officer lookup error:', offErr);
      }

      // C. Check Organization Advisers
      try {
        let qAdv = query(
          collection(db, 'organization_advisers'),
          where('email', '==', cleanId)
        );
        let advSnap = await getDocs(qAdv);

        if (advSnap.empty && trimmedId !== cleanId) {
          qAdv = query(
            collection(db, 'organization_advisers'),
            where('email', '==', trimmedId)
          );
          advSnap = await getDocs(qAdv);
        }

        if (advSnap.empty) {
          qAdv = query(
            collection(db, 'organization_advisers'),
            where('employeeId', '==', trimmedId)
          );
          advSnap = await getDocs(qAdv);
        }

        advSnap.docs.forEach((d) => {
          const data = d.data();
          if (data.isActive !== false) {
            adviserRecords.push({ id: d.id, ...data });
          }
        });

        // Also check embedded adviser in organizations
        if (adviserRecords.length === 0) {
          const qOrg = query(
            collection(db, 'organizations'),
            where('adviser.email', '==', cleanId)
          );
          const orgSnap = await getDocs(qOrg);
          orgSnap.docs.forEach((d) => {
            const orgData = d.data();
            if (orgData.adviser) {
              adviserRecords.push({
                ...orgData.adviser,
                organizationId: d.id,
                organizationName: orgData.name,
              });
            }
          });
        }
      } catch (advErr) {
        console.warn('[useOfficerAuth] Adviser lookup error:', advErr);
      }

      // D. Fallback check in students collection
      if (officerRecords.length === 0 && signatoryRecords.length === 0 && adviserRecords.length === 0) {
        try {
          let qStudent = query(
            collection(db, 'students'),
            where('studentId', '==', trimmedId)
          );
          let studentSnap = await getDocs(qStudent);
          if (studentSnap.empty) {
            qStudent = query(
              collection(db, 'students'),
              where('email', '==', cleanId)
            );
            studentSnap = await getDocs(qStudent);
          }

          if (!studentSnap.empty) {
            const studentData = studentSnap.docs[0].data();
            const qOff = query(
              collection(db, 'organization_officers'),
              where('studentId', '==', studentData.studentId),
              where('isActive', '==', true)
            );
            const offSnap = await getDocs(qOff);
            offSnap.docs.forEach((d) => {
              officerRecords.push({
                ...d.data(),
                id: d.id,
                email: studentData.email || d.data().email,
              });
            });
          }
        } catch (studErr) {
          console.warn('[useOfficerAuth] Student lookup error:', studErr);
        }
      }

      // E. Resolve Student Document for Officer Identity
      let studentDocData: any = null;
      const targetStudentId = officerRecords[0]?.studentId || (RegExp(/^\d{8,15}$/).test(trimmedId) ? trimmedId : null);
      if (targetStudentId) {
        try {
          const qStud = query(collection(db, 'students'), where('studentId', '==', targetStudentId));
          const studSnap = await getDocs(qStud);
          if (!studSnap.empty) {
            studentDocData = studSnap.docs[0].data();
          }
        } catch (sErr) {
          console.warn('[useOfficerAuth] Student fetch warning:', sErr);
        }
      }

      const allRecords = [...signatoryRecords, ...officerRecords, ...adviserRecords];

      if (allRecords.length === 0) {
        // Check if user is an enrolled student without an active officer role
        try {
          const qCheckStudent = query(
            collection(db, 'students'),
            where('studentId', '==', trimmedId)
          );
          const checkStudentSnap = await getDocs(qCheckStudent);
          if (!checkStudentSnap.empty) {
            setError(
              'You are officially enrolled as a student, but you do not hold an active appointed officer role in any registered organization.'
            );
            return null;
          }
        } catch (_) {}

        setError(
          'No active organization officer, adviser, or institutional staff account found with these credentials.'
        );
        return null;
      }

      // Determine target email for Firebase Auth
      const targetEmail = (
        studentDocData?.email ||
        allRecords[0]?.email ||
        (cleanId.includes('@') ? cleanId : '')
      ).trim().toLowerCase();


      // ── 2. Authenticate: Firebase Auth vs. Student Default Password vs. Permanent/Temporary Password ──
      let authenticated = false;
      let matchedRecord: any = null;
      let isSignatoryUser = false;
      let isAdviserUser = false;

      // Strategy A: First try authenticating against Firebase Auth (used when user has set their permanent password)
      if (targetEmail) {
        try {
          await signInWithEmailAndPassword(auth, targetEmail, trimmedPass);
          authenticated = true;
          // When Firebase Auth succeeds, select their primary role (signatory takes precedence if available)
          if (signatoryRecords.length > 0) {
            matchedRecord = signatoryRecords[0];
            isSignatoryUser = true;
          } else if (officerRecords.length > 0) {
            matchedRecord = officerRecords[0];
            isSignatoryUser = false;
          } else {
            matchedRecord = adviserRecords[0];
            isAdviserUser = true;
          }
        } catch (authErr: any) {
          // Firebase Auth failed with the entered password.
          // This happens when the user is logging in with a default student password or temporary credentials.
        }
      }

      // Strategy B: Student Default Password Check (for newly appointed officers or before mobile profile completion)
      if (!authenticated && studentDocData && officerRecords.length > 0) {
        const lastName = (studentDocData.lastName || '').trim();
        const sId = (studentDocData.studentId || '').trim();
        const formulaPass = lastName && sId.length >= 6
          ? `${lastName[0].toUpperCase()}${lastName.slice(1).toLowerCase()}${sId.slice(-6)}`
          : '';

        const isDefaultValid =
          (studentDocData.defaultPassword && studentDocData.defaultPassword === trimmedPass) ||
          (formulaPass && formulaPass === trimmedPass);

        if (isDefaultValid) {
          authenticated = true;
          matchedRecord = officerRecords[0];
          isSignatoryUser = false;
        }
      }

      // Strategy C: Check Permanent Custom / Hashed Password in Firestore (for advisers / signatories)
      if (!authenticated) {
        const hashedInput = await hashPassword(trimmedPass);
        const matchingPermanentRecord = allRecords.find((rec) => {
          if (rec.requiresPasswordChange === true) return false;
          return (
            (rec.passwordHash && rec.passwordHash === hashedInput) ||
            (rec.customPassword && rec.customPassword === trimmedPass)
          );
        });

        if (matchingPermanentRecord) {
          authenticated = true;
          matchedRecord = matchingPermanentRecord;
          if (signatoryRecords.some((s) => s.id === matchingPermanentRecord.id)) {
            isSignatoryUser = true;
          } else if (adviserRecords.some((a) => a.email === matchingPermanentRecord.email)) {
            isAdviserUser = true;
          } else {
            isSignatoryUser = false;
          }
        }
      }

      // Strategy D: Temporary Password ONLY for first-time login or after Admin Reset (signatories / advisers)
      if (!authenticated) {
        const matchingTempRecord = allRecords.find(
          (rec) =>
            rec.requiresPasswordChange === true &&
            rec.temporaryPassword &&
            rec.temporaryPassword === trimmedPass
        );

        if (matchingTempRecord) {
          authenticated = true;
          matchedRecord = matchingTempRecord;

          if (signatoryRecords.some((s) => s.id === matchingTempRecord.id)) {
            isSignatoryUser = true;
          } else if (adviserRecords.some((a) => a.email === matchingTempRecord.email)) {
            isAdviserUser = true;
          } else {
            isSignatoryUser = false;
          }
        }
      }

      if (!authenticated || !matchedRecord) {
        setError('Incorrect password. Please enter your valid student password or account credentials.');
        return null;
      }

      // ── 3. Verify Organization Status (For Officers) ──
      if (matchedRecord.organizationId && !isSignatoryUser) {
        try {
          const orgSnap = await getDoc(doc(db, 'organizations', matchedRecord.organizationId));
          if (orgSnap.exists()) {
            const orgData = orgSnap.data();
            const orgStatus = orgData.status || 'active';
            if (['suspended', 'inactive', 'archived'].includes(orgStatus)) {
              // If user also has an institutional signatory role, fall back to signatory instead of blocking!
              if (signatoryRecords.length > 0) {
                matchedRecord = signatoryRecords[0];
                isSignatoryUser = true;
              } else {
                setError(
                  `Your organization (${orgData.name || 'Organization'}) is currently ${orgStatus}. Access is restricted by SAO Administration.`
                );
                return null;
              }
            }
          }
        } catch (orgCheckErr) {
          console.warn('[useOfficerAuth] Org status check failed:', orgCheckErr);
        }
      }

      // ── 4. Create Session & Route Based on Role ──
      let redirectPath = '/officer/dashboard';

      if (isSignatoryUser) {
        redirectPath = '/signatory/endorsements';
        const signatorySession = {
          uid: matchedRecord.uid || matchedRecord.id,
          id: matchedRecord.id,
          name: matchedRecord.name,
          email: matchedRecord.email,
          role: matchedRecord.role,
          roleTitle: matchedRecord.roleTitle,
          actionType: matchedRecord.actionType || (matchedRecord.role === 'school_president' ? 'approve' : 'endorse'),
          department: matchedRecord.department,
          employeeId: matchedRecord.employeeId || '',
          signatureUrl: matchedRecord.signatureUrl || null,
          isSignatory: true,
          requiresPasswordChange: matchedRecord.requiresPasswordChange ?? false,
          availableWorkspaces: {
            hasSignatory: true,
            hasOfficer: officerRecords.length > 0,
            hasAdviser: adviserRecords.length > 0,
          },
        };

        localStorage.setItem(SIGNATORY_SESSION_KEY, JSON.stringify(signatorySession));
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            ...signatorySession,
            studentName: matchedRecord.name,
            activeRoleId: matchedRecord.role,
          })
        );
      } else {
        const session = {
          studentId: matchedRecord.studentId || matchedRecord.employeeId || matchedRecord.email,
          studentName: matchedRecord.studentName || matchedRecord.name || (studentDocData ? `${studentDocData.firstName} ${studentDocData.lastName}` : 'Club Officer'),
          email: matchedRecord.email || studentDocData?.email || '',
          activeOrganizationId: matchedRecord.organizationId,
          activeRoleId: isAdviserUser ? 'adviser' : matchedRecord.roleId,
          isAdviser: isAdviserUser,
          isSignatory: false,
          requiresPasswordChange: studentDocData?.requiresPasswordChange ?? (matchedRecord.requiresPasswordChange ?? false),
          availableWorkspaces: {
            hasSignatory: signatoryRecords.length > 0,
            hasOfficer: true,
            hasAdviser: isAdviserUser,
          },
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }

      return { success: true, redirectPath };
    } catch (e: any) {
      console.error('Login failed:', e);
      if (e?.code === 'permission-denied') {
        setError(
          'Database Permission Error: Please ensure Firestore rules allow reading organization_officers and institutional_signatories.'
        );
      } else {
        setError('An unexpected error occurred during login. Please try again.');
      }
      return null;
    } finally {
      setIsLoggingIn(false);
    }
  };

  return { login, isLoggingIn, error };
}
