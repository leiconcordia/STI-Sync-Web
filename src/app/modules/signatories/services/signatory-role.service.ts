/**
 * src/app/modules/signatories/services/signatory-role.service.ts
 *
 * Firestore service for institutional signatory roles and hierarchy tiers.
 * Provides real-time subscriptions, CRUD operations, and automatic seeding.
 */

import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import {
  DEFAULT_SIGNATORY_ROLES,
  type SignatoryRoleDocument,
  type CreateSignatoryRolePayload,
} from '../types/signatory-role.types';

export const SIGNATORY_ROLES_COLLECTION = 'signatory_roles';

/**
 * Seed default institutional signatory roles into Firestore if collection is empty
 */
export async function seedDefaultSignatoryRoles(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, SIGNATORY_ROLES_COLLECTION));
    if (!snap.empty) return;

    for (const role of DEFAULT_SIGNATORY_ROLES) {
      const docRef = doc(db, SIGNATORY_ROLES_COLLECTION, `role_${role.code}`);
      await setDoc(docRef, {
        id: `role_${role.code}`,
        ...role,
        archived: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUid: 'system_bootstrap',
      });
    }
  } catch (err) {
    console.warn('[SignatoryRoleService] Error seeding default roles:', err);
  }
}

/**
 * Real-time subscription to active signatory roles sorted by hierarchyLevel ascending
 */
export function subscribeToSignatoryRoles(
  callback: (roles: SignatoryRoleDocument[]) => void
): () => void {
  const q = query(
    collection(db, SIGNATORY_ROLES_COLLECTION),
    orderBy('hierarchyLevel', 'asc')
  );

  return onSnapshot(
    q,
    async (snapshot) => {
      if (snapshot.empty) {
        // Trigger background seeding if first time
        seedDefaultSignatoryRoles();
        // Return default list as fallback
        const defaults: SignatoryRoleDocument[] = DEFAULT_SIGNATORY_ROLES.map((r, idx) => ({
          id: `default_${r.code}`,
          ...r,
          archived: false,
        }));
        callback(defaults);
        return;
      }

      const list: SignatoryRoleDocument[] = snapshot.docs
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            name: data.name || '',
            code: data.code || docSnap.id.replace(/^role_/, ''),
            description: data.description || '',
            hierarchyLevel: typeof data.hierarchyLevel === 'number' ? data.hierarchyLevel : 2,
            scope: data.scope || 'department',
            actionType: data.actionType || 'endorse',
            isFinalApprover: Boolean(data.isFinalApprover),
            isMandatory: data.isMandatory !== false,
            defaultTitle: data.defaultTitle || data.name || '',
            defaultDepartment: data.defaultDepartment || '',
            archived: Boolean(data.archived),
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            createdByUid: data.createdByUid,
          };
        })
        .filter((r) => !r.archived);

      // Sort by hierarchyLevel ascending, then by name
      list.sort((a, b) => a.hierarchyLevel - b.hierarchyLevel || a.name.localeCompare(b.name));
      callback(list);
    },
    (error) => {
      console.error('[SignatoryRoleService] Error subscribing to signatory roles:', error);
      // Fallback to static defaults on network/rules error
      const defaults: SignatoryRoleDocument[] = DEFAULT_SIGNATORY_ROLES.map((r) => ({
        id: `default_${r.code}`,
        ...r,
        archived: false,
      }));
      callback(defaults);
    }
  );
}

/**
 * Create a new custom signatory role
 */
export async function createSignatoryRole(
  payload: CreateSignatoryRolePayload,
  adminUid: string
): Promise<{ success: boolean; id: string; error?: string }> {
  try {
    const cleanName = payload.name.trim();
    const cleanCode = payload.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if (!cleanName) {
      throw new Error('Role name cannot be empty.');
    }
    if (!cleanCode) {
      throw new Error('Role code must contain valid alphanumeric characters.');
    }

    // ── STRICT DUPLICATE PREVENTION: Check code AND name against all active roles ──
    const allRolesSnap = await getDocs(
      query(collection(db, SIGNATORY_ROLES_COLLECTION), where('archived', '==', false))
    );

    const existingCode = allRolesSnap.docs.find(
      (d) => (d.data().code || '').toLowerCase() === cleanCode
    );
    if (existingCode) {
      throw new Error(`A signatory role with code "${cleanCode}" already exists.`);
    }

    const existingName = allRolesSnap.docs.find(
      (d) => (d.data().name || '').trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (existingName) {
      throw new Error(`A signatory role named "${cleanName}" already exists.`);
    }

    const docId = `role_${cleanCode}`;
    const docRef = doc(db, SIGNATORY_ROLES_COLLECTION, docId);

    const docData: any = {
      id: docId,
      name: cleanName,
      code: cleanCode,
      description: payload.description ? payload.description.trim() : '',
      hierarchyLevel: Number(payload.hierarchyLevel) || 2,
      scope: payload.scope || 'department',
      actionType: payload.actionType || 'endorse',
      isFinalApprover: Boolean(payload.isFinalApprover),
      isMandatory: Boolean(payload.isMandatory),
      defaultTitle: payload.defaultTitle ? payload.defaultTitle.trim() : cleanName,
      defaultDepartment: payload.defaultDepartment ? payload.defaultDepartment.trim() : '',
      archived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUid: adminUid,
    };

    await setDoc(docRef, docData);
    return { success: true, id: docId };
  } catch (err: any) {
    console.error('[SignatoryRoleService] Error creating signatory role:', err);
    return { success: false, id: '', error: err?.message || 'Failed to create signatory role' };
  }
}

/**
 * Update an existing signatory role with duplicate validation
 */
export async function updateSignatoryRole(
  roleId: string,
  updates: Partial<Omit<SignatoryRoleDocument, 'id' | 'createdAt'>>
): Promise<void> {
  // If name or code is being modified, prevent duplicates
  if (updates.name || updates.code) {
    const allRolesSnap = await getDocs(
      query(collection(db, SIGNATORY_ROLES_COLLECTION), where('archived', '==', false))
    );

    if (updates.code) {
      const cleanCode = updates.code.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const conflict = allRolesSnap.docs.find(
        (d) => d.id !== roleId && (d.data().code || '').toLowerCase() === cleanCode
      );
      if (conflict) {
        throw new Error(`Another role with code "${cleanCode}" already exists.`);
      }
      updates.code = cleanCode;
    }

    if (updates.name) {
      const cleanName = updates.name.trim().toLowerCase();
      const conflict = allRolesSnap.docs.find(
        (d) => d.id !== roleId && (d.data().name || '').trim().toLowerCase() === cleanName
      );
      if (conflict) {
        throw new Error(`Another role named "${updates.name}" already exists.`);
      }
    }
  }

  const docRef = doc(db, SIGNATORY_ROLES_COLLECTION, roleId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Soft-delete / archive a signatory role
 */
export async function archiveSignatoryRole(roleId: string): Promise<void> {
  const docRef = doc(db, SIGNATORY_ROLES_COLLECTION, roleId);
  await updateDoc(docRef, {
    archived: true,
    updatedAt: serverTimestamp(),
  });
}
