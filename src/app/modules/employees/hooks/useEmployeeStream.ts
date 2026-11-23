import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../../services/firebase';
import { createSingletonStream } from '../../../utils/createSingletonStream';
import type { EmployeeDocument } from '../types/employee.types';
import { EMPLOYEES_COLLECTION } from '../services/employee.service';

const employeesStream = createSingletonStream<EmployeeDocument[]>({
  initialData: [],
  start: (emit) =>
    onSnapshot(
      collection(db, EMPLOYEES_COLLECTION),
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as EmployeeDocument[];
        list.sort((a, b) =>
          (a.lastName || a.fullName || '').localeCompare(b.lastName || b.fullName || '')
        );
        emit(list);
      },
      (err) => {
        console.warn('[useEmployeeStream] Snapshot error:', err?.message);
        emit([]);
      }
    ),
});

export function useEmployees() {
  return employeesStream.use();
}
