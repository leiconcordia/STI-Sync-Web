import { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { db, auth } from '../../../services/firebase';
import { loadPortalWorkspaces, activatePortalWorkspace } from '../services/portal-workspace.service';

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
      const trimmedPass = password;

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

      // Strategy A: First try authenticating against Firebase Auth (used when user has set their permanent password)
      if (targetEmail) {
        try {
          await signInWithEmailAndPassword(auth, targetEmail, trimmedPass);
          authenticated = true;
          // When Firebase Auth succeeds, select their primary role (signatory takes precedence if available)
          if (signatoryRecords.length > 0) {
            matchedRecord = signatoryRecords[0];
          } else if (officerRecords.length > 0) {
            matchedRecord = officerRecords[0];
          } else {
            matchedRecord = adviserRecords[0];
          }
        } catch (authErr: any) {
          // Firebase Auth failed with the entered password.
          // This happens when the user is logging in with a default student password or temporary credentials.
        }
      }

      // Never turn a Firestore password match into a local-only session.
      // Both temporary and permanent credentials must authenticate with Firebase.

      if (!authenticated || !matchedRecord) {
        setError('Incorrect password. Please enter your valid student password or account credentials.');
        return null;
      }

      const workspaces = await loadPortalWorkspaces();
      if (!workspaces.length) {
        if (officerRecords.length > 0 && officerRecords.every((record) => record.hasWebPortalAccess === false)) {
          setError('Your officer appointment does not include Web Portal access. Please contact your Club Adviser or SAS Administrator, or use the STI Sync mobile app.');
        } else {
          setError('No active organization or signatory role is available for this account. Contact SAS.');
        }
        return null;
      }
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SIGNATORY_SESSION_KEY);
      const redirectPath = workspaces.length > 1 ? '/portal/workspaces' : activatePortalWorkspace(workspaces[0]);
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
