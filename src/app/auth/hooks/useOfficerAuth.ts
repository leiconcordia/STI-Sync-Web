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

      const allRecords = [...signatoryRecords, ...officerRecords, ...adviserRecords];

      if (allRecords.length === 0) {
        setError(
          'No active organization officer, adviser, or institutional staff account found with these credentials.'
        );
        return null;
      }

      // Determine target email for Firebase Auth
      const targetEmail = (
        allRecords[0]?.email ||
        (cleanId.includes('@') ? cleanId : '')
      ).trim().toLowerCase();


      // ── 2. Authenticate: Firebase Auth vs. Permanent Password vs. Temporary Password ──
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
          // This happens when the user is logging in with a temporary password (first-time login or admin reset).
        }
      }

      // Strategy B: Check Permanent Custom / Hashed Password in Firestore (STRICTLY when requiresPasswordChange !== true)
      if (!authenticated) {
        const hashedInput = await hashPassword(trimmedPass);
        const matchingPermanentRecord = allRecords.find((rec) => {
          // If record is flagged as requiring password change, permanent password is NOT active!
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

      // Strategy C: Temporary Password ONLY for first-time login or after Admin Reset (requiresPasswordChange === true)
      if (!authenticated) {
        // STRICT RULE: Only matches if requiresPasswordChange === true!
        // Once the user changes password, requiresPasswordChange is false, so temporary password CANNOT be used again.
        const matchingTempRecord = allRecords.find(
          (rec) =>
            rec.requiresPasswordChange === true &&
            rec.temporaryPassword &&
            rec.temporaryPassword === trimmedPass
        );

        if (matchingTempRecord) {
          authenticated = true;
          matchedRecord = matchingTempRecord;

          // Determine record type
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
        setError('Incorrect password. Please enter your valid account password or temporary password.');
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
          studentName: matchedRecord.studentName || matchedRecord.name || 'Club Officer',
          email: matchedRecord.email,
          activeOrganizationId: matchedRecord.organizationId,
          activeRoleId: isAdviserUser ? 'adviser' : matchedRecord.roleId,
          isAdviser: isAdviserUser,
          isSignatory: false,
          requiresPasswordChange: matchedRecord.requiresPasswordChange ?? false,
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
