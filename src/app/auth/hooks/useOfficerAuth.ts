import { useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../../services/firebase';

const SESSION_KEY = 'sti_sync_officer_session';

export function useOfficerAuth() {
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = async (identifier: string, password: string): Promise<boolean> => {
    setIsLoggingIn(true);
    setError(null);
    try {
      const q = query(
        collection(db, 'organization_officers'),
        where('isActive', '==', true)
      );
      
      const querySnapshot = await getDocs(q);
      
      let matchedDoc = null;
      for (const doc of querySnapshot.docs) {
        const data = doc.data();
        const isMatchIdentifier = data.studentId === identifier || data.email === identifier;
        const isMatchPassword = data.temporaryPassword === password;
        
        if (isMatchIdentifier && isMatchPassword) {
          matchedDoc = data;
          break;
        }
      }

      if (matchedDoc) {
        // Create session
        const session = {
          studentId: matchedDoc.studentId,
          studentName: matchedDoc.studentName,
          email: matchedDoc.email,
          activeOrganizationId: matchedDoc.organizationId,
          activeRoleId: matchedDoc.roleId
        };
        
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return true;
      } else {
        setError('Invalid username or password.');
        return false;
      }
    } catch (e: any) {
      console.error("Login failed:", e);
      setError('An error occurred during login. Please try again.');
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  return { login, isLoggingIn, error };
}
